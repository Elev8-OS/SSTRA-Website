import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
process.env.SESSION_SECRET = 'p'.repeat(40); process.env.MOCK_LOG = '0';
const { MockGhl } = await import('../lib/ghl.js');
const { createStore } = await import('../lib/store.js');
const { mountPartners, partnerWallHtml, editUrl } = await import('../lib/partners.js');
const { createApp } = await import('../app.js');
const { createPayments } = await import('../lib/payments.js');

let server, base, ghl, store, role = null;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHnOcQAAAAABJRU5ErkJggg==', 'base64');
before(() => {
  ghl = new MockGhl(); store = createStore('');
  const app = express();
  app.use(express.urlencoded({ extended: false })); app.use(express.json());
  app.use((req, _res, next) => { req.user = role ? { role, email: 'x@y.ch', expired: false } : null; next(); });
  mountPartners(app, { ghl, store });
  server = app.listen(0); base = `http://localhost:${server.address().port}`;
});
after(() => server.close());
const form = (o) => new URLSearchParams(o).toString();
const post = (p, o) => fetch(base + p, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form(o) });
const path = (u) => u.replace(/^https?:\/\/[^/]+/, '');

test('Nur der Vorstand kann Partner anlegen', async () => {
  role = null; assert.equal((await post('/vorstand/partner/anlegen', { name: 'Test', email: 'a@b.ch' })).status, 303);
  assert.equal((await store.listPartners()).length, 0);
  role = 'mitglied'; assert.equal((await post('/vorstand/partner/anlegen', { name: 'Test', email: 'a@b.ch' })).status, 403);
  assert.equal((await store.listPartners()).length, 0);
});

test('Vorstand lädt ein: Partner bekommt E-Mail mit persönlichem Link, füllt Bio und Angebot aus', async () => {
  role = 'vorstand';
  const r = await post('/vorstand/partner/anlegen', { name: 'Smoobu', category: 'Wirtschaftspartner', contactName: 'Jannik Abraham', email: 'jannik@smoobu.com' });
  assert.equal(r.status, 303);
  const mail = ghl.outbox.at(-1); assert.equal(mail.to, 'jannik@smoobu.com');
  const link = /href="([^"]*\/partner\/bearbeiten\/[^"]+)"/.exec(mail.html)?.[1]; assert.ok(link, 'Link in Mail');
  assert.equal((await fetch(base + '/partner/smoobu')).status, 404); // noch nicht veröffentlicht
  role = null;
  const page = await (await fetch(base + path(link))).text();
  assert.ok(page.includes('Kurzbeschreibung') && page.includes('Angebot für Mitglieder') && page.includes('Smoobu'));
  const save = await post(path(link), { bio: 'Smoobu ist die Software für Ferienvermieter im DACH-Raum.', website: 'smoobu.com', offer: 'on', offerTitle: '20% auf das erste Jahr', offerText: 'Für Verbandsmitglieder.', offerCode: 'SSTRA20', offerUrl: 'javascript:alert(1)', offerUntil: '2099-12-31' });
  assert.equal(save.status, 303);
  const p = await store.getPartner('smoobu');
  assert.equal(p.status, 'zur-pruefung'); assert.equal(p.website, 'https://smoobu.com/'); assert.equal(p.offerUrl, ''); // gefährliche URL verworfen
  assert.equal((await fetch(base + '/partner/smoobu')).status, 404); // erst nach Freigabe
});

test('Logo-Upload prüft Bildinhalt, nicht nur den Typ', async () => {
  const link = path(editUrl(await store.getPartner('smoobu')));
  const up = (body, type) => fetch(base + link.replace('/bearbeiten/', '/logo-upload/'), { method: 'PUT', headers: { 'Content-Type': type }, body });
  assert.equal((await up('<svg onload=alert(1)>', 'image/png')).status, 415);
  assert.equal((await up('x', 'text/html')).status, 415);
  assert.equal((await up(PNG, 'image/png')).status, 200);
  assert.equal((await store.getPartner('smoobu')).hasLogo, true);
});

test('Freigabe: Profil öffentlich, Angebot nur für angemeldete Mitglieder', async () => {
  role = 'vorstand'; assert.equal((await post('/vorstand/partner/smoobu/freigeben', {})).status, 303);
  role = null;
  const pub = await (await fetch(base + '/partner/smoobu')).text();
  assert.ok(pub.includes('Smoobu ist die Software') && pub.includes('Du siehst es nach dem Login') && !pub.includes('SSTRA20'));
  const logo = await fetch(base + '/partner/logo/smoobu'); assert.equal(logo.status, 200); assert.equal(logo.headers.get('content-type'), 'image/png');
  assert.equal((await fetch(base + '/mitglieder/vorteile', { redirect: 'manual' })).status, 303);
  role = 'mitglied';
  const full = await (await fetch(base + '/partner/smoobu')).text(); assert.ok(full.includes('SSTRA20') && full.includes('20% auf das erste Jahr'));
  assert.ok((await (await fetch(base + '/mitglieder/vorteile')).text()).includes('SSTRA20'));
});

test('Startseiten-Wand verlinkt Partner mit Profil und lässt die übrigen als Text', async () => {
  const w = await partnerWallHtml(store);
  assert.ok(w.includes('href="/partner/smoobu"') && w.includes('<img src="/partner/logo/smoobu"') && w.includes('<span>Shelly</span>'));
});

test('Neuer Link macht den alten ungültig; Angebot abgelaufen wird ausgeblendet', async () => {
  const old = path(editUrl(await store.getPartner('smoobu')));
  role = 'vorstand'; await post('/vorstand/partner/smoobu/link', {});
  role = null;
  assert.equal((await fetch(base + old)).status, 404);
  assert.equal((await fetch(base + path(editUrl(await store.getPartner('smoobu'))))).status, 200);
  assert.equal((await fetch(base + old + 'x')).status, 404);
  await store.saveProfile('smoobu', { bio: 'x'.repeat(30), website: '', offerTitle: 'Alt', offerText: '', offerCode: '', offerUrl: '', offerUntil: '2020-01-01', status: 'online' });
  role = 'mitglied'; assert.ok(!(await (await fetch(base + '/mitglieder/vorteile')).text()).includes('Alt'));
});

test('Startseite der echten App läuft mit Partnerwand', async () => {
  const s = createApp({ ghl: new MockGhl(), payments: createPayments() }).listen(0);
  const h = await (await fetch(`http://localhost:${s.address().port}/`)).text(); s.close();
  assert.ok(h.includes('class="partner-wall"') && h.includes('Shelly') && !h.includes('$&'));
});
