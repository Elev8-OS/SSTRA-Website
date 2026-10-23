/**
 * Serverseitig gerenderte, suchmaschinenfähige Seiten:
 *  /               Startseite mit Zahlen, Ticker, Terminen (Platzhalter in public/index.html)
 *  /regeln         Überblick aller Kantone
 *  /regeln/:slug   eine Seite pro Kanton mit allen Regeln und Quellen
 * robots.txt, sitemap.xml, llms.txt und CSV: siehe seo.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { config, isProd } from './config.js';
import { esc, page } from './views.js';
import { mediaTeaserHtml } from './media.js';
import { partnerWallHtml } from './partners.js';
import { hostSummitTeaserHtml } from './hostsummit.js';
import { store } from './store.js';
import { rules, regionen, aktuell, studie, NAMES, slugOf, slugify, codeOfSlug, fmtDate, upcomingEvents } from './data.js';

const here = path.dirname(new URL(import.meta.url).pathname);
const TYPE_ORDER = ['limit', 'register', 'fee', 'talk', 'none'];
const GROUP_TITLE = { limit: 'Beschränkung', register: 'Registrierung / Bewilligung', fee: 'Abgaben via Plattform', talk: 'In Diskussion', none: 'Keine Sonderregel bekannt' };

const srcLink = (q, label = 'Quelle') => (q ? ` <a class="src" href="${esc(q)}" target="_blank" rel="noopener">${label}</a>` : '');
const list = (items) => `<ul class="srcs">${items.map((i) => `<li>${esc(i.t)}${srcLink(i.q)}</li>`).join('')}</ul>`;
const badge = (R, typ) => `<span class="badge ${typ}">${esc(R.typen[typ])}</span>`;
const bfsCount = (k) => (k.gemeinden || []).reduce((n, g) => n + (g.bfs?.length || 1), 0);

function stats() {
  const R = rules(); const src = new Set();
  const add = (items = []) => items.forEach((i) => i.q && src.add(i.q));
  add(R.bund.items);
  let nGem = 0, nCant = 0;
  for (const k of Object.values(R.kantone)) {
    if (k.typ !== 'none') nCant++;
    add(k.kantonal);
    for (const g of k.gemeinden || []) { nGem += g.bfs?.length || 1; add(g.items); }
  }
  return { nCant, nGem, nSrc: src.size, stand: R.stand };
}

/* ---------- Bausteine der Startseite ---------- */
function heroStats() {
  const s = stats();
  return `<dl class="hero-stats" aria-label="Umfang des Regelradars"><div><dt>Kantone mit Sonderregeln</dt><dd>${s.nCant}</dd></div><div><dt>Gemeinden erfasst</dt><dd>${s.nGem}</dd></div><div><dt>Quellen verlinkt</dt><dd>${s.nSrc}</dd></div><div><dt>Stand</dt><dd>${fmtDate(s.stand)}</dd></div></dl>`;
}

function zahlenHtml() {
  const A = aktuell();
  return `<section class="facts" id="zahlen" aria-labelledby="zahlenH"><div class="wrap"><h2 id="zahlenH" class="display h-l">Zahlen, die die Debatte prägen</h2>
<div class="fact-grid">${A.zahlen.map((z) => `<figure class="fact"><strong>${esc(z.wert)}</strong><figcaption>${esc(z.text)}<span class="fact-links">${srcLink(z.q).trim()}<a class="src" href="/regeln/${slugOf(z.kanton)}">Regeln in ${esc(NAMES[z.kanton])}</a></span></figcaption></figure>`).join('')}</div>
<p class="fact-note">Alle Zahlen stammen aus öffentlichen Quellen. Marktdaten liefert die Schweizer STR-Studie 2026 der HES-SO Valais-Wallis.</p></div></section>`;
}

