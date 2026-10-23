/**
 * Partner: Der Vorstand legt einen Partner an, der Partner erhält per E-Mail einen persönlichen Link
 * und pflegt Beschreibung, Logo und ein optionales Angebot für Mitglieder selbst.
 * Erste Veröffentlichung nach Freigabe durch den Vorstand, spätere Änderungen gehen direkt live.
 */
import crypto from 'node:crypto';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { requireRole } from './auth.js';
import { esc, page, mailHtml } from './views.js';
import { slugify, today, fmtDate } from './data.js';

/** Bisher auf der Website genannte Partner (werden verlinkt, sobald ihr Profil online ist). */
export const SEED_NAMES = ['Shelly', 'Myotaku', 'Elev8', 'Yale', 'Guesty', 'HES-SO Valais-Wallis', 'Visionary Hospitality', 'FEWOlution', 'immohost', 'Ivy Stenzel', 'CheckYout', 'Hotel Inside'];
export const CATEGORIES = ['Wirtschaftspartner', 'Hochschul- und Plattformpartner', 'Förderverein / Organisation'];
const STATUS_LABEL = { eingeladen: 'Eingeladen', 'zur-pruefung': 'Zur Prüfung', online: 'Online', offline: 'Offline' };

/* ---- persönlicher Link ---- */
const sig = (slug, v) => crypto.createHmac('sha256', config.sessionSecret).update(`partner:${slug}:${v}`).digest('base64url').slice(0, 24);
export const editToken = (p) => `${p.slug}_${p.version}_${sig(p.slug, p.version)}`;
export const editUrl = (p) => `${config.baseUrl}/partner/bearbeiten/${editToken(p)}`;
async function byToken(store, token) {
  const m = /^([a-z0-9-]+)_(\d+)_(.+)$/.exec(String(token || ''));
  if (!m) return null;
  const p = await store.getPartner(m[1]);
  if (!p || p.version !== Number(m[2])) return null;
  const a = Buffer.from(m[3]), b = Buffer.from(sig(p.slug, p.version));
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? p : null;
}

