import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.ADMIN_EMAILS = 'chef@verband.ch';
process.env.SESSION_SECRET = 'x'.repeat(40);
process.env.MOCK_LOG = '0';
delete process.env.GHL_TOKEN; delete process.env.STRIPE_SECRET_KEY;

const { MockGhl } = await import('../lib/ghl.js');
const { createPayments } = await import('../lib/payments.js');
const { createApp } = await import('../app.js');
const { activateMember } = await import('../lib/membership.js');

const ghl = new MockGhl();
const payments = createPayments();
let server, base;
before(async () => { server = createApp({ ghl, payments }).listen(0); base = `http://localhost:${server.address().port}`; });
after(() => server.close());

const post = (path, body, cookie) => fetch(base + path, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
const get = (path, cookie) => fetch(base + path, { redirect: 'manual', headers: cookie ? { Cookie: cookie } : {} });
const tokenFrom = (mail) => new URL(mail.html.match(/href="([^"]*auth\/verify[^"]*)"/)[1].replace(/&amp;/g, '&')).searchParams.get('token');

async function login(email) {
  const before = ghl.outbox.length;
  const r = await post('/api/auth/login', { email });
  assert.equal(r.status, 200);
  if (ghl.outbox.length === before) return null;
  const token = tokenFrom(ghl.outbox.at(-1));
  const v = await fetch(base + '/auth/verify', { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'token=' + encodeURIComponent(token) });
  const cookie = (v.headers.get('set-cookie') || '').split(';')[0];
  return { cookie, status: v.status, token };
}

test('Health und Pläne', async () => {
  assert.equal((await get('/health')).status, 200);
  const plans = await (await get('/api/plans')).json();
  assert.equal(plans.length, 4);
});

test('Newsletter: Kontakt mit Tags, Bot wird ignoriert', async () => {
  assert.equal((await post('/api/newsletter', { email: 'bot@x.ch', consent: true, website: 'spam' })).status, 200);
  assert.equal(await ghl.getContactByEmail('bot@x.ch'), null);
  assert.equal((await post('/api/newsletter', { email: 'ok@x.ch', consent: true, elapsed: 5000 })).status, 200);
  const c = await ghl.getContactByEmail('ok@x.ch');
  assert.ok(c.tags.includes('newsletter'));
  assert.equal((await post('/api/newsletter', { email: 'ok@x.ch', consent: false, elapsed: 5000 })).status, 400);
});

test('Antrag wird als Kontakt mit Tags und Notiz angelegt', async () => {
  const r = await post('/api/apply', { plan: 'gastgeber', firstName: 'Anna', lastName: 'Muster', email: 'anna@x.ch', canton: 'LU', consent: true, payment: 'online', elapsed: 5000 });
  assert.equal(r.status, 200);
  const c = await ghl.getContactByEmail('anna@x.ch');
  assert.ok(c.tags.includes('antrag:offen') && c.tags.includes('kategorie:gastgeber') && c.tags.includes('kanton:lu'));
  assert.ok(ghl.events.some((e) => e.event === 'application.received'));
  assert.equal((await post('/api/apply', { plan: 'unbekannt', firstName: 'A', lastName: 'B', email: 'a@b.ch', consent: true, elapsed: 5000 })).status, 400);
});

test('Login: unbekannte und nicht aktivierte Adressen bekommen keinen Link, Antwort bleibt gleich', async () => {
  assert.equal(await login('niemand@x.ch'), null);
  assert.equal(await login('anna@x.ch'), null);
});

let admin;
test('Admin-Bootstrap, Magic Link ist nur einmal gültig', async () => {
  admin = await login('chef@verband.ch');
  assert.equal(admin.status, 303);
  assert.ok(admin.cookie.startsWith('vsession='));
  const again = await fetch(base + '/auth/verify', { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'token=' + encodeURIComponent(admin.token) });
  assert.equal(again.status, 400);
});

test('Ohne Login: kein Zugriff auf geschützte Bereiche', async () => {
  assert.equal((await get('/mitglieder')).status, 303);
  assert.equal((await get('/vorstand')).status, 303);
  assert.ok([401, 403].includes((await post('/api/board/approve', { contactId: 'x' })).status));
});

test('Vorstand sieht Antrag und gibt ihn frei (Rechnung, da noch kein Betrag)', async () => {
  const page = await (await get('/vorstand', admin.cookie)).text();
  assert.ok(page.includes('anna@x.ch'));
  const anna = await ghl.getContactByEmail('anna@x.ch');
  const r = await post('/api/board/approve', { contactId: anna.id }, admin.cookie);
  assert.equal((await r.json()).mode, 'invoice');
  const c = await ghl.getContactById(anna.id);
  assert.ok(c.tags.includes('antrag:freigegeben') && !c.tags.includes('antrag:offen'));
});

test('Zahlung bestätigen aktiviert Mitglied, idempotent', async () => {
  const anna = await ghl.getContactByEmail('anna@x.ch');
  assert.equal((await post('/api/board/mark-paid', { contactId: anna.id }, admin.cookie)).status, 200);
  const c = await ghl.getContactById(anna.id);
  assert.ok(c.tags.includes('status:aktiv') && c.tags.includes('rolle:mitglied'));
  assert.ok(c.tags.some((t) => t.startsWith('bis:')) && c.tags.some((t) => t.startsWith('seit:')));
  const mails = ghl.outbox.length;
  const res = await activateMember({ ghl, email: 'anna@x.ch', planKey: 'gastgeber', ref: 'cs_test_1' });
  const res2 = await activateMember({ ghl, email: 'anna@x.ch', planKey: 'gastgeber', ref: 'cs_test_1' });
  assert.equal(res.already, false);
  assert.equal(res2.already, true);
  assert.equal(ghl.outbox.length, mails + 1);
});

let member;
test('Mitglied: Zugriff auf Mitgliederbereich, nicht auf Vorstand', async () => {
  member = await login('anna@x.ch');
  assert.equal(member.status, 303);
  const home = await (await get('/mitglieder', member.cookie)).text();
  assert.ok(home.includes('Hallo Anna') && home.includes('Verhaltenskodex') && home.includes('Steuern und Kurtaxe'));
  assert.ok(!home.includes('Fördermitglieder'));
  assert.equal((await get('/vorstand', member.cookie)).status, 403);
  const anna = await ghl.getContactByEmail('anna@x.ch');
  assert.equal((await post('/api/board/approve', { contactId: anna.id }, member.cookie)).status, 403);
  assert.equal((await post('/api/board/role', { contactId: anna.id, role: 'vorstand' }, member.cookie)).status, 403);
  assert.equal((await get('/mitglieder/dok/protokoll-vorlage', member.cookie)).status, 404);
  assert.equal((await get('/mitglieder/dok/partner-info', member.cookie)).status, 404);
  assert.equal((await get('/mitglieder/dok/kodex', member.cookie)).status, 200);
});

test('Admin befördert Mitglied zum Vorstand, dann Zugriff auf Vorstandsunterlagen', async () => {
  const anna = await ghl.getContactByEmail('anna@x.ch');
  assert.equal((await post('/api/board/role', { contactId: anna.id, role: 'vorstand' }, admin.cookie)).status, 200);
  // Cache der Session läuft nach 30 s ab; neuer Login holt den frischen Zustand
  const again = await login('anna@x.ch');
  assert.equal((await get('/vorstand', again.cookie)).status, 200);
  assert.equal((await get('/mitglieder/dok/protokoll-vorlage', again.cookie)).status, 200);
  // Vorstand (nicht Admin) darf keine Rollen vergeben
  assert.equal((await post('/api/board/role', { contactId: anna.id, role: 'mitglied' }, again.cookie)).status, 403);
});

test('Fördermitglied sieht nur Partner-Inhalte; abgelaufener Beitrag sperrt Inhalte', async () => {
  await post('/api/apply', { plan: 'foerdermitglied', firstName: 'Pia', lastName: 'Partner', email: 'pia@partner.ch', consent: true, payment: 'rechnung', elapsed: 5000 });
  await activateMember({ ghl, email: 'pia@partner.ch', planKey: 'foerdermitglied', ref: 'cs_p' });
  const pia = await login('pia@partner.ch');
  const home = await (await get('/mitglieder', pia.cookie)).text();
  assert.ok(home.includes('Fördermitglieder') && !home.includes('Steuern und Kurtaxe'));
  assert.equal((await get('/vorstand', pia.cookie)).status, 403);
  // abgelaufen
  const c = await ghl.getContactByEmail('pia@partner.ch');
  await ghl.removeTags(c.id, c.tags.filter((t) => t.startsWith('bis:')));
  await ghl.addTags(c.id, ['bis:2020-01-01']);
  const fresh = await login('pia@partner.ch');
  const page = await (await get('/mitglieder', fresh.cookie)).text();
  assert.ok(page.includes('abgelaufen') && !page.includes('Informationen für Fördermitglieder'));
  assert.equal((await get('/mitglieder/dok/kodex', fresh.cookie)).status, 404);
});

test('Entzug der Rolle sperrt Zugang beim nächsten Login', async () => {
  const c = await ghl.getContactByEmail('pia@partner.ch');
  await ghl.removeTags(c.id, ['status:aktiv', 'rolle:foerdermitglied']);
  assert.equal(await login('pia@partner.ch'), null);
});

test('Herkunft: www und ohne www gelten, fremde Herkunft nicht; Alias-Host wird umgeleitet', async () => {
  const { allowedOrigins } = await import('../lib/auth.js');
  process.env.BASE_URL = 'https://www.sstra.ch';
  const { config } = await import('../lib/config.js');
  const prev = config.baseUrl; config.baseUrl = 'https://www.sstra.ch';
  try {
    assert.deepEqual(allowedOrigins().sort(), ['https://sstra.ch', 'https://www.sstra.ch']);
    const bad = await fetch(base + '/api/newsletter', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://boese.example' }, body: '{}' });
    assert.equal(bad.status, 403);
    const okNoWww = await fetch(base + '/api/newsletter', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://sstra.ch' }, body: '{}' });
    assert.notEqual(okNoWww.status, 403);
    const http = await import('node:http');
    const r = await new Promise((resolve) => http.get({ port: server.address().port, path: '/regionen', headers: { Host: 'sstra.ch' } }, resolve));
    assert.equal(r.statusCode, 301); assert.equal(r.headers.location, 'https://www.sstra.ch/regionen');
  } finally { config.baseUrl = prev; }
});