function tickerHtml() {
  const A = aktuell();
  const where = (e) => {
    if (!e.kanton || e.kanton === 'CH') return '/regeln#bund';
    return `/regeln/${slugOf(e.kanton)}${e.gemeinde ? '#' + slugify(e.gemeinde) : ''}`;
  };
  const row = (e) => {
    const when = e.datum && e.genau !== false ? `<time datetime="${esc(e.datum)}">${esc(e.anzeige)}</time>` : e.datum ? `<time datetime="${esc(e.datum.slice(0, 7))}">${esc(e.anzeige)}</time>` : `<span class="when-open">${esc(e.anzeige)}</span>`;
    return `<li>${when}<div><span class="kind">${esc(e.art)}</span><strong>${esc(e.titel)}</strong><span class="where">${esc(e.ort)}</span></div><div class="links"><a href="${where(e)}">Zur Regel</a>${srcLink(e.q)}</div></li>`;
  };
  const next = A.ticker.filter((e) => e.kommend).sort((a, b) => (a.datum || '9999').localeCompare(b.datum || '9999'));
  const past = A.ticker.filter((e) => !e.kommend).sort((a, b) => b.datum.localeCompare(a.datum));
  return `<h3 class="ticker-sub">Als Nächstes</h3><ul class="ticker-list">${next.map(row).join('')}</ul>
<h3 class="ticker-sub">Zuletzt passiert</h3><ul class="ticker-list">${past.map(row).join('')}</ul>`;
}

function studieZahlenHtml() {
  const S = studie();
  return `<section class="study-facts" id="studie-zahlen" aria-labelledby="szH"><div class="wrap"><h2 id="szH" class="display h-l">Was die Studie zeigt</h2>
<div class="fact-grid cols3">${S.zahlen.map((z) => `<figure class="fact"><strong>${esc(z.wert)}</strong><figcaption>${esc(z.text)}${z.hinweis ? `<span class="fact-hint">${esc(z.hinweis)}</span>` : ''}<span class="page-ref">Studie, S. ${esc(z.seite)}</span></figcaption></figure>`).join('')}</div>
<p class="fact-note">${esc(S.methode)} Quelle: ${esc(S.quelle)}.</p></div></section>`;
}

function eventsHtml() {
  const ev = upcomingEvents(6);
  if (!ev.length) return '<p>Die ersten Termine werden gerade geplant.</p>';
  return ev.map((e) => `<a class="event-tile" href="/regionen/${esc(e.slug)}"><time datetime="${esc(e.datum)}">${fmtDate(e.datum)}</time>${e.status === 'geplant' ? '<span class="tag-planned">Geplant</span>' : ''}<strong>${esc(e.titel)}</strong><span>${esc(e.region)} · ${esc(e.ort)}</span></a>`).join('');
}

function renderHome(req, wall = '') {
  const tpl = fs.readFileSync(path.join(here, '../public/index.html'), 'utf8');
  const login = req.user ? '<a class="login-link" href="/mitglieder">Mitgliederbereich</a>' : '<a class="login-link" href="/login.html">Login</a>';
  return tpl
    .replace(/<!--LOGIN-->/g, () => login)
    .replace('<!--HERO_STATS-->', () => heroStats())
    .replace('<!--ZAHLEN-->', () => zahlenHtml())
    .replace('<!--TICKER-->', () => tickerHtml())
    .replace('<!--EVENTS-->', () => eventsHtml())
    .replace('<!--MEDIEN-->', () => mediaTeaserHtml())
    .replace('<!--HOSTSUMMIT-->', () => hostSummitTeaserHtml())
    .replace('<!--STUDIE_ZAHLEN-->', () => studieZahlenHtml())
    .replace(/<div class="partner-wall">[\s\S]*?<\/div>/, (m) => wall || m)
    .replace('href="mailto:info@hostsummit.ch?subject=Schweizer%20STR-Studie%202026">Studie anfordern', (m) => (fs.existsSync(path.join(here, '../public/media/str-studie-2026.pdf')) ? 'href="/media/str-studie-2026.pdf" download>Studie herunterladen (PDF)' : m))
    .replace(/%%BASE%%/g, config.baseUrl);
}

