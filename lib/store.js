/** Persistenz: Postgres (Railway), lokal und in Tests ein Speicher im Arbeitsspeicher. */
import pg from 'pg';

class MemStore {
  constructor() { this.kind = 'memory'; this.counters = new Map(); this.invoices = new Map(); }
  async nextInvoiceNumber(year) { const n = (this.counters.get(year) || 0) + 1; this.counters.set(year, n); return n; }
  async saveInvoice(r) { this.invoices.set(r.number, { ...r, status: 'offen' }); return r; }
  async getInvoice(number) { return this.invoices.get(number) || null; }
  async markInvoicePaid(number) { const r = this.invoices.get(number); if (r) r.status = 'bezahlt'; }
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
        created_at timestamptz NOT NULL DEFAULT now());`);
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
}

export const createStore = (url = process.env.DATABASE_URL) => (url ? new PgStore(url) : new MemStore());
export const store = createStore();
