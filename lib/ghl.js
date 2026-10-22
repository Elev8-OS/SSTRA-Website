import crypto from 'node:crypto';
import { config, isProd } from './config.js';

const API = 'https://services.leadconnectorhq.com';

/**
 * Schnittstelle (beide Clients implementieren sie):
 *  upsertContact({email, firstName, lastName, phone, companyName, tags, source}) -> {id, tags}
 *  getContactByEmail(email) -> contact | null
 *  getContactById(id) -> contact | null
 *  addTags(id, tags) / removeTags(id, tags)
 *  addNote(id, body)
 *  sendEmail(id, subject, html, { attachments })
 *  listByTag(tag) -> contact[]
 *  notify(event, payload)  (Inbound-Webhook eines GHL-Workflows)
 */
export class GhlClient {
  constructor({ token, locationId, webhookUrl }) {
    this.token = token;
    this.locationId = locationId;
    this.webhookUrl = webhookUrl;
  }

  async #req(method, path, { query, body } = {}) {
    const url = new URL(API + path);
    for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, v);
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Version: '2021-07-28',
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    if (!res.ok) {
      const err = new Error(`GHL ${method} ${path} -> ${res.status}`);
      err.status = res.status;
      err.details = data;
      throw err;
    }
    return data;
  }

  #normalize(c) {
    if (!c) return null;
    return {
      id: c.id,
      email: (c.email || '').toLowerCase(),
      firstName: c.firstName || '',
      lastName: c.lastName || '',
      companyName: c.companyName || '',
      phone: c.phone || '',
      tags: (c.tags || []).map((t) => String(t).toLowerCase())
    };
  }

  async upsertContact(c) {
    const data = await this.#req('POST', '/contacts/upsert', {
      body: {
        locationId: this.locationId,
        email: c.email,
        firstName: c.firstName,
        lastName: c.lastName,
        phone: c.phone || undefined,
        companyName: c.companyName || undefined,
        tags: c.tags,
        source: c.source || 'website'
      }
    });
    return this.#normalize(data.contact);
  }

  async getContactById(id) {
    const data = await this.#req('GET', `/contacts/${encodeURIComponent(id)}`);
    return this.#normalize(data.contact);
  }

  async getContactByEmail(email) {
    const data = await this.#req('GET', '/contacts/search/duplicate', {
      query: { locationId: this.locationId, email }
    }).catch((e) => (e.status === 404 ? null : Promise.reject(e)));
    const id = data?.contact?.id;
    if (!id) return null;
    return this.getContactById(id); // zweiter Aufruf, damit Tags sicher vollständig sind
  }

  addTags(id, tags) {
    if (!tags.length) return;
    return this.#req('POST', `/contacts/${encodeURIComponent(id)}/tags`, { body: { tags } });
  }
  removeTags(id, tags) {
    if (!tags.length) return;
    return this.#req('DELETE', `/contacts/${encodeURIComponent(id)}/tags`, { body: { tags } });
  }
  addNote(id, body) {
    return this.#req('POST', `/contacts/${encodeURIComponent(id)}/notes`, { body: { body } });
  }
  sendEmail(id, subject, html, { attachments } = {}) {
    return this.#req('POST', '/conversations/messages', {
      body: { type: 'Email', contactId: id, subject, html, ...(attachments?.length ? { attachments } : {}) }
    });
  }

  async listByTag(tag) {
    // Hinweis: Filter-Syntax der Suche beim ersten Livetest prüfen (siehe README).
    const data = await this.#req('POST', '/contacts/search', {
      body: {
        locationId: this.locationId,
        pageLimit: 100,
        filters: [{ field: 'tags', operator: 'contains', value: [tag] }]
      }
    });
    return (data.contacts || []).map((c) => this.#normalize(c));
  }

  async notify(event, payload) {
    if (!this.webhookUrl) return;
    try {
      await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event, at: new Date().toISOString(), ...payload })
      });
    } catch (e) {
      console.error('notify fehlgeschlagen', event, e.message);
    }
  }
}

/** Lokaler Ersatz für Entwicklung und Tests. Nie im Produktivbetrieb. */
export class MockGhl {
  constructor() {
    this.contacts = new Map();
    this.outbox = [];
    this.events = [];
    this.notes = [];
  }
  #find(email) { return [...this.contacts.values()].find((c) => c.email === email.toLowerCase()) || null; }
  async upsertContact(c) {
    let x = this.#find(c.email);
    if (!x) {
      x = { id: 'c_' + crypto.randomBytes(5).toString('hex'), email: c.email.toLowerCase(), tags: [] };
      this.contacts.set(x.id, x);
    }
    Object.assign(x, {
      firstName: c.firstName ?? x.firstName ?? '',
      lastName: c.lastName ?? x.lastName ?? '',
      companyName: c.companyName ?? x.companyName ?? '',
      phone: c.phone ?? x.phone ?? ''
    });
    x.tags = [...new Set([...x.tags, ...(c.tags || []).map((t) => t.toLowerCase())])];
    return structuredClone(x);
  }
  async getContactById(id) { const x = this.contacts.get(id); return x ? structuredClone(x) : null; }
  async getContactByEmail(email) { const x = this.#find(email); return x ? structuredClone(x) : null; }
  async addTags(id, tags) { const x = this.contacts.get(id); x.tags = [...new Set([...x.tags, ...tags.map((t) => t.toLowerCase())])]; }
  async removeTags(id, tags) { const x = this.contacts.get(id); const r = tags.map((t) => t.toLowerCase()); x.tags = x.tags.filter((t) => !r.includes(t)); }
  async addNote(id, body) { this.notes.push({ id, body }); }
  async sendEmail(id, subject, html, { attachments } = {}) {
    const x = this.contacts.get(id);
    this.outbox.push({ to: x.email, subject, html, attachments: attachments || [] });
    if (process.env.MOCK_LOG !== '0') console.log(`[MockGhl] E-Mail an ${x.email}: ${subject}`);
  }
  async listByTag(tag) { return [...this.contacts.values()].filter((c) => c.tags.includes(tag.toLowerCase())).map((c) => structuredClone(c)); }
  async notify(event, payload) { this.events.push({ event, ...payload }); }
}

export function createGhl() {
  if (config.ghl.token && config.ghl.locationId) return new GhlClient(config.ghl);
  if (isProd) throw new Error('GHL_TOKEN und GHL_LOCATION_ID sind im Produktivbetrieb Pflicht.');
  console.warn('[GHL] Kein Token gesetzt: lokaler Mock-Modus (Daten nur im Speicher).');
  return new MockGhl();
}
