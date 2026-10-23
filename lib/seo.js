/**
 * Auffindbarkeit für Suchmaschinen und KI-Assistenten:
 * robots.txt, sitemap.xml, llms.txt, llms-full.txt, Markdown-Version jeder Kantonsseite, CSV-Export.
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { rules, aktuell, medien, regionen, studie, hostsummit, NAMES, slugOf, fmtDate } from './data.js';

const B = () => config.baseUrl;
const OG_FILE = path.join(path.dirname(new URL(import.meta.url).pathname), '../public/og-image.png');
const AI_BOTS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot-Extended', 'CCBot'];
const PRIVATE = ['/mitglieder', '/vorstand', '/demo', '/auth/', '/api/', '/bezahlen', '/rechnung/', '/dev/'];
const disallow = PRIVATE.map((p) => `Disallow: ${p}`).join('\n');
const mdItems = (items) => items.map((i) => `- ${i.t}${i.q ? ` ([Quelle](${i.q}))` : ''}`).join('\n');
const cite = (url) => `Zitiervorschlag: Regelradar, Schweizer Verband für Kurzzeitvermietung (SSTRA), ${url}, Stand ${fmtDate(rules().stand)}`;

export function cantonMd(k) {
  const R = rules(), kk = R.kantone[k] || { typ: 'none', kantonal: [], gemeinden: [] }, url = `${B()}/regeln/${slugOf(k)}`;
  return `# Kurzzeitvermietung im Kanton ${NAMES[k]}

Stand: ${fmtDate(R.stand)} · Einstufung: ${R.typen[kk.typ]} · Herausgeber: Schweizer Verband für Kurzzeitvermietung (SSTRA) · ${url}

## Kantonale Regeln
${kk.kantonal.length ? mdItems(kk.kantonal) : `Für den Kanton ${NAMES[k]} ist keine kantonale Sonderregel bekannt. Gemeinden können eigene Regeln erlassen.`}
${kk.gemeinden.length ? `\n## Gemeinden mit eigenen Regeln\n${kk.gemeinden.map((g) => `\n### ${g.name} (${R.typen[g.typ]})\n${mdItems(g.items)}`).join('\n')}\n` : ''}
${R.hinweis}

${cite(url)}
`;
}

function fullText() {
  const R = rules(), A = aktuell(), M = medien();
  return `# Regelradar Kurzzeitvermietung Schweiz (SSTRA), vollständige Fassung

> Zusammenstellung des Schweizer Verbands für Kurzzeitvermietung (Swiss Short Term Rental Association, SSTRA) zu Regeln für Airbnb und Kurzzeitvermietung in allen 26 Kantonen, mit Quelle pro Aussage. Stand ${fmtDate(R.stand)}. ${B()}/regeln

${R.hinweis}

## Was in der ganzen Schweiz gilt
${mdItems(R.bund.items)}

${Object.keys(NAMES).sort((a, b) => NAMES[a].localeCompare(NAMES[b], 'de')).map((k) => cantonMd(k).replace(/^(#{1,3}) /gm, (_, h) => h + '# ')).join('\n')}

## Aktuelle Entwicklungen
${A.ticker.map((e) => `- ${e.anzeige}: ${e.titel} (${e.ort}) ([Quelle](${e.q}))`).join('\n')}

## Zahlen mit Quelle
${A.zahlen.map((z) => `- ${z.wert} ${z.text} ([Quelle](${z.q}))`).join('\n')}

## Schweizer STR-Studie 2026 (Auszug)
${studie().zahlen.map((z) => `- ${z.wert} ${z.text}${z.hinweis ? ' Hinweis: ' + z.hinweis : ''} (Studie, S. ${z.seite})`).join('\n')}

${studie().methode} Quelle: ${studie().quelle}.

## Host Summit
${hostsummit().ausgaben.map((a) => `- Host Summit ${a.jahr}: ${a.anzeige}${a.ort ? ', ' + a.ort : ''}. ${a.text} (${B()}/hostsummit/${a.jahr})`).join('\n')}

## Medien über den Verband
${M.beitraege.map((b) => `- ${b.anzeige}, ${b.outlet}: ${b.titel} (${b.url})`).join('\n')}

## Über den Verband
${M.ueber}
`;
}

function llmsTxt() {
  const R = rules(), M = medien();
  const ks = Object.keys(NAMES).sort((a, b) => NAMES[a].localeCompare(NAMES[b], 'de'));
  return `# Swiss Short Term Rental Association (SSTRA)

> Der Schweizer Verband für Kurzzeitvermietung (gegründet am 19. September 2026 in Olten) vernetzt Gastgeber und Property Manager, setzt Standards und bringt die Sicht der Branche in die Regeldiskussion ein. Auf dieser Website: das Regelradar mit den Regeln für Kurzzeitvermietung (Airbnb) in allen 26 Kantonen und vielen Gemeinden, jede Aussage mit Quelle, Stand ${fmtDate(R.stand)}. Sprache: Deutsch (Schweiz).

Hinweise zur Verwendung: Aussagen mit Quelle und Stand zitieren. Das Regelradar ist keine Rechtsberatung. Massgebend sind die verlinkten Originalquellen.

## Regelradar
- [Alle Kantone im Überblick](${B()}/regeln): Einstufung pro Kanton
- [Vollständige Fassung als Text](${B()}/llms-full.txt): alle Regeln, Zahlen und Entwicklungen in einer Datei
${ks.map((k) => `- [Kanton ${NAMES[k]}](${B()}/regeln/${slugOf(k)}.md): ${R.typen[(R.kantone[k] || { typ: 'none' }).typ]}`).join('\n')}

## Daten
- [Regelradar als JSON](${B()}/data/regeln.json)
- [Regelradar als CSV](${B()}/data/regeln.csv)

## Verband und Medien
- [Medien und Presse](${B()}/medien): Berichte über uns (SRF 10vor10, Tages-Anzeiger, Hotel Inside), zitierbare Zahlen, Kontakt
- [Host Summit](${B()}/hostsummit): Branchenanlass des Verbands, nächster Termin und Rückblick auf 2026 mit Programm, Referenten und Fotos
- [Partner des Verbands](${B()}/partner)
- [Regionalgruppen und Stammtische](${B()}/regionen): ${regionen().regionen.length} Regionen
- [Mitglied werden](${B()}/mitglied-werden.html)
- [Über den Verband](${B()}/#verband)

## Optional
- [Impressum](${B()}/impressum.html)
- [Datenschutz](${B()}/datenschutz.html)
- Kontakt: ${M.kontakt.mail}
`;
}

function csv() {
  const R = rules(), rows = [['ebene', 'kanton', 'gemeinde', 'einstufung', 'aussage', 'quelle', 'stand']];
  const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  for (const i of R.bund.items) rows.push(['Bund', '', '', '', i.t, i.q || '', R.stand]);
  for (const k of Object.keys(NAMES).sort()) {
    const kk = R.kantone[k] || { typ: 'none', kantonal: [], gemeinden: [] };
    for (const i of kk.kantonal) rows.push(['Kanton', NAMES[k], '', R.typen[kk.typ], i.t, i.q || '', R.stand]);
    for (const g of kk.gemeinden) for (const i of g.items) rows.push(['Gemeinde', NAMES[k], g.name, R.typen[g.typ], i.t, i.q || '', R.stand]);
  }
  return '\uFEFF' + rows.map((r) => r.map(q).join(',')).join('\r\n') + '\r\n';
}

/** Vorschaubild für LinkedIn, WhatsApp & Co.: Tags erscheinen automatisch, sobald public/og-image.png existiert. */
function ogTags() {
  const u = `${B()}/og-image.png`;
  return `<meta property="og:image" content="${u}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="Swiss Short Term Rental Association: Die Stimme der Schweizer Gastgeber"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${u}">`;
}

