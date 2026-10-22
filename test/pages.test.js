import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
process.env.SESSION_SECRET = 'p'.repeat(40); process.env.MOCK_LOG = '0';
delete process.env.GHL_TOKEN; delete process.env.STRIPE_SECRET_KEY;
const { MockGhl } = await import('../lib/ghl.js');
const { createPayments } = await import('../lib/payments.js');
const { createApp } = await import('../app.js');

let server, base;
before(() => { server = createApp({ ghl: new MockGhl(), payments: createPayments() }).listen(0); base = `http://localhost:${server.address().port}`; });
after(() => server.close());
const get = (p, o = {}) => fetch(base + p, { redirect: 'manual', ...o });

test('Startseite ist serverseitig gerendert: Zahlen, Ticker, Termine, Kennzahlen', async () => {
  const r = await get('/'); const h = await r.text();
  assert.equal(r.status, 200);
  for (const s of ['Zahlen, die die Debatte prägen', 'Als Nächstes', 'Zuletzt passiert', 'hero-stats', 'Kantone mit Sonderregeln', 'class="event-tile"', 'Geplant']) assert.ok(h.includes(s), s);
  assert.ok(!h.includes('<!--') || !/<!--(ZAHLEN|TICKER|EVENTS|HERO_STATS|LOGIN)-->/.test(h), 'Platzhalter ersetzt');
  assert.ok(!h.includes('%%BASE%%') && !h.includes('Platzhalter'));
  assert.ok(!h.includes('fonts.googleapis.com'));
});

test('Kantonsseiten: Inhalt, Quellen, Weiterleitung vom Kürzel, 404, indexierbar', async () => {
  const h = await (await get('/regeln/bern')).text();
  for (const s of ['Kurzzeitvermietung im Kanton Bern', 'id="interlaken"', 'class="src"', 'application/ld+json', 'rel="canonical"', 'content="index,follow"']) assert.ok(h.includes(s), s);
  const r = await get('/regeln/be'); assert.equal(r.status, 301); assert.equal(r.headers.get('location'), '/regeln/bern');
  assert.equal((await get('/regeln/zuerich')).status, 200);
  assert.equal((await get('/regeln/graubuenden')).status, 200);
  assert.equal((await get('/regeln/narnia')).status, 404);
  const idx = await (await get('/regeln')).text();
  assert.ok(idx.includes('Was in der ganzen Schweiz gilt') && idx.includes('/regeln/wallis'));
});

test('Alle 26 Kantone haben eine Seite', async () => {
  const { NAMES, slugOf } = await import('../lib/data.js');
  assert.equal(Object.keys(NAMES).length, 26);
  for (const k of Object.keys(NAMES)) assert.equal((await get('/regeln/' + slugOf(k))).status, 200, k);
});

test('Sitemap und robots.txt', async () => {
  const sm = await (await get('/sitemap.xml')).text();
  assert.ok(sm.includes('/regeln/bern') && sm.includes('/regionen/zuerich') && sm.split('<url>').length > 40);
  const rb = await (await get('/robots.txt')).text();
  assert.ok(rb.includes('Disallow: /mitglieder') && rb.includes('Sitemap:'));
});

test('Regionsseiten sind öffentlich indexierbar, Portal bleibt noindex; geplante Termine sind als solche gekennzeichnet', async () => {
  const r = await (await get('/regionen/berner-oberland')).text();
  assert.ok(r.includes('content="index,follow"') && r.includes('Interesse melden') && r.includes('noch nicht bestätigt') && !r.includes('Platzhalter'));
  const login = await (await get('/mitglieder')).text().catch(() => '');
  assert.ok(!login.includes('index,follow'));
});

test('Interessensmeldung für geplanten Termin wird mit Hinweis quittiert', async () => {
  const res = await fetch(base + '/api/events/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'io-2026-11-26', region: 'berner-oberland', name: 'Eva Test', email: 'eva@test.ch', consent: true, elapsed: 5000 }) });
  assert.equal(res.status, 200);
});
