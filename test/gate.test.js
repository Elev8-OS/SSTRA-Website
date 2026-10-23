import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
process.env.SESSION_SECRET = 'g'.repeat(40); process.env.MOCK_LOG = '0'; process.env.SITE_PASSWORD = 'Baustelle-Test-7';
delete process.env.GHL_TOKEN; delete process.env.STRIPE_SECRET_KEY; delete process.env.DATABASE_URL;
const { MockGhl } = await import('../lib/ghl.js');
const { createPayments } = await import('../lib/payments.js');
const { createApp } = await import('../app.js');

let server, base;
before(() => { server = createApp({ ghl: new MockGhl(), payments: createPayments() }).listen(0); base = `http://localhost:${server.address().port}`; });
after(() => server.close());
const get = (p, headers = {}) => fetch(base + p, { redirect: 'manual', headers: { accept: 'text/html', ...headers } });
const login = async (password = 'Baustelle-Test-7', next = '/') => fetch(base + '/gate', { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ password, next }) });
const ROBOTS = 'noindex, nofollow, noarchive, nosnippet';

test('Ohne Zugangscode: Sperrseite mit noindex, nichts vom Inhalt', async () => {
  for (const p of ['/', '/fr/', '/aktuell', '/regeln/bern', '/mitglied-werden.html', '/sitemap.xml', '/llms.txt', '/data/regeln.json']) {
    const r = await get(p); const h = await r.text();
    assert.equal(r.status, 401, p);
    assert.equal(r.headers.get('x-robots-tag'), ROBOTS, p);
    if (!/\.(xml|txt|json)$/.test(p)) assert.ok(h.includes('noch im Aufbau') && h.includes('name="robots" content="noindex,nofollow"') && !h.includes('Regelradar'), p);
  }
});

test('API und Formulare sind gesperrt, Health-Check, Webhook und Dateien für die Sperrseite bleiben offen', async () => {
  assert.equal((await fetch(base + '/api/plans')).status, 401);
  assert.equal((await fetch(base + '/api/newsletter', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 401);
  assert.equal((await fetch(base + '/health')).status, 200);
  assert.equal((await fetch(base + '/css/site.css')).status, 200);
  const hook = await fetch(base + '/api/stripe/webhook', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(hook.status, 400, 'Webhook wird nicht von der Sperre abgefangen (sondern von der Signaturprüfung)');
});

test('robots.txt verbietet alles', async () => {
  const r = await fetch(base + '/robots.txt'); const t = await r.text();
  assert.equal(r.status, 200); assert.equal(t, 'User-agent: *\nDisallow: /\n');
});

test('Falscher Code: abgelehnt ohne Cookie. Richtiger Code: Cookie und Weiterleitung', async () => {
  const bad = await login('falsch'); assert.equal(bad.status, 401); assert.equal(bad.headers.get('set-cookie'), null);
  assert.ok((await bad.text()).includes('Der Code stimmt nicht'));
  const ok = await login(); assert.equal(ok.status, 303); assert.equal(ok.headers.get('location'), '/');
  const c = ok.headers.get('set-cookie'); assert.match(c, /site_access=/); assert.match(c, /HttpOnly/);
});

test('Mit Cookie: Website sichtbar, aber weiterhin noindex (Header und Meta), auch die Sprachversionen', async () => {
  const cookie = (await login()).headers.get('set-cookie').split(';')[0];
  for (const p of ['/', '/fr/', '/en/verband', '/regeln/bern', '/impressum.html', '/login.html']) {
    const r = await get(p, { cookie }); const h = await r.text();
    assert.equal(r.status, 200, p); assert.equal(r.headers.get('x-robots-tag'), ROBOTS, p);
    assert.ok(h.includes('name="robots" content="noindex,nofollow"') && !h.includes('content="index,follow"'), p);
  }
  assert.equal((await fetch(base + '/api/plans', { headers: { cookie } })).status, 200);
});

test('Weiterleitung nach dem Login bleibt auf der eigenen Seite (kein Open Redirect)', async () => {
  assert.equal((await login('Baustelle-Test-7', '/aktuell')).headers.get('location'), '/aktuell');
  for (const evil of ['//evil.example', 'https://evil.example', '/\\evil.example']) assert.equal((await login('Baustelle-Test-7', evil)).headers.get('location'), '/', evil);
});

test('Gefälschtes Cookie öffnet nichts', async () => {
  assert.equal((await get('/', { cookie: 'site_access=erfunden' })).status, 401);
});
