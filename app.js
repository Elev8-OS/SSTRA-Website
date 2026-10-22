import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import fs from 'node:fs';
import { marked } from 'marked';
import { config, isProd } from './lib/config.js';
import { TAG, roleTag, planTag, userFromContact, isBoard, tagValue } from './lib/roles.js';
import { loadUser, requireRole, sameOrigin, startSession, endSession, consumeMagic, readPayToken } from './lib/auth.js';
import { activateMember, approveApplication, rejectApplication, setRole, payLink, loginLink } from './lib/membership.js';
import { esc, page, mailHtml, ROLE_LABEL } from './lib/views.js';
import { mountRegions } from './lib/regions.js';
import { mountAddress } from './lib/address.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const clean = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const limiter = (max, minutes = 15) => rateLimit({ windowMs: minutes * 60_000, limit: max, standardHeaders: true, legacyHeaders: false, message: { error: 'Zu viele Anfragen. Bitte versuche es später nochmals.' } });
const isBot = (b) => !!b.website || (Number.isFinite(+b.elapsed) && +b.elapsed < 1500);
const here = path.dirname(new URL(import.meta.url).pathname);

const docs = () => JSON.parse(fs.readFileSync(path.join(here, 'content/members/index.json'), 'utf8'));

export function createApp({ ghl, payments, geoFetch }) {
  const app = express();
  app.set('trust proxy', 1); // Railway sitzt hinter einem Proxy
  app.disable('x-powered-by');
  app.use(compression());
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
        scriptSrc: ["'self'"],
        formAction: ["'self'", 'https://checkout.stripe.com'],
        frameAncestors: ["'none'"]
      }
    }
  }));

  app.get('/health', (_req, res) => res.json({ ok: true }));

  // ---- Stripe-Webhook (Rohdaten, vor express.json) ----
  app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    let event;
    try { event = payments.constructEvent(req.body, req.get('stripe-signature')); }
    catch (e) { return res.status(400).send('Ungültige Signatur'); }
    try {
      if (event.type === 'checkout.session.completed' && event.data.object.payment_status === 'paid') {
        const s = event.data.object;
        await activateMember({ ghl, email: s.metadata.email, planKey: s.metadata.plan, ref: s.id });
        users.invalidate(s.metadata.email);
      }
      res.json({ received: true });
    } catch (e) {
      console.error('Webhook-Fehler', e);
      res.status(500).json({ error: 'Verarbeitung fehlgeschlagen' }); // Stripe versucht es erneut
    }
  });

  app.use(express.json({ limit: '50kb' }));
  app.use(express.urlencoded({ extended: false, limit: '50kb' }));
  app.use(cookieParser());
  app.use(sameOrigin);
  const users = loadUser(ghl);
  app.use(users);

  // ---- Öffentliche API ----
  app.get('/api/plans', (_req, res) => {
    res.json(Object.entries(config.plans).map(([key, p]) => ({ key, name: p.name, description: p.description, amountChf: p.amountChf, role: p.role })));
  });

  app.post('/api/newsletter', limiter(10), async (req, res) => {
    const b = req.body || {};
    if (isBot(b)) return res.json({ ok: true }); // Bots bekommen kein Feedback
    const email = clean(b.email, 254).toLowerCase();
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Bitte gib eine gültige E-Mail-Adresse ein.' });
    if (b.consent !== true) return res.status(400).json({ error: 'Bitte bestätige die Datenschutzerklärung.' });
    try {
      await ghl.upsertContact({ email, tags: [TAG.newsletter, TAG.consentNewsletter], source: 'Website Newsletter' });
      res.json({ ok: true });
    } catch (e) { console.error(e); res.status(502).json({ error: 'Anmeldung momentan nicht möglich.' }); }
  });

  app.post('/api/contact', limiter(10), async (req, res) => {
    const b = req.body || {};
    if (isBot(b)) return res.json({ ok: true });
    const email = clean(b.email, 254).toLowerCase();
    const name = clean(b.name, 120);
    const message = clean(b.message, 3000);
    if (!EMAIL_RE.test(email) || !message) return res.status(400).json({ error: 'Bitte E-Mail und Nachricht angeben.' });
    try {
      const c = await ghl.upsertContact({ email, firstName: name, tags: [TAG.contact], source: 'Website Kontakt' });
      await ghl.addNote(c.id, `Kontaktformular:\n${message}`);
      await ghl.notify('contact.received', { email, name });
      res.json({ ok: true });
    } catch (e) { console.error(e); res.status(502).json({ error: 'Senden momentan nicht möglich.' }); }
  });

  app.post('/api/apply', limiter(10), async (req, res) => {
    const b = req.body || {};
    if (isBot(b)) return res.json({ ok: true, mode: 'received' });
    const planKey = clean(b.plan, 40);
    const plan = config.plans[planKey];
    const email = clean(b.email, 254).toLowerCase();
    const firstName = clean(b.firstName, 80), lastName = clean(b.lastName, 80);
    if (!plan) return res.status(400).json({ error: 'Bitte wähle eine Mitgliedschaft.' });
    if (!EMAIL_RE.test(email) || !firstName || !lastName) return res.status(400).json({ error: 'Bitte Vorname, Nachname und E-Mail angeben.' });
    if (b.consent !== true) return res.status(400).json({ error: 'Bitte bestätige die Datenschutzerklärung und die Statuten.' });
    const invoice = b.payment === 'rechnung';
    const canton = clean(b.canton, 2).toLowerCase();
    const tags = [TAG.applied, planTag(planKey), TAG.consentMembership];
    if (invoice) tags.push(TAG.invoice);
    if (/^[a-z]{2}$/.test(canton)) tags.push(`kanton:${canton}`);
    try {
      const existing = await ghl.getContactByEmail(email);
      if (existing?.tags.includes(TAG.active)) return res.status(409).json({ error: 'Mit dieser E-Mail besteht bereits eine Mitgliedschaft. Bitte melde dich an.' });
      const c = await ghl.upsertContact({ email, firstName, lastName, phone: clean(b.phone, 40), companyName: clean(b.company, 120), tags, source: 'Website Mitgliedsantrag' });
      await ghl.addNote(c.id, `Mitgliedsantrag ${plan.name}\nObjekte: ${clean(b.objects, 20) || '-'}\nKanton: ${canton || '-'}\nZahlung: ${invoice ? 'Rechnung' : 'online'}\nNachricht: ${clean(b.message, 2000) || '-'}`);
      await ghl.notify('application.received', { email, plan: planKey, name: `${firstName} ${lastName}`, company: clean(b.company, 120) });
      if (!plan.requireApproval && !invoice && plan.amountChf) {
        return res.json({ ok: true, mode: 'checkout', url: payLink(email, planKey) });
      }
      await ghl.sendEmail(c.id, 'Wir haben deinen Antrag erhalten', mailHtml({
        heading: 'Danke für deinen Antrag',
        paragraphs: [`Wir haben deinen Antrag für die Mitgliedschaft <strong>${esc(plan.name)}</strong> erhalten. Der Vorstand prüft ihn und meldet sich in der Regel innert weniger Tage bei dir.`]
      }));
      res.json({ ok: true, mode: 'received' });
    } catch (e) { console.error(e); res.status(502).json({ error: 'Antrag momentan nicht möglich. Bitte versuche es später nochmals.' }); }
  });

  // ---- Bezahlen ----
  app.get('/bezahlen', async (req, res) => {
    try {
      const { email, plan } = readPayToken(String(req.query.token || ''));
      const contact = await ghl.getContactByEmail(email);
      if (!contact) return res.status(404).send('Antrag nicht gefunden');
      const url = await payments.createCheckout({ email, planKey: plan, contactId: contact.id });
      res.redirect(303, url);
    } catch (e) {
      console.error(e.message);
      res.status(400).send('Dieser Zahlungslink ist ungültig oder abgelaufen. Bitte melde dich bei der Geschäftsstelle.');
    }
  });
  app.post('/mitglieder/erneuern', requireRole(['mitglied', 'foerdermitglied'], { allowExpired: true }), async (req, res) => {
    try {
      const url = await payments.createCheckout({ email: req.user.email, planKey: req.user.plan, contactId: req.user.contactId });
      res.redirect(303, url);
    } catch (e) { res.status(400).send(esc(e.message)); }
  });
  if (!isProd) { // Zahlungs-Simulator nur lokal
    app.get('/dev/pay', async (req, res) => {
      await activateMember({ ghl, email: String(req.query.email), planKey: String(req.query.plan), ref: 'dev_' + Date.now() });
      res.redirect(303, '/login.html?bezahlt=1');
    });
  }

  // ---- Login (Magic Link) ----
  app.post('/api/auth/login', limiter(8), async (req, res) => {
    const email = clean(req.body?.email, 254).toLowerCase();
    const generic = { ok: true, message: 'Falls ein Konto existiert, haben wir dir einen Login-Link geschickt. Er ist 15 Minuten gültig.' };
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Bitte gib eine gültige E-Mail-Adresse ein.' });
    try {
      let contact = await ghl.getContactByEmail(email);
      if (!contact && config.adminEmails.includes(email)) contact = await ghl.upsertContact({ email, tags: [], source: 'Admin-Bootstrap' });
      const user = userFromContact(email, contact);
      if (contact && user.role) {
        await ghl.sendEmail(contact.id, 'Dein Login-Link', mailHtml({
          heading: 'Dein Login-Link',
          paragraphs: ['Mit diesem Link meldest du dich im Mitgliederbereich an. Er ist 15 Minuten gültig und nur einmal verwendbar. Hast du ihn nicht angefordert, kannst du diese Mail ignorieren.'],
          button: { label: 'Jetzt anmelden', url: loginLink(email) }
        }));
      }
      res.json(generic); // immer gleiche Antwort: keine Konto-Erkennung von aussen
    } catch (e) { console.error(e); res.status(502).json({ error: 'Login momentan nicht möglich.' }); }
  });

  // Zwischenseite: Mail-Scanner lösen den Link sonst automatisch ein
  app.get('/auth/verify', (req, res) => {
    const token = esc(String(req.query.token || ''));
    res.send(page({ title: 'Anmelden', body: `<div class="card narrow"><h1 class="display h-m">Anmelden</h1><p>Bestätige die Anmeldung im Mitgliederbereich.</p>
      <form method="post" action="/auth/verify"><input type="hidden" name="token" value="${token}"><button class="btn btn-red" type="submit">Jetzt anmelden</button></form></div>` }));
  });
  app.post('/auth/verify', async (req, res) => {
    try {
      const email = consumeMagic(String(req.body.token || ''));
      users.invalidate(email);
      const user = userFromContact(email, await ghl.getContactByEmail(email));
      if (!user.role) throw new Error('kein Zugang');
      startSession(res, user);
      res.redirect(303, '/mitglieder');
    } catch {
      res.status(400).send(page({ title: 'Link ungültig', body: '<div class="card narrow"><h1 class="display h-m">Link ungültig</h1><p>Der Link ist abgelaufen oder wurde schon verwendet.</p><p><a class="btn btn-red" href="/login.html">Neuen Link anfordern</a></p></div>' }));
    }
  });
  app.post('/auth/logout', (_req, res) => { endSession(res); res.redirect(303, '/'); });

  // ---- Mitgliederbereich ----
  const member = requireRole(['mitglied', 'foerdermitglied'], { allowExpired: true });
  app.get('/mitglieder', member, (req, res) => {
    const u = req.user;
    const visible = docs().filter((d) => !d.board && (u.expired ? false : (isBoard(u.role) || d.roles.includes(u.role))));
    const fmt = (d) => (d ? d.split('-').reverse().join('.') : '–');
    const banner = req.query.bezahlt ? '<div class="alert ok">Danke! Deine Zahlung ist eingegangen. Die Freischaltung kann einige Sekunden dauern.</div>' : '';
    const expired = u.expired ? `<div class="alert err">Dein Beitrag ist am ${fmt(u.until)} abgelaufen. Bitte erneuere deine Mitgliedschaft, um wieder Zugriff zu erhalten.
      <form method="post" action="/mitglieder/erneuern" style="margin-top:12px"><button class="btn btn-red" type="submit">Beitrag erneuern</button></form></div>` : '';
    res.send(page({ title: 'Mitgliederbereich', user: u, body: `
      <h1 class="display h-l">Hallo ${esc(u.name.split(' ')[0])}</h1>${banner}${expired}
      <div class="grid2"><div class="card"><h2 class="h-m">Deine Mitgliedschaft</h2><dl class="facts">
        <div><dt>Rolle</dt><dd>${ROLE_LABEL[u.role]}</dd></div>
        <div><dt>Kategorie</dt><dd>${esc(config.plans[u.plan]?.name || '–')}</dd></div>
        <div><dt>Mitglied seit</dt><dd>${fmt(u.since)}</dd></div>
        <div><dt>Beitrag gültig bis</dt><dd>${isBoard(u.role) && !u.until ? '–' : fmt(u.until)}</dd></div></dl></div>
      <div class="card"><h2 class="h-m">Dokumente und Wissen</h2>${visible.length ? `<ul class="doclist">${visible.map((d) => `<li><a href="/mitglieder/dok/${esc(d.slug)}">${esc(d.title)}</a><span>${esc(d.summary || '')}</span></li>`).join('')}</ul>` : '<p>Aktuell keine Dokumente für deine Rolle.</p>'}</div></div>` }));
  });

  app.get('/mitglieder/dok/:slug', member, (req, res) => {
    const d = docs().find((x) => x.slug === req.params.slug);
    if (!d || (!isBoard(req.user.role) && (d.board || !d.roles.includes(req.user.role))) || (d.board && !isBoard(req.user.role)) || req.user.expired) return res.status(404).send(page({ title: 'Nicht gefunden', user: req.user, body: '<div class="card narrow"><h1 class="display h-m">Nicht gefunden</h1></div>' }));
    const file = path.join(here, 'content/members', path.basename(d.file)); // nur Dateinamen aus dem Manifest
    if (d.file.endsWith('.md')) {
      return res.send(page({ title: d.title, user: req.user, body: `<article class="card prose">${marked.parse(fs.readFileSync(file, 'utf8'))}</article><p><a href="${d.board ? '/vorstand' : '/mitglieder'}">Zurück</a></p>` }));
    }
    res.setHeader('Content-Disposition', `inline; filename="${path.basename(d.file)}"`);
    res.sendFile(file);
  });

  // ---- Vorstandsbereich ----
  const board = requireRole(['vorstand']);
  const adminOnly = (req, res, next) => (req.user?.role === 'admin' ? next() : res.status(403).json({ error: 'Nur Administration' }));

  app.get('/vorstand', board, async (req, res) => {
    try {
      const [open, approved, active] = await Promise.all([ghl.listByTag(TAG.applied), ghl.listByTag(TAG.approved), ghl.listByTag(TAG.active)]);
      const row = (c, actions) => `<tr><td>${esc(c.firstName)} ${esc(c.lastName)}<br><small>${esc(c.email)}</small></td><td>${esc(c.companyName)}</td><td>${esc(config.plans[tagValue(c.tags, 'kategorie:')]?.name || '–')}${c.tags.includes(TAG.invoice) ? '<br><small>Rechnung</small>' : ''}</td><td class="actions">${actions}</td></tr>`;
      const post = (action, id, label, cls = 'btn-black') => `<button class="btn ${cls} small" data-action="${action}" data-id="${esc(id)}">${label}</button>`;
      const isAdmin = req.user.role === 'admin';
      const boardDocs = docs().filter((d) => d.board);
      res.send(page({ title: 'Vorstand', user: req.user, wide: true, body: `
        <h1 class="display h-l">Vorstand</h1><div class="alert" id="msg" role="status" hidden></div>
        <div class="card"><h2 class="h-m">Offene Anträge (${open.length})</h2>${open.length ? `<table><thead><tr><th>Person</th><th>Firma</th><th>Kategorie</th><th></th></tr></thead><tbody>${open.map((c) => row(c, post('approve', c.id, 'Freigeben', 'btn-red') + post('reject', c.id, 'Ablehnen', 'btn-line-dark'))).join('')}</tbody></table>` : '<p>Keine offenen Anträge.</p>'}</div>
        <div class="card"><h2 class="h-m">Freigegeben, Zahlung ausstehend (${approved.length})</h2>${approved.length ? `<table><tbody>${approved.map((c) => row(c, post('markpaid', c.id, 'Zahlung bestätigen', 'btn-red'))).join('')}</tbody></table>` : '<p>Keine ausstehenden Zahlungen.</p>'}</div>
        <div class="card"><h2 class="h-m">Aktive Mitglieder (${active.length})</h2><table><thead><tr><th>Person</th><th>Firma</th><th>Kategorie</th><th>Rolle${isAdmin ? ' ändern' : ''}</th></tr></thead><tbody>${active.map((c) => {
          const r = (c.tags.find((t) => t.startsWith('rolle:')) || '').slice(6);
          const sel = isAdmin ? `<select data-role-for="${esc(c.id)}">${['foerdermitglied', 'mitglied', 'vorstand'].map((x) => `<option value="${x}" ${x === r ? 'selected' : ''}>${ROLE_LABEL[x]}</option>`).join('')}</select>` : esc(ROLE_LABEL[r] || r);
          return `<tr><td>${esc(c.firstName)} ${esc(c.lastName)}<br><small>${esc(c.email)}</small></td><td>${esc(c.companyName)}</td><td>${esc(config.plans[tagValue(c.tags, 'kategorie:')]?.name || '–')}<br><small>bis ${esc(tagValue(c.tags, 'bis:') || '–')}</small></td><td>${sel}</td></tr>`;
        }).join('')}</tbody></table></div>
        <div class="card"><h2 class="h-m">Vorstandsunterlagen</h2>${boardDocs.length ? `<ul class="doclist">${boardDocs.map((d) => `<li><a href="/mitglieder/dok/${esc(d.slug)}">${esc(d.title)}</a><span>${esc(d.summary || '')}</span></li>`).join('')}</ul>` : '<p>Keine Unterlagen.</p>'}</div>
        <script src="/js/board.js" defer></script>` }));
    } catch (e) { console.error(e); res.status(502).send('GHL momentan nicht erreichbar.'); }
  });

  const act = (fn) => async (req, res) => {
    try { res.json({ ok: true, ...(await fn(req)) }); }
    catch (e) { console.error(e); res.status(400).json({ error: e.message || 'Aktion fehlgeschlagen' }); }
  };
  app.post('/api/board/approve', board, act((req) => approveApplication({ ghl, payments, contactId: clean(req.body.contactId, 60) })));
  app.post('/api/board/reject', board, act((req) => rejectApplication({ ghl, contactId: clean(req.body.contactId, 60) })));
  app.post('/api/board/mark-paid', board, act(async (req) => {
    const c = await ghl.getContactById(clean(req.body.contactId, 60));
    if (!c) throw new Error('Kontakt nicht gefunden');
    const r = await activateMember({ ghl, email: c.email, planKey: tagValue(c.tags, 'kategorie:'), ref: 'manual_' + Date.now() });
    users.invalidate(c.email);
    return r;
  }));
  app.post('/api/board/role', board, adminOnly, act(async (req) => {
    const c = await ghl.getContactById(clean(req.body.contactId, 60));
    if (!c) throw new Error('Kontakt nicht gefunden');
    await setRole({ ghl, contactId: c.id, role: clean(req.body.role, 20) });
    users.invalidate(c.email);
    return {};
  }));

  // ---- Regionen und Stammtische ----
  mountRegions(app, { ghl, users });
  mountAddress(app, { fetchJson: geoFetch });

  // ---- Statische Website ----
  app.use(express.static(path.join(here, 'public'), { extensions: ['html'], maxAge: isProd ? '1h' : 0 }));
  app.use((_req, res) => res.status(404).send(page({ title: 'Nicht gefunden', body: '<div class="card narrow"><h1 class="display h-m">Seite nicht gefunden</h1><p><a href="/">Zur Startseite</a></p></div>' })));

  return app;
}