/* ---------- /regeln ---------- */
function indexPage(req, res) {
  const R = rules();
  const groups = TYPE_ORDER.map((t) => [t, Object.keys(NAMES).filter((k) => (R.kantone[k]?.typ || 'none') === t).sort((a, b) => NAMES[a].localeCompare(NAMES[b], 'de'))]).filter(([, ks]) => ks.length);
  const s = stats();
  const body = `<nav class="crumbs" aria-label="Brotkrumen"><a href="/">Start</a> › Regelradar</nav>
<h1 class="display h-l">Kurzzeitvermietung in der Schweiz: Regeln pro Kanton</h1>
<p class="lead" style="margin:20px 0 28px">Die Schweiz kennt kein nationales Kurzzeitmietgesetz. Regeln machen Kantone und Gemeinden. Hier steht, was in welchem Kanton gilt, mit Quelle zu jeder Aussage. Stand ${fmtDate(R.stand)}.</p>
<p class="meta-line"><a class="btn btn-red" href="/#regeln">Interaktive Karte öffnen</a><span>${s.nCant} Kantone mit Sonderregeln · ${s.nGem} Gemeinden · ${s.nSrc} Quellen</span></p>
${groups.map(([t, ks]) => `<section class="rule-group" id="${t}"><h2>${GROUP_TITLE[t]} <small>${ks.length} Kantone</small></h2><div class="region-grid">${ks.map((k) => { const n = bfsCount(R.kantone[k] || {}); return `<a class="region-card" href="/regeln/${slugOf(k)}"><h3>${esc(NAMES[k])}</h3><p>${n ? `${n} Gemeinden mit eigenen Regeln erfasst` : t === 'none' ? 'Keine Sonderregel bekannt' : 'Kantonale Regel'}</p></a>`; }).join('')}</div></section>`).join('')}
<section id="bund" class="rule-group"><h2>Was in der ganzen Schweiz gilt</h2>${list(R.bund.items)}</section>
<p class="note">${esc(R.hinweis)}</p>`;
  res.send(page({ title: 'Regelradar: Kurzzeitvermietung pro Kanton', user: req.user, publicNav: true, index: true, wide: true, canonical: '/regeln',
    jsonld: { '@context': 'https://schema.org', '@type': 'Dataset', name: 'Regelradar Kurzzeitvermietung Schweiz', description: `Regeln für Airbnb und Kurzzeitvermietung in allen 26 Schweizer Kantonen und ${s.nGem} Gemeinden, mit Quelle pro Aussage.`, url: config.baseUrl + '/regeln', inLanguage: 'de-CH', dateModified: R.stand, spatialCoverage: 'Schweiz', creator: { '@type': 'Organization', name: 'Schweizer Verband für Kurzzeitvermietung (SSTRA)', url: config.baseUrl }, distribution: [{ '@type': 'DataDownload', encodingFormat: 'application/json', contentUrl: config.baseUrl + '/data/regeln.json' }, { '@type': 'DataDownload', encodingFormat: 'text/csv', contentUrl: config.baseUrl + '/data/regeln.csv' }] },
    description: `Was gilt für Airbnb und Kurzzeitvermietung in der Schweiz? Die Regeln aller 26 Kantone und ${s.nGem} Gemeinden, mit Quellen. Stand ${fmtDate(R.stand)}.`, body }));
}

