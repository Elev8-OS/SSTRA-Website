import fs from 'node:fs';
import path from 'node:path';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { TAG } from './roles.js';
import { esc, page, mailHtml } from './views.js';

const here = path.dirname(new URL(import.meta.url).pathname);
const load = () => JSON.parse(fs.readFileSync(path.join(here, '../public/data/regionen.json'), 'utf8'));
const regeln = () => JSON.parse(fs.readFileSync(path.join(here, '../public/data/regeln.json'), 'utf8'));
const today = () => new Date().toISOString().slice(0, 10);
const fmt = (d) => d.split('-').reverse().join('.');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const clean = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const NAMES = { SH:'Schaffhausen',TG:'Thurgau',BS:'Basel-Stadt',AG:'Aargau',ZH:'Zürich',SG:'St. Gallen',AR:'Appenzell Ausserrhoden',JU:'Jura',BL:'Basel-Landschaft',SO:'Solothurn',ZG:'Zug',SZ:'Schwyz',AI:'Appenzell Innerrhoden',NE:'Neuenburg',BE:'Bern',LU:'Luzern',NW:'Nidwalden',UR:'Uri',GL:'Glarus',GR:'Graubünden',GE:'Genf',VD:'Waadt',FR:'Freiburg',OW:'Obwalden',VS:'Wallis',TI:'Tessin' };

/** Nächste Anlässe über alle Regionen, sortiert nach Datum. */
export function upcomingEvents(limit = 50) {
  const t = today();
  return load().regionen.flatMap((r) => r.events.filter((e) => e.datum >= t).map((e) => ({ ...e, region: r.name, slug: r.slug })))
    .sort((a, b) => a.datum.localeCompare(b.datum)).slice(0, limit);
}

function eventCard(e, slug) {
  return `<article class="event"><div class="event-date"><span>${esc(e.datum.slice(8, 10))}</span><small>${esc(e.datum.slice(5, 7))}.${esc(e.datum.slice(0, 4))}</small></div>
  <div class="event-body"><h3>${esc(e.titel)}</h3><p class="meta">${esc(e.zeit)} Uhr · ${esc(e.ort)}</p><p>${esc(e.text || '')}</p>
  <form class="event-form" data-event="${esc(e.id)}" data-region="${esc(slug)}">
    <div class="two"><input name="name" type="text" placeholder="Name" autocomplete="name" required><input name="email" type="email" placeholder="E-Mail" autocomplete="email" required></div>
    <input class="hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
    <label class="check-line"><input type="checkbox" name="consent" required><span>Ich akzeptiere die <a href="/datenschutz.html">Datenschutzerklärung</a>.</span></label>
    <button class="btn btn-red small" type="submit">Anmelden</button><p class="form-msg" role="status"></p>
  </form></div></article>`;
}

