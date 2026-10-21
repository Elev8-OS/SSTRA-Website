import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

process.env.SESSION_SECRET = 'y'.repeat(40);
process.env.MOCK_LOG = '0';
delete process.env.GHL_TOKEN; delete process.env.STRIPE_SECRET_KEY; delete process.env.ADMIN_EMAILS;

const { MockGhl } = await import('../lib/ghl.js');
const { createPayments } = await import('../lib/payments.js');
const { createApp } = await import('../app.js');
const { mountDemo } = await import('../lib/demo.js');

let server, base;
before(async () => {
  const ghl = new MockGhl();
  const root = express();
  assert.equal(await mountDemo(root, { ghl }), true);
  root.use(createApp({ ghl, payments: createPayments() }));
  server = root.listen(0); base = `http://localhost:${server.address().port}`;
});
after(() => server.close());

const demoLogin = async (key) => {
  const r = await fetch(base + '/demo/login', { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'key=' + key });
  return { status: r.status, location: r.headers.get('location'), cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
};
const get = (p, c) => fetch(base + p, { redirect: 'manual', headers: c ? { Cookie: c } : {} });

test('Demo-Seite und Status', async () => {
  assert.equal((await get('/demo')).status, 200);
  assert.deepEqual(await (await get('/api/demo-status')).json(), { demo: true });
});

test('Rollen sehen das Richtige', async () => {
  const m = await demoLogin('mitglied');
  assert.equal(m.location, '/mitglieder');
  const home = await (await get('/mitglieder', m.cookie)).text();
  assert.ok(home.includes('Hallo Anna') && home.includes('Verhaltenskodex'));
  assert.equal((await get('/vorstand', m.cookie)).status, 403);

  const a = await demoLogin('abgelaufen');
  assert.ok((await (await get('/mitglieder', a.cookie)).text()).includes('Beitrag erneuern'));

  const v = await demoLogin('vorstand');
  const board = await (await get('/vorstand', v.cookie)).text();
  assert.equal(v.location, '/vorstand');
  assert.ok(board.includes('Peter') && board.includes('Freigeben') && !board.includes('data-role-for'));

  const ad = await demoLogin('admin');
  assert.ok((await (await get('/vorstand', ad.cookie)).text()).includes('data-role-for'));
});

test('Unbekannte Demo-Rolle wird abgelehnt', async () => {
  const r = await fetch(base + '/demo/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'key=hacker' });
  assert.equal(r.status, 400);
});

test('Regionen: Übersicht, Detailseite, Anmeldung zum Stammtisch', async () => {
  assert.equal((await get('/regionen')).status, 200);
  const r = await get('/regionen/zuerich');
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.ok(html.includes('Stammtisch Zürich') && html.includes('Regelradar'));
  assert.equal((await get('/regionen/nirgendwo')).status, 404);
  const ev = await (await get('/api/events')).json();
  assert.ok(ev.events.length >= 1 && ev.events[0].slug);
  const post = (b) => fetch(base + '/api/events/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  assert.equal((await post({ event: 'zh-2026-11-19', region: 'zuerich', name: 'Reto Test', email: 'reto@test.ch', consent: true, elapsed: 5000 })).status, 200);
  assert.equal((await post({ event: 'gibtsnicht', region: 'zuerich', name: 'X Y', email: 'x@y.ch', consent: true, elapsed: 5000 })).status, 400);
});
