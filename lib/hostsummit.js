/** Host-Summit-Bereich: Übersicht, Ankündigung (kommend) und Rückblick (vorbei) je Jahr. Daten: public/data/hostsummit.json */
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { esc, page } from './views.js';
import { hostsummit, medien, fmtDate } from './data.js';

const pub = path.join(path.dirname(new URL(import.meta.url).pathname), '../public');
const sorted = (H, st, dir = 1) => H.ausgaben.filter((a) => a.status === st).sort((a, b) => dir * a.datum.localeCompare(b.datum));
const ext = (u) => `<a href="${esc(u)}" target="_blank" rel="noopener">`;

function photos(a) {
  if (!a.fotoOrdner) return [];
  const dir = path.join(pub, 'media', a.fotoOrdner);
  let caps = {};
  try { caps = JSON.parse(fs.readFileSync(path.join(dir, 'captions.json'), 'utf8')); } catch { /* optional */ }
  try { return fs.readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort().map((f) => ({ src: `/media/${a.fotoOrdner}/${encodeURIComponent(f)}`, cap: caps[f] || '' })); } catch { return []; }
}

/** Teaser für die Startseite: nächste Ausgabe und Rückblick. */
export function hostSummitTeaserHtml() {
  const H = hostsummit(), next = sorted(H, 'kommend')[0], last = sorted(H, 'vorbei', -1)[0];
  if (!next) return '';
  return `<section class="hs-teaser" id="hostsummit" aria-labelledby="hsH"><div class="wrap hs-grid"><div>
<p class="eyebrow">Der Branchenanlass des Verbands</p><h2 id="hsH" class="display h-l">Host Summit ${next.jahr}</h2>
<p class="lead">${esc(next.anzeige)}. ${esc(next.teaser)}</p>
<div class="cta-row"><a class="btn btn-red" href="/hostsummit/${next.jahr}">Alle Infos</a>${last ? `<a class="btn btn-line" href="/hostsummit/${last.jahr}">Rückblick ${last.jahr}</a>` : ''}</div></div>
${last ? `<dl class="hs-facts" aria-label="Host Summit ${last.jahr}"><div><dt>Host Summit ${last.jahr}</dt><dd>${esc(last.anzeige.replace(/^\w+, /, ''))}</dd></div><div><dt>Ort</dt><dd>${esc(last.ortName || last.ort)}</dd></div><div><dt>Teilnehmende</dt><dd>${esc(last.teilnehmende)}</dd></div><div><dt>Höhepunkt</dt><dd>Gründung des Verbands</dd></div></dl>` : ''}</div></section>`;
}

