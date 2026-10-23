import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
process.env.SESSION_SECRET = 'l'.repeat(40); process.env.MOCK_LOG = '0';
delete process.env.GHL_TOKEN; delete process.env.STRIPE_SECRET_KEY; delete process.env.DATABASE_URL;
const { MockGhl } = await import('../lib/ghl.js');
const { createPayments } = await import('../lib/payments.js');
const { createApp } = await import('../app.js');
const { TRANSLATED, missingStrings } = await import('../lib/i18n.js');

let server, base;
before(() => { server = createApp({ ghl: new MockGhl(), payments: createPayments() }).listen(0); base = `http://localhost:${server.address().port}`; });
after(() => server.close());
const BROWSER = 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/120 Safari/537.36';
const get = (p, headers = {}) => fetch(base + p, { redirect: 'manual', headers });
const txt = async (p, headers) => { const r = await get(p, headers); return [r, await r.text()]; };

test('Alle übersetzten Seiten sind in fr, it und en vollständig (keine deutschen Reste)', async () => {
  for (const p of TRANSLATED) {
    const html = await (await get(p)).text();
    for (const l of ['fr', 'it', 'en']) assert.deepEqual(missingStrings(html, l), [], `${p} (${l}) hat unübersetzte Texte, siehe npm run i18n:check`);
  }
});

test('Sprachpräfix: Sprache, Links, Canonical, hreflang und Umschalter', async () => {
  for (const [l, htmlLang, probe] of [['fr', 'fr-CH', 'Devenir membre'], ['it', 'it-CH', 'Diventa socio'], ['en', 'en', 'Become a member']]) {
    const [r, h] = await txt(`/${l}/verband`);
    assert.equal(r.status, 200);
    assert.ok(h.includes(`<html lang="${htmlLang}"`) && h.includes(probe), l);
    assert.ok(!h.includes('>Mitglied werden<'), 'keine deutschen Reste in der Navigation');
    assert.ok(h.includes(`href="/${l}/aktuell"`) && h.includes('href="/css/site.css"') && !h.includes(`"/${l}/css/`), 'Seitenlinks mit Präfix, Dateien ohne');
    assert.ok(h.includes(`rel="canonical" href="`) && h.includes(`/${l}/verband"`));
    for (const x of ['de', 'fr', 'it', 'en']) assert.ok(h.includes(`hreflang="${x}" href=`), `hreflang ${x}`);
    assert.ok(h.includes('hreflang="x-default"') && h.split('data-lang="').length >= 9, 'Umschalter mit vier Sprachen (Leiste und Menü)');
  }
  const [, home] = await txt('/it/');
  assert.ok(home.includes('La voce degli host svizzeri.') && home.includes('href="/it/verband"'));
});

test('Deutsche Seiten tragen hreflang, Umschalter und Sprach-CSS, Wechsel führt auf Präfix-URL', async () => {
  const [, h] = await txt('/aktuell');
  assert.ok(h.includes('<html lang="de-CH"') && h.includes('hreflang="fr" href="') && h.includes('/css/lang.css') && h.includes('href="/fr/aktuell"') && h.includes('href="/aktuell"'));
});

test('Erkennung: Browsersprache leitet die Startseite um, sonst nie', async () => {
  const at = async (headers, p = '/') => { const r = await get(p, { 'user-agent': BROWSER, ...headers }); return [r.status, r.headers.get('location')]; };
  assert.deepEqual(await at({ 'accept-language': 'fr-CH,fr;q=0.9,en;q=0.5' }), [302, '/fr/']);
  assert.deepEqual(await at({ 'accept-language': 'en;q=0.4,it;q=0.9' }), [302, '/it/']);
  assert.deepEqual(await at({ 'accept-language': 'de-CH,de;q=0.9,fr;q=0.5' }), [200, null]);
  assert.deepEqual(await at({ 'accept-language': 'pl,ru' }), [200, null], 'unbekannte Sprache bleibt deutsch');
  assert.deepEqual(await at({ 'accept-language': 'fr', cookie: 'lang=de' }), [200, null], 'bewusste Wahl (Cookie) gewinnt');
  assert.deepEqual(await at({ cookie: 'lang=en' }), [302, '/en/'], 'Cookie ohne Browsersprache');
  assert.deepEqual(await at({ 'accept-language': 'fr', referer: base + '/fr/' }), [200, null], 'interner Klick leitet nicht um');
  assert.deepEqual(await at({ 'accept-language': 'fr', 'user-agent': 'Googlebot/2.1' }), [200, null], 'Suchmaschinen bekommen immer Deutsch');
  assert.deepEqual(await at({ 'accept-language': 'fr' }, '/aktuell'), [200, null], 'nur die Startseite wird umgeleitet');
  const r = await get('/', { 'user-agent': BROWSER, 'accept-language': 'fr' });
  assert.match(r.headers.get('cache-control') || '', /no-store/);
});

