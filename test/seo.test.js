import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
process.env.SESSION_SECRET = 's'.repeat(40); process.env.MOCK_LOG = '0';
delete process.env.GHL_TOKEN; delete process.env.STRIPE_SECRET_KEY; delete process.env.DATABASE_URL;
const { MockGhl } = await import('../lib/ghl.js');
const { createPayments } = await import('../lib/payments.js');
const { createApp } = await import('../app.js');
const { locateLocal } = await import('../lib/geo-local.js');
const { municipalityAt } = await import('../lib/address.js');

let server, base;
before(() => { server = createApp({ ghl: new MockGhl(), payments: createPayments() }).listen(0); base = `http://localhost:${server.address().port}`; });
after(() => server.close());
const txt = async (p) => { const r = await fetch(base + p, { redirect: 'manual' }); return [r, await r.text()]; };

test('Adress-Fallback: Gemeinde aus eigener Karte, auch wenn geo.admin.ch ausfällt oder nichts liefert', async () => {
  assert.equal(locateLocal(7.8632, 46.6863).name, 'Interlaken');
  assert.equal(locateLocal(8.5402, 47.3779).kanton, 'ZH');
  assert.equal(locateLocal(2.35, 48.85), null);
  const o = await municipalityAt(7.954, 47.363, async () => { throw new Error('geo.admin.ch 400'); });
  assert.deepEqual([o.name, o.kanton, o.bfs], ['Obergösgen', 'SO', 2497]);
  const leer = await municipalityAt(7.9541, 47.3631, async () => ({ results: [{ attributes: {} }] }));
  assert.equal(leer.name, 'Obergösgen');
});

test('robots.txt erlaubt KI-Crawler und schützt private Bereiche', async () => {
  const [, t] = await txt('/robots.txt');
  for (const s of ['User-agent: GPTBot', 'User-agent: ClaudeBot', 'User-agent: PerplexityBot', 'Disallow: /mitglieder', 'Disallow: /rechnung/', 'Sitemap:']) assert.ok(t.includes(s), s);
});

test('llms.txt, llms-full.txt, Markdown pro Kanton, CSV', async () => {
  const [r1, l] = await txt('/llms.txt'); assert.match(r1.headers.get('content-type'), /text\/plain/);
  assert.ok(l.startsWith('# Swiss Short Term Rental Association') && l.includes('/regeln/bern.md') && l.includes('/data/regeln.csv'));
  const [, f] = await txt('/llms-full.txt'); assert.ok(f.includes('Interlaken') && f.includes('Zahlen mit Quelle') && f.includes('(['));
  const [r3, m] = await txt('/regeln/bern.md'); assert.match(r3.headers.get('content-type'), /markdown/);
  assert.ok(m.startsWith('# Kurzzeitvermietung im Kanton Bern') && m.includes('Zitiervorschlag'));
  assert.equal((await fetch(base + '/regeln/narnia.md')).status, 404);
  const [r4, c] = await txt('/data/regeln.csv'); assert.match(r4.headers.get('content-type'), /csv/);
  assert.ok(c.includes('ebene,kanton') || c.includes('"ebene","kanton"')); assert.ok(c.split('\r\n').length > 40);
});

test('Impressum und Datenschutz: echte Texte, Adresse, ohne Platzhalter', async () => {
  const [, i] = await txt('/impressum.html'); const [, d] = await txt('/datenschutz.html');
  assert.ok(i.includes('Hauptgasse 33') && i.includes('CH-4600 Olten') && !i.includes('Platzhalter'));
  assert.ok(d.includes('GoHighLevel') && d.includes('Railway') && d.includes('EDÖB') && !d.includes('Platzhalter'));
});

test('Medienseite und Teaser auf der Startseite; Video erscheint nur, wenn die Datei vorhanden ist', async () => {
  const [, m] = await txt('/medien');
  for (const s of ['SRF', '10vor10', 'Hotel Inside', 'Tages-Anzeiger', 'So zitierst du uns', 'regeln.csv', 'Beitrag bei SRF Play ansehen']) assert.ok(m.includes(s), s);
  assert.ok(!m.includes('<video') || m.includes('srf-10vor10-2026-10-21.mp4'));
  const [, h] = await txt('/'); assert.ok(h.includes('In den Medien') && h.includes('href="/medien"') && h.includes('CHF 199') && h.includes('SRF 10vor10'));
  assert.ok(!h.includes('entsteht die erste'));
  const [, v] = await txt('/verband'); assert.ok(v.includes('CHF 199') && v.includes('Standards') && v.includes('id="mitglied"'));
  const [, a] = await txt('/aktuell'); assert.ok(a.includes('Als Nächstes') && a.includes('Zuletzt passiert') && a.includes('Zahlen, die die Debatte prägen'));
});

test('Sitemap enthält neue Seiten', async () => {
  const [, s] = await txt('/sitemap.xml'); for (const u of ['/medien', '/impressum.html', '/regeln/bern', '/aktuell', '/verband', '/studie']) assert.ok(s.includes(u), u);
});
