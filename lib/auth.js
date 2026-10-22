import jwt from 'jsonwebtoken';
import { config, isProd } from './config.js';
import { userFromContact, canSee } from './roles.js';

const COOKIE = 'vsession';
const SESSION_HOURS = 12;
const used = new Map(); // einmalige Login-Links (pro Instanz; bei mehreren Instanzen Redis nutzen)

const sign = (payload, expiresIn) => jwt.sign(payload, config.sessionSecret, { expiresIn, algorithm: 'HS256' });
const verify = (token, typ) => {
  const p = jwt.verify(token, config.sessionSecret, { algorithms: ['HS256'] });
  if (p.typ !== typ) throw new Error('falscher Token-Typ');
  return p;
};

export const magicToken = (email) => sign({ typ: 'magic', email, jti: Math.random().toString(36).slice(2) }, '15m');
export const payToken = (email, plan) => sign({ typ: 'pay', email, plan }, '14d');

export function consumeMagic(token) {
  const p = verify(token, 'magic');
  if (used.has(p.jti)) throw new Error('Link bereits verwendet');
  used.set(p.jti, Date.now());
  for (const [k, t] of used) if (Date.now() - t > 20 * 60 * 1000) used.delete(k);
  return p.email;
}
export const readPayToken = (token) => verify(token, 'pay');

export function startSession(res, user) {
  const token = sign({ typ: 'session', email: user.email }, `${SESSION_HOURS}h`);
  res.cookie(COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: SESSION_HOURS * 3600 * 1000,
    path: '/'
  });
}
export const endSession = (res) => res.clearCookie(COOKIE, { path: '/' });

/**
 * Lädt bei jeder Anfrage den aktuellen Zustand aus GHL (Tags),
 * so wirken Änderungen (Rolle entzogen, Beitrag abgelaufen) sofort.
 */
export function loadUser(ghl) {
  const cache = new Map(); // kurzer Cache (30 s) gegen GHL-Rate-Limits
  const middleware = async (req, _res, next) => {
    req.user = null;
    const token = req.cookies?.[COOKIE];
    if (!token) return next();
    try {
      const { email } = verify(token, 'session');
      const hit = cache.get(email);
      if (hit && Date.now() - hit.at < 30_000) { req.user = hit.user; return next(); }
      const contact = await ghl.getContactByEmail(email);
      const user = userFromContact(email, contact);
      cache.set(email, { at: Date.now(), user });
      req.user = user.role ? user : null;
    } catch { /* ungültige Session: als anonym behandeln */ }
    next();
  };
  /** Nach Rollen-/Statusänderungen und beim Login aufrufen, damit die Änderung sofort wirkt. */
  middleware.invalidate = (email) => { if (email) cache.delete(String(email).toLowerCase()); else cache.clear(); };
  return middleware;
}

/** Zugriff nur für eingeloggte Nutzer mit passender Rolle. */
export function requireRole(allowed, { allowExpired = false } = {}) {
  return (req, res, next) => {
    const u = req.user;
    if (!u) {
      if (req.path.startsWith('/api')) return res.status(401).json({ error: 'Nicht angemeldet' });
      return res.redirect(303, '/login.html');
    }
    const ok = allowExpired && u.expired ? true : canSee(u, allowed);
    if (!ok) {
      if (req.path.startsWith('/api')) return res.status(403).json({ error: 'Keine Berechtigung' });
      return res.status(403).send('Keine Berechtigung');
    }
    next();
  };
}

/** Einfacher CSRF-Schutz: Anfragen mit Seiteneffekt müssen von unserer Seite kommen. */
/** Erlaubte Herkünfte: BASE_URL sowie dieselbe Domain mit und ohne www. */
export function allowedOrigins() {
  const u = new URL(config.baseUrl);
  const hosts = new Set([u.host, u.host.startsWith('www.') ? u.host.slice(4) : 'www.' + u.host]);
  return [...hosts].map((h) => `${u.protocol}//${h}`);
}

export function sameOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.path === '/api/stripe/webhook') return next();
  const origin = req.get('origin') || (req.get('referer') ? new URL(req.get('referer')).origin : null);
  if (origin && allowedOrigins().includes(origin)) return next();
  if (!origin && !isProd) return next();
  return res.status(403).json({ error: 'Ungültige Herkunft' });
}

/** Leitet www-lose oder andere Alias-Hosts auf BASE_URL um, damit Cookies und Links eine Adresse haben. */
export function canonicalHost(req, res, next) {
  if (!config.baseUrl.startsWith('https://')) return next();
  const want = new URL(config.baseUrl).host;
  const host = req.get('host');
  if (!host || host === want || req.path === '/health' || req.path === '/api/stripe/webhook') return next();
  const alt = want.startsWith('www.') ? want.slice(4) : 'www.' + want;
  if (host === alt) return res.redirect(301, config.baseUrl + req.originalUrl);
  next();
}