function eventLd(H, a) {
  const place = a.ort
    ? { '@type': 'Place', name: a.ortName, address: { '@type': 'PostalAddress', streetAddress: a.adresse.strasse, postalCode: a.adresse.plz, addressLocality: a.adresse.ort, addressCountry: 'CH' } }
    : { '@type': 'Place', name: 'Ort wird bekanntgegeben', address: { '@type': 'PostalAddress', addressCountry: 'CH' } };
  return { '@context': 'https://schema.org', '@type': 'Event', name: `Host Summit ${a.jahr}`, startDate: a.datum, eventStatus: 'https://schema.org/EventScheduled', eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode', description: a.text, inLanguage: 'de-CH', location: place, organizer: { '@type': 'Organization', name: H.veranstalter, url: config.baseUrl } };
}

function overview(req, res) {
  const H = hostsummit(), next = sorted(H, 'kommend')[0];
  const all = [...H.ausgaben].sort((a, b) => b.datum.localeCompare(a.datum));
  res.send(page({ title: 'Host Summit', user: req.user, wide: true, publicNav: true, index: true, canonical: '/hostsummit',
    description: `Der Host Summit ist der jährliche Branchenanlass der Schweizer Kurzzeitvermietung. Nächster Termin: ${next ? next.anzeige : 'folgt'}. Mit Rückblick auf den ersten Summit in Olten.`,
    body: `<nav class="crumbs" aria-label="Brotkrumen"><a href="/">Start</a> › Host Summit</nav><h1 class="display h-l">Host Summit</h1>
<p class="lead" style="margin:18px 0 32px">${esc(H.ueber)}</p>
${next ? `<section class="hs-next"><p class="eyebrow">Nächster Host Summit</p><h2>${esc(next.anzeige)}</h2><p>${esc(next.text)}</p><div class="cta-row"><a class="btn btn-red" href="/hostsummit/${next.jahr}">Alle Infos zum Summit ${next.jahr}</a><a class="btn btn-line" href="/#kontakt">Newsletter abonnieren</a></div></section>` : ''}
<section class="media-block"><h2>Alle Ausgaben</h2><ul class="press-list">${all.map((a) => `<li><time datetime="${esc(a.datum)}">${esc(String(a.jahr))}</time><div><span class="kind">${a.status === 'kommend' ? 'Kommend' : 'Rückblick'}</span><strong><a href="/hostsummit/${a.jahr}">Host Summit ${a.jahr}</a></strong><span class="where">${esc(a.anzeige)}${a.ort ? ' · ' + esc(a.ortName) : ''}</span></div></li>`).join('')}</ul></section>` }));
}

function edition(req, res) {
  const H = hostsummit(), a = H.ausgaben.find((x) => String(x.jahr) === req.params.jahr);
  if (!a) return res.status(404).send(page({ title: 'Nicht gefunden', user: req.user, publicNav: true, body: '<div class="card narrow"><h1 class="display h-m">Ausgabe nicht gefunden</h1><p><a href="/hostsummit">Alle Ausgaben</a></p></div>' }));
  const past = a.status === 'vorbei', M = medien();
  const presse = (a.presse || []).map((frag) => M.beitraege.find((b) => b.url.includes(frag))).filter(Boolean);
  const imgs = past ? photos(a) : [];
  const studie = fs.existsSync(path.join(pub, 'media/str-studie-2026.pdf')) ? '/media/str-studie-2026.pdf' : '/#studie';
  const facts = `<dl class="hs-facts-light"><div><dt>Datum</dt><dd>${esc(a.anzeige)}</dd></div><div><dt>Ort</dt><dd>${esc(a.ort || 'Wird bekanntgegeben')}</dd></div>${a.teilnehmende ? `<div><dt>Teilnehmende</dt><dd>${esc(a.teilnehmende)}</dd></div>` : ''}<div><dt>Veranstalter</dt><dd>${esc(H.veranstalter)}</dd></div></dl>`;
  const body = `<nav class="crumbs" aria-label="Brotkrumen"><a href="/">Start</a> › <a href="/hostsummit">Host Summit</a> › ${a.jahr}</nav>
<h1 class="display h-l">Host Summit ${a.jahr}${past ? ': Rückblick' : ''}</h1><p class="lead" style="margin:18px 0 24px">${esc(a.text)}</p>${facts}
${past ? `<section class="media-block"><h2>Highlights</h2><div class="press-kit">${a.highlights.map((h) => `<div class="card"><h3>${esc(h.titel)}</h3><p>${esc(h.text)}</p></div>`).join('')}</div>
<p><a class="btn btn-black" href="${studie}">Zur Schweizer STR-Studie 2026</a></p></section>
<section class="media-block" id="programm"><h2>Programm</h2><table class="pt hs-prog"><tbody>${a.programm.map((p) => `<tr><td class="t">${esc(p.zeit)}</td><td><strong>${esc(p.titel)}</strong><br><small>${esc(p.wer)}</small></td></tr>`).join('')}</tbody></table><p class="note">Programm laut Ankündigung. Kurzfristige Änderungen sind möglich.</p></section>
<section class="media-block" id="referenten"><h2>Referentinnen und Referenten</h2><div class="press-kit">${a.referenten.map((r) => `<div class="card"><h3>${esc(r.name)}</h3><p class="muted">${esc(r.rolle)}</p><p>${esc(r.thema)}</p></div>`).join('')}</div></section>
<section class="media-block" id="fotos"><h2>Fotos</h2>${imgs.length ? `<div class="gallery">${imgs.map((i) => `<a href="${i.src}" target="_blank" rel="noopener"><img src="${i.src}" alt="${esc(i.cap || `Foto vom Host Summit ${a.jahr}`)}" loading="lazy"></a>`).join('')}</div>${a.fotoCredit ? `<p class="credit">Fotos: ${esc(a.fotoCredit)}</p>` : ''}` : '<p>Die Fotos folgen in Kürze.</p>'}</section>
${presse.length ? `<section class="media-block" id="presse"><h2>In den Medien</h2><ul class="press-list">${presse.map((b) => `<li><time datetime="${esc(b.datum)}">${esc(b.anzeige)}</time><div><span class="kind">${esc(b.art)}</span><strong>${ext(b.url)}${esc(b.titel)}</a></strong><span class="where">${esc(b.outlet)}${b.bezahlschranke ? ' · mit Bezahlschranke' : ''}</span></div></li>`).join('')}</ul><p class="note"><a href="/medien">Alle Medienberichte</a></p></section>` : ''}
<section class="media-block hs-cta"><h2>Beim nächsten Mal dabei sein</h2><p><a class="btn btn-red" href="/hostsummit/${sorted(H, 'kommend')[0]?.jahr || ''}">Host Summit ${sorted(H, 'kommend')[0]?.jahr || ''}</a></p></section>`
  : `<section class="media-block"><h2>Tickets</h2><p>${esc(a.ticket)}</p><div class="cta-row"><a class="btn btn-red" href="/mitglied-werden.html?plan=gastgeber">Mitglied werden</a><a class="btn btn-line-dark" href="/#kontakt">Newsletter abonnieren</a></div></section>
<section class="media-block"><h2>Partner werden</h2><p>Unternehmen, die den Host Summit unterstützen möchten, melden sich beim Verband.</p><p><a class="btn btn-black" href="mailto:info@hostsummit.ch?subject=${encodeURIComponent('Partner Host Summit ' + a.jahr)}">Anfrage senden</a></p></section>
<section class="media-block"><h2>Rückblick</h2><p>So war der erste Host Summit 2026 in Olten.</p><p><a class="btn btn-line-dark" href="/hostsummit/2026">Zum Rückblick</a></p></section>`}`;
  res.send(page({ title: `Host Summit ${a.jahr}${past ? ': Rückblick' : ''}`, user: req.user, wide: true, publicNav: true, index: true, canonical: `/hostsummit/${a.jahr}`, jsonld: eventLd(H, a),
    description: `Host Summit ${a.jahr}, ${a.anzeige}${a.ort ? ', ' + a.ortName : ''}. ${a.text}`.slice(0, 300), body }));
}

export function mountHostsummit(app) {
  app.get('/hostsummit', overview);
  app.get('/hostsummit/:jahr(\\d{4})', edition);
}
