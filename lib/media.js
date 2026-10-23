/** Medienseite: Videoausschnitt, Berichte über uns, Pressebereich. Daten: public/data/medien.json */
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { esc, page } from './views.js';
import { medien, aktuell, rules, NAMES, slugOf, fmtDate } from './data.js';

const pub = path.join(path.dirname(new URL(import.meta.url).pathname), '../public');
const has = (rel) => Boolean(rel) && fs.existsSync(path.join(pub, rel));
const ext = (u) => `<a href="${esc(u)}" target="_blank" rel="noopener">`;

/** Startseite: schmale Zeile «In den Medien», Details auf /medien. */
export function mediaTeaserHtml() {
  const outlets = [...new Set([...medien().beitraege].sort((a, b) => b.datum.localeCompare(a.datum)).map((b) => b.outlet))];
  return `<section class="media-strip" id="medien" aria-label="In den Medien"><div class="wrap media-strip-row"><p class="eyebrow">In den Medien</p><ul>${outlets.map((o) => `<li>${esc(o)}</li>`).join('')}</ul><a class="btn btn-line-dark small" href="/medien">Berichte und Presse</a></div></section>`;
}

function mediaPage(req, res) {
  const M = medien(), v = M.video, A = aktuell(), R = rules();
  const cite = `Quelle: Regelradar, Schweizer Verband für Kurzzeitvermietung (SSTRA), ${config.baseUrl.replace(/^https?:\/\//, '')}, Stand ${fmtDate(R.stand)}`;
  const main = has(v.datei), short = has(v.kurz);
  const player = (file, poster, label) => `<figure class="player"><video controls preload="metadata" playsinline ${has(poster) ? `poster="${esc(poster)}"` : ''}><source src="${esc(file)}" type="video/mp4">Dein Browser kann das Video nicht abspielen. ${ext(v.quelle)}Beim Original ansehen</a>.</video><figcaption>${label}</figcaption></figure>`;
  const body = `<nav class="crumbs" aria-label="Brotkrumen"><a href="/">Start</a> › Medien</nav>
<h1 class="display h-l">Medien</h1>
<p class="lead" style="margin:18px 0 8px">Berichte über uns, zitierbare Zahlen mit Quelle und Daten zum Herunterladen, für Journalistinnen und Journalisten.</p>
<section class="media-block" id="video"><h2>Im Fernsehen: ${esc(v.sender)} ${esc(v.sendung)}</h2>
<div class="media-video">${main ? player(v.datei, v.poster, `${esc(v.sender)} ${esc(v.sendung)} vom ${esc(v.anzeige)}, Ausschnitt ${esc(v.ausschnitt)}`) : `<div class="video-card"><strong>${esc(v.titel)}</strong><p>${esc(v.sender)} ${esc(v.sendung)} vom ${esc(v.anzeige)}</p><a class="btn btn-red" href="${esc(v.quelle)}" target="_blank" rel="noopener">Beitrag bei SRF Play ansehen</a></div>`}
<div class="media-text"><p class="lead-sm">${esc(v.text)}</p>
${short ? player(v.kurz, '', 'Kurz: unser Präsident im Beitrag (25 Sekunden)') : ''}
<p class="credit">© ${esc(v.sender)}, ${esc(v.sendung)} vom ${esc(v.anzeige)}${main ? `, Ausschnitt ${esc(v.ausschnitt)}. Verwendung mit Erlaubnis von ${esc(v.sender)}` : ''}. ${ext(v.quelle)}Ganzen Beitrag bei SRF Play ansehen</a></p></div></div></section>
<section class="media-block" id="berichte"><h2>Berichte über uns</h2>
<ul class="press-list">${[...M.beitraege].sort((a, b) => b.datum.localeCompare(a.datum)).map((b) => `<li><time datetime="${esc(b.datum)}">${esc(b.anzeige)}</time><div><span class="kind">${esc(b.art)}</span><strong>${ext(b.url)}${esc(b.titel)}</a></strong><span class="where">${esc(b.outlet)}${b.bezahlschranke ? ' · mit Bezahlschranke' : ''}</span></div></li>`).join('')}</ul>
<p class="note">Fehlt ein Beitrag? <a href="mailto:${esc(M.kontakt.mail)}?subject=Medienbeitrag">Schick uns den Link.</a> Stand ${fmtDate(M.stand)}.</p></section>
<section class="media-block" id="presse"><h2>Für Journalistinnen und Journalisten</h2>
<div class="press-kit"><div class="card"><h3>Über den Verband</h3><p>${esc(M.ueber)}</p></div>
<div class="card"><h3>Ansprechperson</h3><p><strong>${esc(M.kontakt.name)}</strong>, ${esc(M.kontakt.rolle)}<br><a href="mailto:${esc(M.kontakt.mail)}">${esc(M.kontakt.mail)}</a></p><p class="muted">Wir antworten in der Regel am gleichen Werktag.</p></div>
<div class="card"><h3>So zitierst du uns</h3><p class="cite">${esc(cite)}</p><p class="muted">Jede Regel hat eine eigene Seite mit Quellen und Datum, zum Beispiel <a href="/regeln/${slugOf('ZH')}">Kanton Zürich</a>.</p></div></div>
<h3 class="h-s">Zahlen mit Quelle</h3>
<ul class="srcs facts-list">${A.zahlen.map((z) => `<li><strong>${esc(z.wert)}</strong> ${esc(z.text)}${` ${ext(z.q)}Quelle</a>`} · <a href="/regeln/${slugOf(z.kanton)}">Regeln in ${esc(NAMES[z.kanton])}</a></li>`).join('')}</ul>
<h3 class="h-s">Daten herunterladen</h3>
<ul class="downloads"><li><a href="/data/regeln.csv" download>Regelradar als CSV</a> <span>für Excel, mit Quelle pro Zeile</span></li><li><a href="/data/regeln.json">Regelradar als JSON</a> <span>für Entwickler und Datenjournalismus</span></li><li><a href="/llms-full.txt">Alle Regeln als Text</a> <span>für KI-Assistenten und Recherche</span></li></ul></section>`;
  res.send(page({ title: 'Medien und Presse', user: req.user, publicNav: true, index: true, wide: true, canonical: '/medien', body,
    description: 'Medienberichte über den Schweizer Verband für Kurzzeitvermietung (SSTRA), SRF 10vor10, zitierbare Zahlen mit Quelle, Daten zum Download und Kontakt für Journalistinnen und Journalisten.' }));
}

export function mountMedia(app) { app.get('/medien', mediaPage); }
