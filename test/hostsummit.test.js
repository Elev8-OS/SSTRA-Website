import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
process.env.SESSION_SECRET = 'h'.repeat(40); process.env.MOCK_LOG = '0';
delete process.env.GHL_TOKEN; delete process.env.STRIPE_SECRET_KEY; delete process.env.DATABASE_URL;
const { MockGhl } = await import('../lib/ghl.js');
const { createPayments } = await import('../lib/payments.js');
const { createApp } = await import('../app.js');

let server, base;
before(() => { server = createApp({ ghl: new MockGhl(), payments: createPayments() }).listen(0); base = `http://localhost:${server.address().port}`; });
after(() => server.close());
const get = async (p) => { const r = await fetch(base + p); return [r, await r.text()]; };

test('Host Summit: Übersicht, Ankündigung 2027 und Rückblick 2026', async () => {
  const [, o] = await get('/hostsummit');
  assert.ok(o.includes('30. Oktober 2027') && o.includes('/hostsummit/2026') && o.includes('/hostsummit/2027'));
  const [, n] = await get('/hostsummit/2027');
  assert.ok(n.includes('Samstag, 30. Oktober 2027') && n.includes('Ort und Programm') && n.includes('CHF 199') && n.includes('"startDate":"2027-10-30"'));
  const [, v] = await get('/hostsummit/2026');
  for (const s of ['FHNW Campus Olten', 'Thomas Marbet', 'Jannik Abraham', 'Gründung des Verbands', 'Programm laut Ankündigung', 'Hotel Inside', 'Tages-Anzeiger', 'Die Fotos folgen']) assert.ok(v.includes(s), s);
  assert.equal((await fetch(base + '/hostsummit/2030')).status, 404);
});

test('Fotogalerie liest Bilder aus public/media/hostsummit-2026', async () => {
  const dir = path.join(process.cwd(), 'public/media/hostsummit-2026'); const existed = fs.existsSync(dir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'test-foto.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHnOcQAAAAABJRU5ErkJggg==', 'base64'));
  fs.writeFileSync(path.join(dir, 'captions.json'), JSON.stringify({ 'test-foto.png': 'Eröffnung im Foyer' }));
  try {
    const [, v] = await get('/hostsummit/2026');
    assert.ok(v.includes('/media/hostsummit-2026/test-foto.png') && v.includes('Eröffnung im Foyer') && !v.includes('Die Fotos folgen'));
  } finally { fs.rmSync(existed ? path.join(dir, 'test-foto.png') : dir, { recursive: true, force: true }); if (existed) fs.rmSync(path.join(dir, 'captions.json'), { force: true }); }
});

test('Startseite: Host-Summit-Teaser, Studien-Zahlen mit Kurtaxe-Hinweis, Navigation', async () => {
  const [, h] = await get('/');
  assert.ok(h.includes('Host Summit 2027') && h.includes('Rückblick 2026') && h.includes('href="/hostsummit"'));
  for (const s of ['Was die Studie zeigt', '69 %', '12 %', 'CHF 160', '78 %', 'nicht automatisch ein Regelverstoss', 'nicht repräsentativ', 'Studie, S. 21']) assert.ok(h.includes(s), s);
});

test('Sitemap, llms.txt und llms-full kennen Host Summit und Studie', async () => {
  const [, s] = await get('/sitemap.xml'); for (const u of ['/hostsummit/2027', '/hostsummit/2026', '/partner']) assert.ok(s.includes(u), u);
  const [, l] = await get('/llms.txt'); assert.ok(l.includes('/hostsummit') && l.includes('/partner'));
  const [, f] = await get('/llms-full.txt'); assert.ok(f.includes('Schweizer STR-Studie 2026') && f.includes('30. Oktober 2027') && f.includes('nicht automatisch ein Regelverstoss'));
});