export function mountRegions(app, { ghl, users }) {
  app.get('/api/events', (_req, res) => res.json({ events: upcomingEvents(6) }));

  app.get('/regionen', (req, res) => {
    const d = load();
    res.send(page({ title: 'Regionen', user: req.user, wide: true, body: `
      <h1 class="display h-l">Regionalgruppen</h1>
      <p class="lead" style="margin-bottom:36px">Die Regeln entstehen in den Gemeinden. Deshalb organisieren wir uns regional: Stammtische, Ansprechpersonen und das lokale Regelradar. Jede Gruppe steht allen Gastgebern offen, Mitgliedschaft ist nicht Voraussetzung.</p>
      <div class="region-grid">${d.regionen.map((r) => { const n = r.events.filter((e) => e.datum >= today()).length; return `<a class="region-card" href="/regionen/${esc(r.slug)}"><h2>${esc(r.name)}</h2><p>${esc(r.intro)}</p><span class="pill">${n ? n + ' Termin' + (n > 1 ? 'e' : '') : 'Noch kein Termin'}</span></a>`; }).join('')}</div>
      <p class="note">${esc(d.hinweis)} Du möchtest eine Regionalgruppe leiten oder einen Stammtisch starten? <a href="/mitglied-werden.html?plan=regionalgruppe">Melde dich.</a></p>` }));
  });

  app.get('/regionen/:slug', (req, res) => {
    const d = load();
    const r = d.regionen.find((x) => x.slug === req.params.slug);
    if (!r) return res.status(404).send(page({ title: 'Nicht gefunden', user: req.user, body: '<div class="card narrow"><h1 class="display h-m">Region nicht gefunden</h1><p><a href="/regionen">Alle Regionen</a></p></div>' }));
    const t = today();
    const next = r.events.filter((e) => e.datum >= t).sort((a, b) => a.datum.localeCompare(b.datum));
    const past = r.events.filter((e) => e.datum < t);
    const rg = regeln();
    const kant = r.kantone.map((k) => { const x = rg.kantone[k]; return `<li><a href="/#regeln">${esc(NAMES[k])}</a>: ${esc(rg.typen[x?.typ || 'none'])}${x?.gemeinden?.length ? `, Gemeinderegeln in ${x.gemeinden.map((g) => esc(g.name)).join(', ')}` : ''}</li>`; }).join('');
    res.send(page({ title: `Region ${r.name}`, user: req.user, wide: true, body: `
      <p><a href="/regionen">← Alle Regionen</a></p>
      <h1 class="display h-l">${esc(r.name)}</h1><p class="lead" style="margin-bottom:32px">${esc(r.intro)}</p>
      <div class="grid2" style="grid-template-columns:1.4fr 1fr">
        <div>
          <div class="card"><h2 class="h-m">Nächste Stammtische</h2>${next.length ? next.map((e) => eventCard(e, r.slug)).join('') : `<p>Noch kein Termin. Du willst den ersten Stammtisch in ${esc(r.name)} organisieren? <a href="/mitglied-werden.html?plan=regionalgruppe">Melde dich beim Verband</a>, wir helfen mit Einladung, Ablauf und Raum.</p>`}</div>
          ${past.length ? `<div class="card"><h2 class="h-m">Vergangene Anlässe</h2><ul class="doclist">${past.map((e) => `<li><strong>${fmt(e.datum)}</strong> ${esc(e.titel)}</li>`).join('')}</ul></div>` : ''}
        </div>
        <div>
          <div class="card"><h2 class="h-m">Ansprechperson</h2><p>${esc(r.lead)}</p><p style="margin-top:12px"><a href="mailto:info@hostsummit.ch">Kontakt über den Verband</a></p></div>
          <div class="card"><h2 class="h-m">Regelradar für diese Region</h2><ul class="doclist" style="font-size:1rem">${kant}</ul><p style="margin-top:14px"><a class="btn btn-black small" href="/#regeln">Zum Regelradar</a></p></div>
        </div>
      </div>
      <script src="/js/events.js" defer></script>` }));
  });

  const limiter = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'Zu viele Anfragen.' } });
  app.post('/api/events/register', limiter, async (req, res) => {
    const b = req.body || {};
    if (b.website || (Number.isFinite(+b.elapsed) && +b.elapsed < 1500)) return res.json({ ok: true });
    const email = clean(b.email, 254).toLowerCase(), name = clean(b.name, 120), eventId = clean(b.event, 60), slug = clean(b.region, 60);
    const r = load().regionen.find((x) => x.slug === slug);
    const ev = r?.events.find((e) => e.id === eventId);
    if (!ev) return res.status(400).json({ error: 'Anlass nicht gefunden.' });
    if (!EMAIL_RE.test(email) || !name) return res.status(400).json({ error: 'Bitte Name und gültige E-Mail angeben.' });
    if (b.consent !== true) return res.status(400).json({ error: 'Bitte bestätige die Datenschutzerklärung.' });
    try {
      const [firstName, ...rest] = name.split(' ');
      const c = await ghl.upsertContact({ email, firstName, lastName: rest.join(' '), tags: [`region:${slug}`, `stammtisch:${eventId}`, 'einwilligung:stammtisch'], source: 'Website Stammtisch' });
      await ghl.addNote(c.id, `Anmeldung Stammtisch: ${ev.titel} (${ev.datum}, ${ev.ort})`);
      await ghl.sendEmail(c.id, `Anmeldung: ${ev.titel}`, mailHtml({ heading: 'Du bist angemeldet', paragraphs: [`<strong>${esc(ev.titel)}</strong><br>${fmt(ev.datum)}, ${esc(ev.zeit)} Uhr, ${esc(ev.ort)}`, 'Wir freuen uns auf dich. Falls du nicht kommen kannst, antworte einfach auf diese Mail.'], button: { label: 'Zur Regionalseite', url: `${config.baseUrl}/regionen/${slug}` } }));
      await ghl.notify('event.registered', { email, name, event: eventId, region: slug });
      res.json({ ok: true });
    } catch (e) { console.error(e); res.status(502).json({ error: 'Anmeldung momentan nicht möglich.' }); }
  });
}
