/**
 * Mehrsprachigkeit: Deutsch (Standard, ohne Präfix) sowie /fr, /it, /en.
 * - Die Seiten werden auf Deutsch gebaut und beim Ausliefern anhand von content/i18n/{fr,it,en}.json übersetzt
 *   (Schlüssel = deutscher Originaltext). Fehlt ein Eintrag, bleibt der deutsche Text stehen.
 * - Erkennung: URL-Präfix > Cookie «Lang» > Browsersprache (nur Startseite, nur beim ersten Besuch).
 * - Seiten ausserhalb von TRANSLATED bleiben deutsch und tragen einen Hinweis.
 * Fehlende Übersetzungen anzeigen: npm run i18n:check
 */
import fs from 'node:fs';
import path from 'node:path';
import { config, isProd } from './config.js';

const here = path.dirname(new URL(import.meta.url).pathname);
export const LANGS = ['de', 'fr', 'it', 'en'];
export const DEFAULT = 'de';
const NAME = { de: 'Deutsch', fr: 'Français', it: 'Italiano', en: 'English' };
const HTML_LANG = { de: 'de-CH', fr: 'fr-CH', it: 'it-CH', en: 'en' };
const OG_LOCALE = { de: 'de_CH', fr: 'fr_CH', it: 'it_CH', en: 'en_GB' };
const PICK = { de: 'Sprache wählen', fr: 'Choisir la langue', it: 'Scegliere la lingua', en: 'Choose language' };
const SITE = /\s\|\sSwiss Short Term Rental( Association)?$/;

/** Seiten, die vollständig übersetzt sind. Alle anderen öffentlichen Seiten bleiben deutsch (mit Hinweis). */
export const TRANSLATED = new Set(['/', '/verband', '/aktuell', '/studie', '/login.html', '/mitglied-werden.html']);

const PLAIN = /^\/(css|js|fonts|data|media|api|auth|rechnung|dev|demo|mitglieder|vorstand|bezahlen|health|partner\/logo|partner\/logo-upload|partner\/bearbeiten)(\/|$)|^\/(robots|sitemap|llms|llms-full|favicon|og-image)|\.(svg|png|jpe?g|webp|pdf|mp4|json|csv|txt|xml|md|ico|woff2?)$/i;
const prefixable = (p) => !PLAIN.test(p);
export const urlFor = (lang, p) => { const x = p || '/'; return lang === DEFAULT ? x : x === '/' ? `/${lang}/` : `/${lang}${x}`; };

/* ---------- Wörterbuch ---------- */
const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
let DICT;
function load() {
  if (DICT) return DICT;
  const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(here, '../content/i18n', f), 'utf8')); } catch { return {}; } };
  const dir = path.join(here, '../content/i18n');
  const cantons = read('cantons.json');
  DICT = { keep: new Set((read('common.json').keep || []).map(norm)) };
  ['fr', 'it', 'en'].forEach((l, i) => {
    // fr.json plus optionale Ergänzungen wie fr.extra.json
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => new RegExp(`^${l}(\\..+)?\\.json$`).test(f)).sort((a, b) => (a === `${l}.json` ? -1 : b === `${l}.json` ? 1 : a.localeCompare(b))) : [];
    const strings = {}, client = {}, patterns = [];
    for (const f of files) { const j = read(f); Object.assign(strings, j.strings); Object.assign(client, j.client); patterns.push(...(j.patterns || [])); }
    for (const [de, tr] of Object.entries(cantons)) { strings[de] ??= tr[i]; client[de] ??= tr[i]; }
    DICT[l] = { strings: new Map(Object.entries(strings).map(([k, v]) => [norm(k), v])), client, patterns: patterns.map(([re, rep]) => [new RegExp(re), rep]) };
  });
  return DICT;
}
const dec = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&amp;/g, '&');
const encText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const encAttr = (s) => encText(s).replace(/"/g, '&quot;');

function translateCore(core, d, keep, missing) {
  let suffix = '';
  const sm = SITE.exec(core);
  if (sm) { suffix = sm[0]; core = core.slice(0, sm.index); }
  const hit = d.strings.get(core);
  if (hit !== undefined) return hit + suffix;
  for (const [re, rep] of d.patterns) if (re.test(core)) return core.replace(re, rep) + suffix;
  if (keep.has(core) || !/\p{L}{2,}/u.test(core.replace(/CHF/g, ''))) return null;
  missing?.add(core);
  return null;
}

const SKIP = /(<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<svg\b[\s\S]*?<\/svg>)/i;
export function translateHtml(html, lang, missing = null) {
  const D = load(), d = D[lang];
  if (!d) return html;
  const one = (raw, enc) => {
    const text = dec(raw), m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text), core = norm(m[2]);
    if (!core) return null;
    const t = translateCore(core, d, D.keep, missing);
    return t == null ? null : m[1] + enc(t) + m[3];
  };
  return html.split(SKIP).map((seg, i) => {
    if (i % 2) return seg;
    seg = seg.replace(/<([a-z][\w-]*)\b([^<>]*)>/gi, (m, tag, attrs) => {
      const out = attrs.replace(/\b(placeholder|aria-label|alt|title|content)="([^"]*)"/g, (mm, name, val) => {
        if (name === 'content' && !(tag.toLowerCase() === 'meta' && /(name="description"|property="og:(title|description)")/.test(attrs))) return mm;
        const t = one(val, encAttr);
        return t == null ? mm : `${name}="${t}"`;
      });
      return `<${tag}${out}>`;
    });
    return seg.replace(/>([^<>]+)</g, (m, t) => { const r = one(t, encText); return r == null ? m : `>${r}<`; });
  }).join('');
}