/* ---------- /regeln/:slug ---------- */
function cantonPage(req, res) {
  const k = codeOfSlug(req.params.slug);
  if (!k) return res.status(404).send(page({ title: 'Nicht gefunden', user: req.user, publicNav: true, body: '<div class="card narrow"><h1 class="display h-m">Kanton nicht gefunden</h1><p><a href="/regeln">Alle Kantone</a></p></div>' }));
  if (req.params.slug !== slugOf(k)) return res.redirect(301, `/regeln/${slugOf(k)}`);
  const R = rules();
  const kk = R.kantone[k] || { typ: 'none', kantonal: [], gemeinden: [] };
  const name = NAMES[k]; const nGem = bfsCount(kk);
  const regs = regionen().regionen.filter((r) => r.kantone.includes(k));
  const url = `/regeln/${slugOf(k)}`;
  const desc = `Regeln für Airbnb und Kurzzeitvermietung im Kanton ${name}: ${R.typen[kk.typ]}${nGem ? `, dazu ${nGem} Gemeinden mit eigenen Regeln` : ''}. Mit Quellen, Stand ${fmtDate(R.stand)}.`;
  const body = `<nav class="crumbs" aria-label="Brotkrumen"><a href="/">Start</a> › <a href="/regeln">Regelradar</a> › Kanton ${esc(name)}</nav>
<h1 class="display h-l">Kurzzeitvermietung im Kanton ${esc(name)}</h1>
<p class="meta-line">${badge(R, kk.typ)}<span>Stand ${fmtDate(R.stand)} · Zusammenstellung des Verbands auf Basis öffentlicher Quellen</span></p>
<div class="rule-layout"><article class="rule-body">
<section><h2>Kantonale Regeln</h2>${kk.kantonal.length ? list(kk.kantonal) : `<p>Für den Kanton ${esc(name)} ist uns keine kantonale Sonderregel bekannt. Es gelten die allgemeinen Pflichten (Steuern, Gästemeldung, Kurtaxe der Gemeinde). Das heisst nicht, dass es keine lokalen Regeln gibt: Gemeinden können eigene erlassen.</p>`}</section>
${kk.gemeinden.length ? `<section><h2>Gemeinden mit eigenen Regeln</h2>${kk.gemeinden.map((g) => `<h3 id="${slugify(g.name)}">${esc(g.name)} ${badge(R, g.typ)}</h3>${list(g.items)}`).join('')}</section>` : ''}
<section><h2>Immer zu beachten</h2><p>Einkommenssteuer auf Mieterträgen, Mehrwertsteuerpflicht ab CHF 100'000 Umsatz, Meldepflicht für ausländische Gäste, Zustimmung des Vermieters bei Untermiete. <a href="/regeln#bund">Alle Regeln, die schweizweit gelten</a>.</p></section>
<p class="note">${esc(R.hinweis)}</p></article>
<aside class="rule-side">
<div class="card"><h2 class="h-m">Auf der Karte</h2><p>Gemeinden anklicken, Adresse prüfen.</p><p style="margin-top:14px"><a class="btn btn-black" href="/#regeln/${k}">Zur Karte</a></p></div>
${regs.length ? `<div class="card"><h2 class="h-m">Stammtisch in der Region</h2><ul class="doclist">${regs.map((r) => `<li><a href="/regionen/${esc(r.slug)}">${esc(r.name)}</a><span>${esc(r.intro.split('. ')[0])}.</span></li>`).join('')}</ul></div>` : ''}
<div class="card"><h2 class="h-m">Regel fehlt oder ist falsch?</h2><p>Hilf mit, das Regelradar aktuell zu halten.</p><p style="margin-top:14px"><a class="btn btn-line-dark" href="mailto:info@hostsummit.ch?subject=${encodeURIComponent('Regelradar Kanton ' + name)}">Hinweis senden</a></p></div>
</aside></div>
<nav class="chips-nav" aria-label="Weitere Kantone">${Object.keys(NAMES).sort((a, b) => NAMES[a].localeCompare(NAMES[b], 'de')).map((c) => `<a href="/regeln/${slugOf(c)}"${c === k ? ' aria-current="page"' : ''}>${esc(NAMES[c])}</a>`).join('')}</nav>`;
  res.send(page({ title: `Kurzzeitvermietung im Kanton ${name}`, user: req.user, publicNav: true, index: true, wide: true, canonical: url, description: desc, extraHead: `<link rel="alternate" type="text/markdown" href="${url}.md">`,
    jsonld: { '@context': 'https://schema.org', '@type': 'Article', headline: `Kurzzeitvermietung im Kanton ${name}: Regeln und Quellen`, dateModified: R.stand, inLanguage: 'de-CH', mainEntityOfPage: config.baseUrl + url, publisher: { '@type': 'Organization', name: 'Schweizer Verband für Kurzzeitvermietung', url: config.baseUrl } },
    body }));
}

export function mountRulePages(app) {
  app.get('/', async (req, res) => {
    const wall = await partnerWallHtml(store).catch((e) => { console.error('Partnerwand:', e.message); return ''; });
    res.set('Cache-Control', isProd ? 'public, max-age=300' : 'no-cache'); res.type('html').send(renderHome(req, wall));
  });
  app.get('/index.html', (_req, res) => res.redirect(301, '/'));
  app.get('/regeln', indexPage);
  app.get('/regeln/:slug', cantonPage);
}
