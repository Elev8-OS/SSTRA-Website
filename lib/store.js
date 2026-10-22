/** Persistenz: Postgres (Railway), lokal und in Tests ein Speicher im Arbeitsspeicher. */
import pg from 'pg';

class MemStore {
  constructor() { this.kind = 'memory'; this.counters = new Map(); this.invoices = new Map(); this.partners = new Map(); }
  async nextInvoiceNumber(year) { const n = (this.counters.get(year) || 0) + 1; this.counters.set(year, n); return n; }
  async saveInvoice(r) { this.invoices.set(r.number, { ...r, status: 'offen' }); return r; }
  async getInvoice(number) { return this.invoices.get(number) || null; }
  async markInvoicePaid(number) { const r = this.invoices.get(number); if (r) r.status = 'bezahlt'; }

  // ---- Partner ----
  #pub(p) { if (!p) return null; const { logo, logoType, ...rest } = p; return { ...rest, hasLogo: Boolean(logo) }; }
  async createPartner(r) {
    if (this.partners.has(r.slug)) throw new Error('Partner existiert bereits');
    const now = new Date().toISOString();
    this.partners.set(r.slug, { name: '', contactName: '', email: '', category: '', bio: '', website: '', offerTitle: '', offerText: '', offerCode: '', offerUrl: '', offerUntil: '', ...r, status: 'eingeladen', version: 1, logo: null, logoType: '', createdAt: now, updatedAt: now });
    return this.getPartner(r.slug);
  }
  async getPartner(slug) { return this.#pub(this.partners.get(slug)); }
  async listPartners(status) { return [...this.partners.values()].filter((p) => !status || p.status === status).sort((a, b) => a.name.localeCompare(b.name, 'de')).map((p) => this.#pub(p)); }
  async saveProfile(slug, f) { const p = this.partners.get(slug); Object.assign(p, f, { updatedAt: new Date().toISOString() }); return this.#pub(p); }
  async setPartnerStatus(slug, status) { this.partners.get(slug).status = status; }
  async bumpPartnerVersion(slug) { const p = this.partners.get(slug); p.version += 1; return p.version; }
  async setLogo(slug, buf, type) { const p = this.partners.get(slug); p.logo = buf; p.logoType = type; }
  async getLogo(slug) { const p = this.partners.get(slug); return p?.logo ? { buf: p.logo, type: p.logoType } : null; }
}

class PgStore {
  constructor(url) {
    this.kind = 'postgres';
    this.pool = new pg.Pool({ connectionString: url, max: 5, ssl: process.env.PGSSL === '1' ? { rejectUnauthorized: false } : undefined });
    this.ready = this.pool.query(`
      CREATE TABLE IF NOT EXISTS invoice_counters (year int PRIMARY KEY, n int NOT NULL);
      CREATE TABLE IF NOT EXISTS invoices (
        number text PRIMARY KEY, email text NOT NULL, name text, company text, plan_key text, description text,
        amount numeric(10,2) NOT NULL, issued date NOT NULL, due date NOT NULL, reference text, status text NOT NULL DEFAULT 'offen',
        created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS partners (
        slug text PRIMARY KEY, name text NOT NULL, contact_name text, email text NOT NULL, category text, status text NOT NULL DEFAULT 'eingeladen',
        version int NOT NULL DEFAULT 1, bio text NOT NULL DEFAULT '', website text NOT NULL DEFAULT '',
        offer_title text NOT NULL DEFAULT '', offer_text text NOT NULL DEFAULT '', offer_code text NOT NULL DEFAULT '', offer_url text NOT NULL DEFAULT '', offer_until text NOT NULL DEFAULT '',
        logo bytea, logo_type text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());`);
  }
  async nextInvoiceNumber(year) {
    await this.ready;
    const r = await this.pool.query('INSERT INTO invoice_counters (year, n) VALUES ($1, 1) ON CONFLICT (year) DO UPDATE SET n = invoice_counters.n + 1 RETURNING n', [year]);
    return r.rows[0].n;
  }
  async saveInvoice(r) {
    await this.ready;
    await this.pool.query('INSERT INTO invoices (number, email, name, company, plan_key, description, amount, issued, due, reference) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [r.number, r.email, r.name, r.company, r.planKey, r.description, r.amount, r.issued, r.due, r.reference]);
    return r;
  }
  async getInvoice(number) {
    await this.ready;
    const r = await this.pool.query("SELECT number, email, name, company, plan_key AS \"planKey\", description, amount::float AS amount, to_char(issued,'YYYY-MM-DD') AS issued, to_char(due,'YYYY-MM-DD') AS due, reference, status FROM invoices WHERE number = $1", [number]);
    return r.rows[0] || null;
  }
  async markInvoicePaid(number) { await this.ready; await this.pool.query("UPDATE invoices SET status = 'bezahlt' WHERE number = $1", [number]); }

  // ---- Partner ----
  static COLS = `slug, name, contact_name AS "contactName", email, category, status, version, bio, website, offer_title AS "offerTitle", offer_text AS "offerText", offer_code AS "offerCode", offer_url AS "offerUrl", offer_until AS "offerUntil", (logo IS NOT NULL) AS "hasLogo", created_at AS "createdAt", updated_at AS "updatedAt"`;
  async createPartner(r) {
    await this.ready;
    await this.pool.query('INSERT INTO partners (slug, name, contact_name, email, category) VALUES ($1,$2,$3,$4,$5)', [r.slug, r.name, r.contactName, r.email, r.category]);
    return this.getPartner(r.slug);
  }
  async getPartner(slug) { await this.ready; return (await this.pool.query(`SELECT ${PgStore.COLS} FROM partners WHERE slug = $1`, [slug])).rows[0] || null; }
  async listPartners(status) {
    await this.ready;
    const q = status ? [`SELECT ${PgStore.COLS} FROM partners WHERE status = $1 ORDER BY lower(name)`, [status]] : [`SELECT ${PgStore.COLS} FROM partners ORDER BY lower(name)`, []];
    return (await this.pool.query(...q)).rows;
  }
  async saveProfile(slug, f) {
    await this.ready;
    await this.pool.query('UPDATE partners SET bio=$2, website=$3, offer_title=$4, offer_text=$5, offer_code=$6, offer_url=$7, offer_until=$8, status=$9, updated_at=now() WHERE slug=$1',
      [slug, f.bio, f.website, f.offerTitle, f.offerText, f.offerCode, f.offerUrl, f.offerUntil, f.status]);
    return this.getPartner(slug);
  }
  async setPartnerStatus(slug, status) { await this.ready; await this.pool.query('UPDATE partners SET status=$2, updated_at=now() WHERE slug=$1', [slug, status]); }
  async bumpPartnerVersion(slug) { await this.ready; return (await this.pool.query('UPDATE partners SET version = version + 1 WHERE slug=$1 RETURNING version', [slug])).rows[0].version; }
  async setLogo(slug, buf, type) { await this.ready; await this.pool.query('UPDATE partners SET logo=$2, logo_type=$3, updated_at=now() WHERE slug=$1', [slug, buf, type]); }
  async getLogo(slug) { await this.ready; const r = (await this.pool.query('SELECT logo, logo_type FROM partners WHERE slug=$1 AND logo IS NOT NULL', [slug])).rows[0]; return r ? { buf: r.logo, type: r.logo_type } : null; }
}

export const createStore = (url = process.env.DATABASE_URL) => (url ? new PgStore(url) : new MemStore());
export const store = createStore();
