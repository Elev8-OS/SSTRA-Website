/**
 * Baustellen-Sperre: Solange die Railway-Variable SITE_PASSWORD gesetzt ist,
 *  - verlangt jede Seite den Zugangscode (ein Passwort für alle, Cookie 7 Tage),
 *  - tragen alle Antworten «noindex» (Header X-Robots-Tag und Meta-Tag),
 *  - sagt robots.txt allen Suchmaschinen «Disallow: /».
 * Zum Livegang die Variable löschen: dann ist alles wieder öffentlich und indexierbar.
 * Ausgenommen: /health (Railway), der Stripe-Webhook (eigene Signatur) sowie CSS und Schriften für die Sperrseite.
 */
import crypto from 'node:crypto';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { config, isProd } from './config.js';

const COOKIE = 'site_access';
const OPEN = /^\/(health$|css\/|fonts\/|favicon\.svg$)/;
const sign = (pw) => crypto.createHmac('sha256', config.sessionSecret).update('gate:' + pw).digest('base64url');
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const cookieOf = (req, n) => (req.headers.cookie || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(n + '='))?.slice(n.length + 1);
const safeNext = (n) => (typeof n === 'string' && /^\/(?![/\\])/.test(n) ? n : '/');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Fügt «noindex» in jede ausgelieferte HTML-Seite ein (zusätzlich zum Header). */
export function noindexHtml(html) {
  if (/<meta name="robots"/i.test(html)) return html.replace(/<meta name="robots" content="[^"]*">/i, '<meta name="robots" content="noindex,nofollow">');
  return html.replace(/<head([^>]*)>/i, '<head$1><meta name="robots" content="noindex,nofollow">');
}

function gatePage({ error = false, next = '/' } = {}) {
  return `<!DOCTYPE html><html lang="de-CH"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Website im Aufbau</title><link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#000;color:#fff;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;padding:24px}
main{width:100%;max-width:440px}.tag{font-size:.8rem;letter-spacing:.14em;text-transform:uppercase;color:#a8a8a8;margin:0 0 14px}
h1{font-weight:300;font-size:clamp(2rem,6vw,2.8rem);line-height:1.05;letter-spacing:-.02em;margin:0 0 14px}p{color:#d0d0d0;line-height:1.5;margin:0 0 22px}
form{display:flex;gap:10px;flex-wrap:wrap}input{flex:1 1 200px;font:inherit;padding:14px 18px;border-radius:999px;border:1px solid #444;background:#fff;color:#000}
button{font:inherit;font-weight:600;padding:14px 26px;border-radius:999px;border:0;background:#C0100D;color:#fff;cursor:pointer}button:hover{background:#a00d0b}
.err{background:#3a0a09;border:1px solid #C0100D;color:#fff;border-radius:12px;padding:10px 14px;margin:0 0 16px}small{display:block;margin-top:26px;color:#777}
</style></head><body><main>
<p class="tag">Swiss Short Term Rental Association</p><h1>Diese Website ist noch im Aufbau.</h1>
<p>Sie ist noch nicht öffentlich. Wenn du einen Zugangscode hast, gib ihn hier ein.</p>
${error ? '<p class="err" role="alert">Der Code stimmt nicht. Bitte versuche es nochmals.</p>' : ''}
<form method="post" action="/gate"><input type="hidden" name="next" value="${esc(next)}"><label class="sr" for="pw" style="position:absolute;left:-9999px">Zugangscode</label>
<input id="pw" name="password" type="password" placeholder="Zugangscode" autocomplete="current-password" required autofocus><button type="submit">Öffnen</button></form>
<small>This website is not public yet.</small></main></body></html>`;
}

export function mountGate(app) {
  const pw = process.env.SITE_PASSWORD || '';
  if (!pw) return;
  const token = sign(pw);
  const limiter = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: true, legacyHeaders: false, message: 'Zu viele Versuche. Bitte versuche es in einigen Minuten nochmals.' });

  app.use((req, res, next) => {
    res.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
    const send = res.send.bind(res);
    res.send = (body) => (typeof body === 'string' && /<head[\s>]/i.test(body) ? send(noindexHtml(body)) : send(body));
    if (req.path === '/robots.txt') return res.type('text/plain').send('User-agent: *\nDisallow: /\n');
    if (OPEN.test(req.path) || (req.method === 'POST' && req.path === '/api/stripe/webhook')) return next();
    if (same(cookieOf(req, COOKIE) || '', token)) return next();
    if (req.method === 'POST' && req.path === '/gate') return next();
    res.set('Cache-Control', 'no-store');
    const asPage = ['GET', 'HEAD'].includes(req.method) && req.accepts('html') && !/\.(?!html$)[a-z0-9]{2,5}$/i.test(req.path);
    if (asPage) return res.status(401).send(gatePage({ next: req.originalUrl }));
    return res.status(401).type('application/json').send(JSON.stringify({ error: 'Diese Website ist noch nicht öffentlich.' }));
  });

  app.post('/gate', limiter, express.urlencoded({ extended: false, limit: '2kb' }), (req, res) => {
    const next = safeNext(req.body?.next);
    if (same(sign(String(req.body?.password || '').trim()), token)) {
      res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: isProd, maxAge: 7 * 864e5, path: '/' });
      return res.redirect(303, next);
    }
    res.set('Cache-Control', 'no-store').status(401).send(gatePage({ error: true, next }));
  });
}
