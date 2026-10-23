/** Ausgelagerte Detailseiten der Startseite: /aktuell, /verband, /studie. Halten die Startseite ruhig. */
import fs from 'node:fs';
import path from 'node:path';
import { esc, page } from './views.js';
import { aktuell, studie, NAMES, slugOf, slugify } from './data.js';

const here = path.dirname(new URL(import.meta.url).pathname);
const part = (n) => fs.readFileSync(path.join(here, '../content/partials', n + '.html'), 'utf8');
const srcLink = (q, label = 'Quelle') => (q ? ` <a class="src" href="${esc(q)}" target="_blank" rel="noopener">${label}</a>` : '');

const where = (e) => (!e.kanton || e.kanton === 'CH' ? '/regeln#bund' : `/regeln/${slugOf(e.kanton)}${e.gemeinde ? '#' + slugify(e.gemeinde) : ''}`);
function tickerRow(e) {
  const when = e.datum && e.genau !== false ? `<time datetime="${esc(e.datum)}">${esc(e.anzeige)}</time>` : e.datum ? `<time datetime="${esc(e.datum.slice(0, 7))}">${esc(e.anzeige)}</time>` : `<span class="when-open">${esc(e.anzeige)}</span>`;
  return `<li>${when}<div><span class="kind">${esc(e.art)}</span><strong>${esc(e.titel)}</strong><span class="where">${esc(e.ort)}</span></div><div class="links"><a href="${where(e)}">Zur Regel</a>${srcLink(e.q)}</div></li>`;
}
const upcoming = (A) => A.ticker.filter((e) => e.kommend).sort((a, b) => (a.datum || '9999').localeCompare(b.datum || '9999'));
const recent = (A) => A.ticker.filter((e) => !e.kommend).sort((a, b) => b.datum.localeCompare(a.datum));

/** Startseite: nur drei Einträge, der Rest steht auf /aktuell. */
export function tickerTeaserHtml() {
  const A = aktuell();
  return `<ul class="ticker-list">${[...upcoming(A).slice(0, 2), ...recent(A).slice(0, 1)].map(tickerRow).join('')}</ul>`;
}
const tickerHtml = () => { const A = aktuell(); return `<h3 class="ticker-sub">Als Nächstes</h3><ul class="ticker-list">${upcoming(A).map(tickerRow).join('')}</ul>\n<h3 class="ticker-sub">Zuletzt passiert</h3><ul class="ticker-list">${recent(A).map(tickerRow).join('')}</ul>`; };

const zahlenHtml = () => {
  const A = aktuell();
  return `<section class="facts" id="zahlen" aria-labelledby="zahlenH"><div class="wrap"><h2 id="zahlenH" class="display h-l">Zahlen, die die Debatte prägen</h2>
<div class="fact-grid">${A.zahlen.map((z) => `<figure class="fact"><strong>${esc(z.wert)}</strong><figcaption>${esc(z.text)}<span class="fact-links">${srcLink(z.q).trim()}<a class="src" href="/regeln/${slugOf(z.kanton)}">Regeln in ${esc(NAMES[z.kanton])}</a></span></figcaption></figure>`).join('')}</div>
<p class="fact-note">Alle Zahlen stammen aus öffentlichen Quellen. Marktdaten liefert die <a class="src" href="/studie">Schweizer STR-Studie 2026</a> der HES-SO Valais-Wallis.</p></div></section>`;
};

const studieZahlenHtml = () => {
  const S = studie();
  return `<section class="study-facts" id="studie-zahlen" aria-labelledby="szH"><div class="wrap"><h2 id="szH" class="display h-l">Was die Studie zeigt</h2>
<div class="fact-grid cols3">${S.zahlen.map((z) => `<figure class="fact"><strong>${esc(z.wert)}</strong><figcaption>${esc(z.text)}${z.hinweis ? `<span class="fact-hint">${esc(z.hinweis)}</span>` : ''}<span class="page-ref">Studie, S. ${esc(z.seite)}</span></figcaption></figure>`).join('')}</div>
<p class="fact-note">${esc(S.methode)} Quelle: ${esc(S.quelle)}.</p></div></section>`;
};