/** Alle noch nicht übersetzten deutschen Texte einer Seite (für Tests und npm run i18n:check). */
export function missingStrings(html, lang) {
  const missing = new Set();
  translateHtml(html, lang, missing);
  return [...missing];
}

/* ---------- Seite für eine Sprache aufbereiten ---------- */
const normPath = (p) => (p.length > 1 ? p.replace(/\/+$/, '') : p);
const NOTE = 'Diese Seite ist derzeit nur auf Deutsch verfügbar.';

function switcher(lang, p) {
  const li = LANGS.map((l) => `<li><a href="${urlFor(l, p)}" lang="${l}" hreflang="${l}" data-lang="${l}"${l === lang ? ' aria-current="true"' : ''}>${NAME[l]}</a></li>`).join('');
  const bar = `<details class="langsw langsw-bar"><summary aria-label="${PICK[lang]}">${lang.toUpperCase()}</summary><ul>${li}</ul></details>`;
  const menu = `<li class="langsw-menu" aria-label="${PICK[lang]}">${LANGS.map((l) => `<a href="${urlFor(l, p)}" lang="${l}" hreflang="${l}" data-lang="${l}"${l === lang ? ' aria-current="true"' : ''}>${l.toUpperCase()}</a>`).join('')}</li>`;
  return { bar, menu };
}