/* ---- Eingaben bereinigen ---- */
const txt = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const url = (v) => {
  const s = String(v || '').trim().slice(0, 300); if (!s) return '';
  try { const u = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s); return ['http:', 'https:'].includes(u.protocol) && u.hostname.includes('.') ? u.href : ''; } catch { return ''; }
};
const isoDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : '');
const offerActive = (p) => Boolean(p.offerTitle) && (!p.offerUntil || p.offerUntil >= today());
const ext = (u) => `<a href="${esc(u)}" target="_blank" rel="noopener sponsored">`;
const logoType = (b) => (b.length > 12 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 ? 'image/png' : b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff ? 'image/jpeg' : b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' ? 'image/webp' : null);

/** Partner-Wand der Startseite: bisherige Namen, verlinkt sobald ein Profil online ist. Mit Logo: Logo und Name. */
export async function partnerWallHtml(store) {
  const pubs = await store.listPartners('online');
  const used = new Set();
  const item = (p, name) => (p
    ? `<span class="${p.hasLogo ? 'has-logo' : ''}"><a href="/partner/${esc(p.slug)}">${p.hasLogo ? `<img src="/partner/logo/${esc(p.slug)}" alt="" loading="lazy">` : ''}<span class="pn">${esc(p.name)}</span></a></span>`
    : `<span>${esc(name)}</span>`);
  const seeds = SEED_NAMES.map((n) => { const p = pubs.find((x) => x.name.toLowerCase() === n.toLowerCase()); if (p) used.add(p.slug); return item(p, n); });
  const extra = pubs.filter((p) => !used.has(p.slug)).map((p) => item(p));
  return `<div class="partner-wall">${[...seeds, ...extra].join('')}</div>`;
}

export function mountPartners(app, { ghl, store }) {
  const board = requireRole(['vorstand']);
  const member = requireRole(['mitglied', 'foerdermitglied'], { allowExpired: true });
  const tokenLimit = rateLimit({ windowMs: 15 * 60_000, limit: 60, standardHeaders: true, legacyHeaders: false, message: 'Zu viele Anfragen.' });

  async function invite(p, resend = false) {
    const nameParts = (p.contactName || '').split(' ');
    const c = await ghl.upsertContact({ email: p.email, firstName: nameParts[0] || p.name, lastName: nameParts.slice(1).join(' '), companyName: p.name, tags: ['partner:eingeladen'], source: 'Partner-Einladung' });
    await ghl.sendEmail(c.id, resend ? 'Dein neuer Link für das Partnerprofil' : 'Dein Partnerprofil beim Schweizer Verband für Kurzzeitvermietung', mailHtml({
      heading: resend ? 'Dein neuer Link' : 'Willkommen als Partner',
      paragraphs: [
        `${esc(p.name)} ist Partner des Verbands. Auf sstra.ch pflegst du deinen Eintrag selbst: eine kurze Beschreibung, dein Logo und, wenn ihr wollt, ein besonderes Angebot für unsere Mitglieder.`,
        'Der Link ist persönlich, bitte gib ihn nicht weiter. Dein Eintrag wird nach einer kurzen Prüfung durch den Vorstand veröffentlicht, spätere Änderungen sind sofort sichtbar.'
      ],
      button: { label: 'Profil ausfüllen', url: editUrl(p) }
    }));
    await ghl.notify(resend ? 'partner.link.resent' : 'partner.invited', { name: p.name, email: p.email });
  }

  /* ---------- öffentlich ---------- */
  app.get('/partner/logo/:slug', async (req, res) => {
    const p = await store.getPartner(req.params.slug);
    const viaToken = req.query.t ? await byToken(store, req.query.t) : null;
    const logo = p && (p.status === 'online' || viaToken?.slug === p.slug) ? await store.getLogo(p.slug) : null;
    if (!logo) return res.status(404).end();
    res.set({ 'Content-Type': logo.type, 'Cache-Control': p.status === 'online' ? 'public, max-age=300' : 'private, no-store', 'Content-Security-Policy': "default-src 'none'" }).send(logo.buf);
  });

  app.get('/partner', async (req, res) => {
    const list = await store.listPartners('online');
    res.send(page({ title: 'Partner', user: req.user, wide: true, publicNav: true, index: true, canonical: '/partner',
      description: 'Die Partner des Schweizer Verbands für Kurzzeitvermietung und des Host Summit: Technologie, Service, Hochschulen und Plattformen.',
      body: `<nav class="crumbs" aria-label="Brotkrumen"><a href="/">Start</a> › Partner</nav><h1 class="display h-l">Partner</h1>
<p class="lead" style="margin:18px 0 32px">Diese Unternehmen und Organisationen unterstützen den Verband und den Host Summit. Sie haben kein Stimmrecht. Mitglieder finden hier auch besondere Angebote.</p>
${list.length ? `<div class="partner-cards">${list.map((p) => `<a class="partner-card" href="/partner/${esc(p.slug)}">${p.hasLogo ? `<img src="/partner/logo/${esc(p.slug)}" alt="" loading="lazy">` : ''}<h2>${esc(p.name)}</h2><p>${esc(p.bio)}</p>${offerActive(p) ? '<span class="pill">Angebot für Mitglieder</span>' : ''}</a>`).join('')}</div>` : '<p>Die Partnerprofile werden gerade aufgebaut.</p>'}` }));
  });

  const missing = (req, res) => res.status(404).send(page({ title: 'Nicht gefunden', user: req.user, publicNav: true, body: '<div class="card narrow"><h1 class="display h-m">Nicht gefunden</h1><p><a href="/partner">Alle Partner</a></p></div>' }));

  /* ---------- Partner pflegt sein Profil ---------- */
  app.get('/partner/bearbeiten/:token', tokenLimit, async (req, res) => {
    const p = await byToken(store, req.params.token);
    if (!p) return res.status(404).send(page({ title: 'Link ungültig', body: '<div class="card narrow"><h1 class="display h-m">Dieser Link ist nicht mehr gültig</h1><p>Schreib uns an <a href="mailto:info@hostsummit.ch">info@hostsummit.ch</a>, wir schicken dir einen neuen.</p></div>' }));
    const t = req.params.token, saved = req.query.gespeichert;
    const state = { eingeladen: 'Dein Eintrag ist noch nicht veröffentlicht. Nach dem Speichern prüft ihn der Vorstand.', 'zur-pruefung': 'Gespeichert. Der Vorstand prüft deinen Eintrag und schaltet ihn frei.', online: 'Dein Eintrag ist online. Änderungen sind sofort sichtbar.', offline: 'Dein Eintrag ist derzeit offline. Der Vorstand meldet sich bei dir.' }[p.status];
    res.send(page({ title: 'Partnerprofil', user: req.user, body: `<h1 class="display h-m">Dein Partnerprofil</h1><p class="lead" style="margin:12px 0 20px">${esc(p.name)}: Hier pflegst du deinen Eintrag auf sstra.ch selbst.</p>
${saved ? '<p class="ok-banner" role="status">Gespeichert. Danke!</p>' : ''}<p class="note-banner">${esc(state)}</p>
<form class="pf card" method="post" action="/partner/bearbeiten/${esc(t)}">
<label>Kurzbeschreibung<small>Zwei, drei Sätze, höchstens 400 Zeichen. Wer seid ihr, und was macht ihr für Gastgeber?</small><textarea name="bio" maxlength="400" rows="4" required>${esc(p.bio)}</textarea></label>
<label>Website<input name="website" type="url" maxlength="300" placeholder="https://" value="${esc(p.website)}"></label>
<fieldset class="logo-box"><legend>Logo</legend><div id="logoPreview">${p.hasLogo ? `<img src="/partner/logo/${esc(p.slug)}?t=${esc(t)}&v=${Date.now()}" alt="Aktuelles Logo">` : '<span class="muted">Noch kein Logo</span>'}</div>
<input type="file" id="logoFile" accept="image/png,image/jpeg,image/webp" data-url="/partner/logo-upload/${esc(t)}" data-preview="/partner/logo/${esc(p.slug)}?t=${esc(t)}"><small>PNG, JPG oder WebP, höchstens 300 KB, am besten quer und mit transparentem Hintergrund.</small><p id="logoMsg" role="status" class="muted"></p></fieldset>
<fieldset class="offer-box"><legend>Angebot für Mitglieder</legend>
<label class="check"><input type="checkbox" name="offer" ${p.offerTitle ? 'checked' : ''}> Wir machen den Mitgliedern des Verbands ein besonderes Angebot</label>
<label>Titel<input name="offerTitle" maxlength="80" placeholder="z. B. 15 % Rabatt auf das erste Jahr" value="${esc(p.offerTitle)}"></label>
<label>Beschreibung<textarea name="offerText" maxlength="300" rows="3" placeholder="Was genau bekommen Mitglieder, und wie lösen sie es ein?">${esc(p.offerText)}</textarea></label>
<label>Code (optional)<input name="offerCode" maxlength="40" value="${esc(p.offerCode)}"></label>
<label>Link zum Angebot (optional)<input name="offerUrl" type="url" maxlength="300" placeholder="https://" value="${esc(p.offerUrl)}"></label>
<label>Gültig bis (optional)<input name="offerUntil" type="date" value="${esc(p.offerUntil)}"></label>
<p class="muted">Das Angebot sehen nur angemeldete Mitglieder.</p></fieldset>
<p><button class="btn btn-red" type="submit">Speichern</button>${p.status === 'online' ? ` <a class="btn btn-line-dark" href="/partner/${esc(p.slug)}">Eintrag ansehen</a>` : ''}</p></form><script src="/js/partner.js" defer></script>` }));
  });

  app.post('/partner/bearbeiten/:token', tokenLimit, async (req, res) => {
    const p = await byToken(store, req.params.token);
    if (!p) return res.status(404).send('Link ungültig');
    const b = req.body || {}; const bio = txt(b.bio, 400);
    if (bio.length < 20) return res.status(400).send(page({ title: 'Partnerprofil', body: `<div class="card narrow"><h1 class="display h-m">Bitte ergänze die Beschreibung</h1><p>Die Kurzbeschreibung braucht mindestens zwei Sätze.</p><p><a href="/partner/bearbeiten/${esc(req.params.token)}">Zurück</a></p></div>` }));
    const offer = b.offer === 'on' && txt(b.offerTitle, 80);
    const f = { bio, website: url(b.website), offerTitle: offer ? txt(b.offerTitle, 80) : '', offerText: offer ? txt(b.offerText, 300) : '', offerCode: offer ? txt(b.offerCode, 40) : '', offerUrl: offer ? url(b.offerUrl) : '', offerUntil: offer ? isoDate(b.offerUntil) : '', status: p.status === 'online' ? 'online' : 'zur-pruefung' };
    await store.saveProfile(p.slug, f);
    await ghl.notify('partner.updated', { name: p.name, status: f.status, offer: Boolean(f.offerTitle) });
    res.redirect(303, `/partner/bearbeiten/${req.params.token}?gespeichert=1`);
  });

  app.put('/partner/logo-upload/:token', tokenLimit, express.raw({ type: ['image/png', 'image/jpeg', 'image/webp'], limit: '300kb' }), async (req, res) => {
    const p = await byToken(store, req.params.token);
    if (!p) return res.status(404).json({ error: 'Link ungültig' });
    if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(415).json({ error: 'Bitte PNG, JPG oder WebP hochladen.' });
    const type = logoType(req.body);
    if (!type) return res.status(415).json({ error: 'Die Datei ist kein gültiges Bild.' });
    await store.setLogo(p.slug, req.body, type);
    res.json({ ok: true });
  });

  /* ---------- Mitglieder: Vorteile ---------- */
  app.get('/mitglieder/vorteile', member, async (req, res) => {
    const list = (await store.listPartners('online')).filter(offerActive);
    res.send(page({ title: 'Vorteile für Mitglieder', user: req.user, wide: true, body: `<h1 class="display h-l">Vorteile für Mitglieder</h1><p class="lead" style="margin:16px 0 28px">Besondere Angebote unserer Partner, nur für Mitglieder des Verbands.</p>
${list.length ? `<div class="partner-cards">${list.map((p) => `<article class="partner-card static">${p.hasLogo ? `<img src="/partner/logo/${esc(p.slug)}" alt="">` : ''}<h2>${esc(p.offerTitle)}</h2><p class="muted"><a href="/partner/${esc(p.slug)}">${esc(p.name)}</a></p><p>${esc(p.offerText)}</p>${p.offerCode ? `<p>Code: <code class="code">${esc(p.offerCode)}</code></p>` : ''}${p.offerUrl ? `<p>${ext(p.offerUrl)}Zum Angebot</a></p>` : ''}${p.offerUntil ? `<p class="muted">Gültig bis ${fmtDate(p.offerUntil)}</p>` : ''}</article>`).join('')}</div>` : '<div class="card"><p>Die ersten Angebote unserer Partner folgen in Kürze.</p></div>'}` }));
  });

  /* ---------- Vorstand ---------- */
  const back = (res, m) => res.redirect(303, `/vorstand/partner?m=${encodeURIComponent(m)}`);
  app.get('/vorstand/partner', board, async (req, res) => {
    const all = await store.listPartners();
    const msg = req.query.m ? `<p class="ok-banner" role="status">${esc(String(req.query.m).slice(0, 120))}</p>` : '';
    const btn = (p, act, label, cls = 'btn-line-dark') => `<form method="post" action="/vorstand/partner/${esc(p.slug)}/${act}" style="display:inline"><button class="btn ${cls} small" type="submit">${label}</button></form>`;
    res.send(page({ title: 'Partner verwalten', user: req.user, wide: true, body: `<nav class="crumbs"><a href="/vorstand">Vorstand</a> › Partner</nav><h1 class="display h-m">Partner</h1>${msg}
<div class="card"><h2 class="h-m">Partner einladen</h2><p>Der Partner erhält eine E-Mail mit einem persönlichen Link und pflegt Beschreibung, Logo und Angebot selbst.</p>
<form class="pf" method="post" action="/vorstand/partner/anlegen"><div class="pf-row"><label>Firma<input name="name" required maxlength="80" list="seed"><datalist id="seed">${SEED_NAMES.map((n) => `<option value="${esc(n)}">`).join('')}</datalist></label><label>Kategorie<select name="category">${CATEGORIES.map((c) => `<option>${esc(c)}</option>`).join('')}</select></label></div>
<div class="pf-row"><label>Kontaktperson<input name="contactName" maxlength="80"></label><label>E-Mail<input name="email" type="email" required maxlength="254"></label></div><button class="btn btn-red" type="submit">Einladung senden</button></form></div>
<div class="card"><h2 class="h-m">Alle Partner (${all.length})</h2>${all.length ? `<table class="pt"><thead><tr><th>Partner</th><th>Status</th><th>Angebot</th><th>Kontakt</th><th></th></tr></thead><tbody>${all.map((p) => `<tr><td><strong>${esc(p.name)}</strong><br><small>${esc(p.category || '')}</small></td><td><span class="pill st-${esc(p.status)}">${esc(STATUS_LABEL[p.status] || p.status)}</span></td><td>${p.offerTitle ? esc(p.offerTitle) : '<small>keines</small>'}</td><td><small>${esc(p.contactName || '')}<br>${esc(p.email)}</small></td><td>${p.status !== 'online' && p.bio ? btn(p, 'freigeben', 'Freigeben', 'btn-red') : ''}${p.status === 'online' ? btn(p, 'offline', 'Offline nehmen') : ''}${btn(p, 'link', 'Neuen Link senden')}</td></tr>`).join('')}</tbody></table>` : '<p>Noch kein Partner angelegt.</p>'}</div>` }));
  });

  app.post('/vorstand/partner/anlegen', board, async (req, res) => {
    const b = req.body || {}, name = txt(b.name, 80), email = txt(b.email, 254).toLowerCase();
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return back(res, 'Bitte Firma und gültige E-Mail angeben.');
    let slug = slugify(name) || 'partner'; for (let i = 2; await store.getPartner(slug); i++) slug = `${slugify(name)}-${i}`;
    try {
      const p = await store.createPartner({ slug, name, contactName: txt(b.contactName, 80), email, category: CATEGORIES.includes(b.category) ? b.category : CATEGORIES[0] });
      await invite(p); back(res, `Einladung an ${email} gesendet.`);
    } catch (e) { console.error('Partner:', e.message); back(res, 'Das hat nicht geklappt. Bitte versuche es nochmals.'); }
  });

  app.post('/vorstand/partner/:slug/:action', board, async (req, res) => {
    const p = await store.getPartner(req.params.slug); if (!p) return back(res, 'Partner nicht gefunden.');
    try {
      if (req.params.action === 'freigeben') { await store.setPartnerStatus(p.slug, 'online'); return back(res, `${p.name} ist online.`); }
      if (req.params.action === 'offline') { await store.setPartnerStatus(p.slug, 'offline'); return back(res, `${p.name} ist offline.`); }
      if (req.params.action === 'link') { await store.bumpPartnerVersion(p.slug); await invite(await store.getPartner(p.slug), true); return back(res, 'Neuer Link gesendet, der alte ist ungültig.'); }
      back(res, 'Unbekannte Aktion.');
    } catch (e) { console.error('Partner:', e.message); back(res, 'Das hat nicht geklappt.'); }
  });

  app.get('/partner/:slug', async (req, res) => {
    const p = await store.getPartner(req.params.slug);
    if (!p || p.status !== 'online') return missing(req, res);
    const showOffer = req.user && offerActive(p);
    res.send(page({ title: p.name, user: req.user, publicNav: true, index: true, canonical: `/partner/${p.slug}`, description: p.bio.slice(0, 160),
      jsonld: { '@context': 'https://schema.org', '@type': 'Organization', name: p.name, description: p.bio, ...(p.website ? { url: p.website } : {}) },
      body: `<nav class="crumbs" aria-label="Brotkrumen"><a href="/">Start</a> › <a href="/partner">Partner</a> › ${esc(p.name)}</nav>
<article class="partner-profile">${p.hasLogo ? `<img class="plogo" src="/partner/logo/${esc(p.slug)}" alt="${esc(p.name)}">` : ''}<h1 class="display h-l">${esc(p.name)}</h1><p class="muted">${esc(p.category || 'Partner')}</p><p class="lead" style="margin:16px 0">${esc(p.bio)}</p>
${p.website ? `<p>${ext(p.website)}Website von ${esc(p.name)}</a></p>` : ''}
${offerActive(p) ? `<div class="card offer"><h2 class="h-m">Angebot für Mitglieder</h2>${showOffer ? `<p><strong>${esc(p.offerTitle)}</strong></p><p>${esc(p.offerText)}</p>${p.offerCode ? `<p>Code: <code class="code">${esc(p.offerCode)}</code></p>` : ''}${p.offerUrl ? `<p>${ext(p.offerUrl)}Zum Angebot</a></p>` : ''}${p.offerUntil ? `<p class="muted">Gültig bis ${fmtDate(p.offerUntil)}</p>` : ''}` : `<p>${esc(p.name)} macht den Mitgliedern des Verbands ein besonderes Angebot. Du siehst es nach dem Login.</p><p><a class="btn btn-black small" href="/login.html">Login</a> <a class="btn btn-line-dark small" href="/mitglied-werden.html">Mitglied werden</a></p>`}</div>` : ''}</article>` }));
  });
}