export const trioHtml = () => `<div class="trio"><div><h3>Vernetzen</h3><p>Gastgeberinnen, Gastgeber und Property Manager aus allen Regionen tauschen sich aus.</p></div><div><h3>Professionalisieren</h3><p>Ein gemeinsamer Verhaltenskodex und praxisnahes Wissen zu Steuern, Kurtaxe und Recht.</p></div><div><h3>Mitreden</h3><p>Wir sprechen mit Gemeinden, Kantonen und Bund, mit Zahlen statt Behauptungen.</p></div></div>`;

const top = (eyebrow, h1, lead) => `<section class="page-top"><div class="wrap"><p class="eyebrow">${eyebrow}</p><h1 class="display h-l">${h1}</h1>${lead ? `<p class="lead">${lead}</p>` : ''}</div></section>`;
const shell = (req, o) => page({ ...o, user: req.user, publicNav: true, index: true, raw: true, body: o.main });

export function mountExtraPages(app) {
  app.get('/aktuell', (req, res) => res.send(shell(req, {
    title: 'Aktuell: Was sich bei der Kurzzeitvermietung ändert', canonical: '/aktuell',
    description: 'Gerichtsurteile, Abstimmungen und neue Regeln für Gastgeber in der Schweiz, mit Quelle und Verweis auf die betroffene Regel. Dazu Zahlen, die die Debatte prägen.',
    main: `${top('Aktuell', 'Was sich gerade ändert', 'Gerichtsurteile, Abstimmungen und neue Regeln, die Gastgeber betreffen. Jeder Eintrag verweist auf die Quelle und auf die betroffene Regel.')}
<section class="on-light calm"><div class="wrap">${tickerHtml()}</div></section>${zahlenHtml()}` })));

  app.get('/verband', (req, res) => res.send(shell(req, {
    title: 'Der Verband: Aufgaben, Standards und Mitgliedschaft', canonical: '/verband',
    description: 'Der Schweizer Verband für Kurzzeitvermietung (SSTRA) vernetzt Gastgeber, setzt Standards und redet bei den Regeln mit. Mitgliedschaft ab CHF 199 pro Jahr, inklusive Ticket für den Host Summit.',
    main: `${top('Verband', 'Drei Aufgaben. Eine gemeinsame Stimme.', 'Der Schweizer Verband für Kurzzeitvermietung wurde am 19. September 2026 in Olten gegründet.')}
<section class="calm"><div class="wrap">${trioHtml()}</div></section>
${part('standards')}
${part('mitglied')}` })));

  app.get('/studie', (req, res) => {
    const pdf = fs.existsSync(path.join(here, '../public/media/str-studie-2026.pdf'));
    const intro = part('studie').replace('<h2 class="display h-l">', '<h1 class="display h-l">').replace('</h2>', '</h1>')
      .replace('href="mailto:info@hostsummit.ch?subject=Schweizer%20STR-Studie%202026">Studie anfordern', pdf ? 'href="/media/str-studie-2026.pdf" download>Studie herunterladen (PDF)' : 'href="mailto:info@hostsummit.ch?subject=Schweizer%20STR-Studie%202026">Studie anfordern');
    res.send(shell(req, {
      title: 'Die Schweizer STR-Studie 2026', canonical: '/studie',
      description: 'Die erste Marktstudie zur Kurzzeitvermietung in der Schweiz (HES-SO Valais-Wallis, September 2026): Kennzahlen zu Registrierung, Kurtaxe, Preisen, Auslastung und Direktbuchungen.',
      main: `${intro}\n${studieZahlenHtml()}` }));
  });
}