test('Besuch eines Präfix-URLs merkt sich die Sprache im Cookie', async () => {
  const r = await get('/fr/aktuell');
  assert.match(r.headers.get('set-cookie') || '', /lang=fr/);
  assert.equal((await get('/css/site.css')).headers.get('set-cookie'), null, 'Dateien setzen kein Cookie');
});

test('Nicht übersetzte Seiten: deutscher Inhalt mit Hinweis, Kopf und Fuss in der Sprache, Canonical deutsch', async () => {
  const [r, h] = await txt('/fr/regeln/bern');
  assert.equal(r.status, 200);
  assert.ok(h.includes('class="lang-note"') && h.includes("Cette page n'est actuellement disponible qu'en allemand."));
  assert.ok(h.includes('Kurzzeitvermietung im Kanton Bern') && h.includes('Devenir membre') && h.includes('Mentions légales'));
  const canon = /rel="canonical" href="([^"]*)"/.exec(h)[1]; assert.ok(canon.endsWith('/regeln/bern') && !canon.includes('/fr/'), 'Canonical zeigt auf die deutsche Seite');
  assert.ok(!/hreflang="fr" href="[^"]*regeln\/bern/.test(h), 'kein hreflang für nur deutsche Seiten');
  const r2 = await get('/fr/regeln/be'); assert.equal(r2.status, 301); assert.equal(r2.headers.get('location'), '/fr/regeln/bern', 'Weiterleitung behält die Sprache');
});

test('Formularseiten sind übersetzt, die Schnittstellen bleiben unverändert', async () => {
  const [, l] = await txt('/fr/login.html'); assert.ok(l.includes('Connexion des membres') && l.includes('lang="fr-CH"'));
  const [, a] = await txt('/en/mitglied-werden.html'); assert.ok(a.includes('Become a member') && a.includes('First name *') && a.includes('<option value="ge">Geneva</option>'));
  const [, a2] = await txt('/mitglied-werden.html'); assert.ok(a2.includes('Vorname *'));
  const plans = await (await get('/api/plans')).json(); assert.equal(plans[0].name, 'Gastgeber');
  assert.equal((await get('/fr/api/plans')).status, 404, 'Schnittstellen haben kein Präfix');
});

test('Browser-Skript: T() übersetzt, ersetzt Platzhalter und fällt auf Deutsch zurück', async () => {
  const [r, js] = await txt('/js/i18n.js?l=fr');
  assert.match(r.headers.get('content-type'), /javascript/);
  assert.ok(js.includes('"Menü":"Menu"') && js.includes('"Genf":"Genève"') && js.includes('window.T='));
  const win = {}; new Function('window', 'document', js)(win, { addEventListener() {} });
  assert.equal(win.T('Stand {date}', { date: '21.10.2026' }), 'État au 21.10.2026');
  assert.equal(win.T('Alle Gemeinden ({n})', { n: 5 }), 'Toutes les communes (5)');
  assert.equal(win.T('Unbekannter Text'), 'Unbekannter Text');
  assert.equal(win.T('Kanton {name}', { name: win.T('Wallis') }), 'Canton : Valais');
  const [, de] = await txt('/js/i18n.js?l=xx'); assert.ok(!de.includes('Genève'), 'unbekannte Sprache liefert Deutsch');
});