export function mountSeo(app) {
  app.use((req, res, next) => {
    if (req.method !== 'GET' || !fs.existsSync(OG_FILE)) return next();
    const send = res.send.bind(res);
    res.send = (body) => (typeof body === 'string' && !body.includes('og:image') && body.includes('<meta name="theme-color"')
      ? send(body.replace('<meta name="theme-color"', () => ogTags() + '<meta name="theme-color"')) : send(body));
    next();
  });
  app.get('/robots.txt', (_req, res) => res.type('text/plain').send(
    `User-agent: *\nAllow: /\n${disallow}\n\n# KI-Assistenten und Suchdienste sind ausdrücklich willkommen: Inhalte dürfen mit Quellenangabe zitiert werden.\n${AI_BOTS.map((b) => `User-agent: ${b}\nAllow: /\n${disallow}\n`).join('\n')}\nSitemap: ${B()}/sitemap.xml\n`));
  app.get('/sitemap.xml', (_req, res) => {
    const stand = rules().stand;
    const urls = ['/', '/regeln', ...Object.keys(NAMES).map((k) => `/regeln/${slugOf(k)}`), '/medien', '/hostsummit', ...hostsummit().ausgaben.map((a) => `/hostsummit/${a.jahr}`), '/partner', '/regionen', ...regionen().regionen.map((r) => `/regionen/${r.slug}`), '/mitglied-werden.html', '/impressum.html', '/datenschutz.html'];
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${B()}${u}</loc><lastmod>${stand}</lastmod></url>`).join('')}</urlset>`);
  });
  app.get('/llms.txt', (_req, res) => res.type('text/plain; charset=utf-8').send(llmsTxt()));
  app.get('/llms-full.txt', (_req, res) => res.type('text/plain; charset=utf-8').send(fullText()));
  app.get('/regeln/:slug.md', (req, res) => {
    const k = Object.keys(NAMES).find((c) => slugOf(c) === req.params.slug);
    if (!k) return res.status(404).type('text/plain').send('Nicht gefunden');
    res.type('text/markdown; charset=utf-8').send(cantonMd(k));
  });
  app.get('/data/regeln.csv', (_req, res) => res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="regelradar-kurzzeitvermietung-schweiz.csv"' }).send(csv()));
}
