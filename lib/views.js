import { config } from './config.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const SHIELD = '<svg viewBox="0 0 40 46" aria-hidden="true"><path d="M20 2 3 8v16c0 10 7 17 17 20 10-3 17-10 17-20V8L20 2Z" fill="none" stroke="#fff" stroke-width="3"/><path d="M12 24l8-7 8 7v8H12v-8Z" fill="#fff"/><rect x="18" y="26" width="4" height="6" fill="#000"/></svg>';

export const ROLE_LABEL = { foerdermitglied: 'Fördermitglied', mitglied: 'Mitglied', vorstand: 'Vorstand', admin: 'Administration' };

const NAV = [['Regelradar', '/#regeln'], ['Aktuell', '/#aktuell'], ['Regionen', '/regionen'], ['Verband', '/#verband'], ['Mitgliedschaft', '/#mitglied']];

/** Gleiche Kopfzeile wie die Startseite, für öffentliche Unterseiten. */
export function siteHeader(user) {
  const login = user ? '<a class="login-link" href="/mitglieder">Mitgliederbereich</a>' : '<a class="login-link" href="/login.html">Login</a>';
  return `<header class="site" id="top"><div class="wrap bar"><a class="logo" href="/" aria-label="Swiss Short Term Rental Association, Startseite">${SHIELD}<span>Swiss Short<br>Term Rental</span></a>
<nav class="main" id="nav" aria-label="Hauptnavigation"><ul>${NAV.map(([t, h]) => `<li><a href="${h}">${t}</a></li>`).join('')}<li class="menu-extra">${login}<a class="btn btn-red" href="/mitglied-werden.html">Mitglied werden</a></li></ul></nav>
${login}<a class="btn btn-white" href="/mitglied-werden.html">Mitglied werden</a>
<button class="burger" type="button" aria-expanded="false" aria-controls="nav">Menü</button></div></header>`;
}

export function siteFooter() {
  return `<footer class="site"><div class="wrap"><div class="foot-grid">
<div><a class="logo" href="/">${SHIELD}<span>Swiss Short<br>Term Rental</span></a><p style="margin-top:18px;color:#a8a8a8;font-size:1rem">Schweizer Verband für Kurzzeitvermietung</p></div>
<div><h4>Wissen</h4><ul><li><a href="/#regeln">Regelradar</a></li><li><a href="/regeln">Alle Kantone</a></li><li><a href="/regionen">Regionalgruppen</a></li><li><a href="/#aktuell">Aktuell</a></li></ul></div>
<div><h4>Verband</h4><ul><li><a href="/#verband">Aufgaben</a></li><li><a href="/#mitglied">Mitgliedschaft</a></li><li><a href="/mitglied-werden.html">Mitglied werden</a></li></ul></div>
<div><h4>Kontakt</h4><ul><li><a href="mailto:info@hostsummit.ch">info@hostsummit.ch</a></li><li><a href="/login.html">Mitglieder-Login</a></li><li><a href="/impressum.html">Impressum</a></li><li><a href="/datenschutz.html">Datenschutz</a></li></ul></div>
</div><div class="foot-base"><span>© 2026 Schweizer Verband für Kurzzeitvermietung</span><span><a href="/data/regeln.json">Regelradar als offene Daten (JSON)</a></span></div></div></footer>`;
}

/**
 * Seitenrahmen. Standard: geschützte Portal-Seite (noindex).
 * publicNav + index: öffentliche, suchmaschinenfähige Seite mit Hauptnavigation.
 */
export function page({ title, body, user, wide = false, index = false, description = '', canonical = '', jsonld = null, publicNav = false }) {
  const nav = user
    ? `<a href="/mitglieder">Mitgliederbereich</a>${['vorstand', 'admin'].includes(user.role) ? '<a href="/vorstand">Vorstand</a>' : ''}
       <form method="post" action="/auth/logout" style="display:inline"><button class="linkbtn" type="submit">Abmelden</button></form>`
    : '<a href="/login.html">Login</a>';
  const fullTitle = `${title} | Swiss Short Term Rental`;
  const url = canonical ? config.baseUrl + canonical : '';
  const head = `<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="${index ? 'index,follow' : 'noindex,nofollow'}"><title>${esc(fullTitle)}</title>
${description ? `<meta name="description" content="${esc(description)}"><meta property="og:description" content="${esc(description)}">` : ''}
${url ? `<link rel="canonical" href="${esc(url)}"><meta property="og:url" content="${esc(url)}">` : ''}
<meta property="og:title" content="${esc(fullTitle)}"><meta property="og:type" content="website"><meta property="og:locale" content="de_CH"><meta property="og:site_name" content="Swiss Short Term Rental Association">
<meta name="theme-color" content="#000000"><link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preload" href="/fonts/hanken-grotesk-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/css/site.css"><link rel="stylesheet" href="/css/portal.css"><link rel="stylesheet" href="/css/ux.css">
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>` : ''}`;
  const header = publicNav
    ? siteHeader(user)
    : `<header class="site"><div class="wrap bar"><a class="logo" href="/">${SHIELD}<span>Swiss Short<br>Term Rental</span></a>
<nav class="portal-nav"><a href="/">Zur Website</a>${nav}</nav></div></header>`;
  return `<!DOCTYPE html><html lang="de-CH"><head>${head}</head>
<body>${header}
<main class="portal ${wide ? 'wide' : ''}"><div class="wrap">${body}</div></main>${publicNav ? siteFooter() + '<script src="/js/menu.js" defer></script>' : ''}</body></html>`;
}

export function mailHtml({ heading, paragraphs, button }) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#000">
<div style="background:#000;color:#fff;padding:20px 24px;font-weight:700;letter-spacing:.02em">SWISS SHORT TERM RENTAL</div>
<div style="padding:28px 24px;background:#fff"><h1 style="font-size:24px;font-weight:300;margin:0 0 16px">${esc(heading)}</h1>
${paragraphs.map((p) => `<p style="font-size:16px;line-height:1.5;margin:0 0 14px">${p}</p>`).join('')}
${button ? `<p style="margin:24px 0"><a href="${esc(button.url)}" style="background:#C0100D;color:#fff;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:600;display:inline-block">${esc(button.label)}</a></p>` : ''}
<p style="font-size:13px;color:#666;margin-top:28px">Schweizer Verband für Kurzzeitvermietung</p></div></div>`;
}