export function localize(html, lang, reqPath) {
  const p = normPath(reqPath || '/');
  const publicShell = html.includes('<nav class="main"');
  const translated = TRANSLATED.has(p);
  if (!publicShell && !translated) return html; // Portal: bleibt deutsch
  let out = html;

  if (lang !== DEFAULT) {
    if (translated) out = translateHtml(out, lang);
    else {
      // Seite bleibt deutsch, Kopf- und Fusszeile erscheinen in der gewählten Sprache
      out = out.replace(/<header\b[\s\S]*?<\/header>/, (h) => translateHtml(h, lang)).replace(/<footer\b[\s\S]*?<\/footer>/, (f) => translateHtml(f, lang));
      out = out.replace(/(<main\b[^>]*>)/, (m) => `${m}<p class="lang-note" role="note">${translateHtml(`<p>${NOTE}</p>`, lang).slice(3, -4)}</p>`);
    }
    out = out.replace(/<a\b[^>]*?\shref="(\/(?!\/)[^"#?]*)([^"]*)"/g, (m, pth, rest) => (prefixable(pth) ? m.replace(`href="${pth}${rest}"`, `href="${urlFor(lang, pth)}${rest}"`) : m));
    out = out.replace(/<html lang="[^"]*"/, `<html lang="${HTML_LANG[lang]}"`)
      .replace(/(<meta property="og:locale" content=")[^"]*(")/, `$1${OG_LOCALE[lang]}$2`);
    if (translated) {
      out = out.replace(/(<link rel="canonical" href=")([^"]*)(")/, (m, a, href, c) => `${a}${config.baseUrl}${urlFor(lang, normPath(href.replace(config.baseUrl, '') || '/'))}${c}`)
        .replace(/(<meta property="og:url" content=")([^"]*)(")/, (m, a, href, c) => `${a}${config.baseUrl}${urlFor(lang, normPath(href.replace(config.baseUrl, '') || '/'))}${c}`);
    }
  }

  const alt = translated ? LANGS.map((l) => `<link rel="alternate" hreflang="${l}" href="${config.baseUrl}${urlFor(l, p)}">`).join('') + `<link rel="alternate" hreflang="x-default" href="${config.baseUrl}${urlFor(DEFAULT, p)}">` : '';
  out = out.replace('</head>', () => `${alt}<link rel="stylesheet" href="/css/lang.css"><script src="/js/i18n.js?l=${lang}"></script></head>`);
  const sw = switcher(lang, p);
  out = out.replace(/<\/div>\s*<\/header>/, () => `${sw.bar}</div></header>`).replace(/<\/ul>\s*<\/nav>/, () => `${sw.menu}</ul></nav>`);
  return out;
}

/* ---------- Express ---------- */
const BOT = /bot|crawl|spider|slurp|facebookexternalhit|linkedin|whatsapp|preview|curl|wget|python|node-fetch|undici/i;
function preferred(header) {
  const list = String(header || '').split(',').map((s) => { const [tag, q] = s.trim().split(';q='); return { l: tag.toLowerCase().split('-')[0], q: q === undefined ? 1 : Number(q) || 0 }; })
    .filter((x) => LANGS.includes(x.l) && x.q > 0).sort((a, b) => b.q - a.q);
  return list[0]?.l || DEFAULT;
}

export function mountI18n(app) {
  app.use((req, res, next) => {
    const m = /^\/(fr|it|en)(\/.*)?$/.exec(req.path);
    let lang = DEFAULT;
    if (m) {
      lang = m[1];
      const q = req.url.indexOf('?');
      req.url = (m[2] || '/') + (q >= 0 ? req.url.slice(q) : '');
      if (prefixable(req.path)) res.cookie('lang', lang, { maxAge: 365 * 864e5, sameSite: 'lax', path: '/', secure: isProd });
    } else if (req.method === 'GET' && req.path === '/') {
      res.vary('Accept-Language'); res.vary('Cookie');
      const ownRef = (req.get('referer') || '').includes(req.get('host') || '\u0000');
      const want = LANGS.includes(req.cookies?.lang) ? req.cookies.lang : req.cookies?.lang ? DEFAULT : preferred(req.get('accept-language'));
      if (want !== DEFAULT && !ownRef && !BOT.test(req.get('user-agent') || '')) {
        res.set('Cache-Control', 'private, no-store');
        return res.redirect(302, urlFor(want, '/'));
      }
    }
    req.lang = lang; res.locals.lang = lang;
    const p = req.path, send = res.send.bind(res), redirect = res.redirect.bind(res);
    res.send = (body) => (typeof body === 'string' && /^\s*<!DOCTYPE html/i.test(body) ? send(localize(body, lang, p)) : send(body));
    res.redirect = (a, b) => {
      let status = 302, url = a; if (typeof a === 'number') { status = a; url = b; }
      if (lang !== DEFAULT && typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') && prefixable(url.split(/[?#]/)[0])) url = urlFor(lang, url.split(/[?#]/)[0]) + url.slice(url.split(/[?#]/)[0].length);
      return redirect(status, url);
    };
    next();
  });

  // Übersetzungsfunktion T() und Verhalten des Sprachwählers für die Browser-Skripte
  app.get('/js/i18n.js', (req, res) => {
    const l = LANGS.includes(req.query.l) ? req.query.l : DEFAULT;
    const dict = l === DEFAULT ? {} : load()[l].client;
    res.type('application/javascript').set('Cache-Control', isProd ? 'public, max-age=3600' : 'no-cache').send(
      `(function(){var L=${JSON.stringify(l)},D=${JSON.stringify(dict)},h=Object.prototype.hasOwnProperty;window.LANG=L;`
      + `window.T=function(s,v){var t=h.call(D,s)?D[s]:s;return v?t.replace(/\\{(\\w+)\\}/g,function(m,k){return v[k]!=null?v[k]:m;}):t;};`
      + `document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('[data-lang]');`
      + `if(a){document.cookie='lang='+a.getAttribute('data-lang')+';path=/;max-age=31536000;samesite=lax';return;}`
      + `var o=document.querySelectorAll('details.langsw[open]');for(var i=0;i<o.length;i++)if(!o[i].contains(e.target))o[i].open=false;});`
      + `document.addEventListener('keydown',function(e){if(e.key!=='Escape')return;var o=document.querySelectorAll('details.langsw[open]');for(var i=0;i<o.length;i++){o[i].open=false;o[i].querySelector('summary').focus();}});})();`);
  });

  // Statische Seiten mit Formularen laufen durch die Übersetzung
  app.get(['/login.html', '/login', '/mitglied-werden.html', '/mitglied-werden'], (req, res, next) => {
    const file = path.join(here, '../public', req.path.replace(/(\.html)?$/, '.html'));
    fs.readFile(file, 'utf8', (e, s) => (e ? next() : res.type('html').send(s)));
  });
}
