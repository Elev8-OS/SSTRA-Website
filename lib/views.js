export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const SHIELD = '<svg viewBox="0 0 40 46" aria-hidden="true"><path d="M20 2 3 8v16c0 10 7 17 17 20 10-3 17-10 17-20V8L20 2Z" fill="none" stroke="#fff" stroke-width="3"/><path d="M12 24l8-7 8 7v8H12v-8Z" fill="#fff"/><rect x="18" y="26" width="4" height="6" fill="#000"/></svg>';

export const ROLE_LABEL = { foerdermitglied: 'Fördermitglied', mitglied: 'Mitglied', vorstand: 'Vorstand', admin: 'Administration' };

export function page({ title, body, user, wide = false }) {
  const nav = user
    ? `<a href="/mitglieder">Mitgliederbereich</a>${['vorstand', 'admin'].includes(user.role) ? '<a href="/vorstand">Vorstand</a>' : ''}
       <form method="post" action="/auth/logout" style="display:inline"><button class="linkbtn" type="submit">Abmelden</button></form>`
    : '<a href="/login.html">Login</a>';
  return `<!DOCTYPE html><html lang="de-CH"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${esc(title)} | Swiss Short Term Rental</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/site.css"><link rel="stylesheet" href="/css/portal.css"></head>
<body><header class="site"><div class="wrap bar"><a class="logo" href="/">${SHIELD}<span>Swiss Short<br>Term Rental</span></a>
<nav class="portal-nav"><a href="/">Zur Website</a>${nav}</nav></div></header>
<main class="portal ${wide ? 'wide' : ''}"><div class="wrap">${body}</div></main></body></html>`;
}

export function mailHtml({ heading, paragraphs, button }) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#000">
<div style="background:#000;color:#fff;padding:20px 24px;font-weight:700;letter-spacing:.02em">SWISS SHORT TERM RENTAL</div>
<div style="padding:28px 24px;background:#fff"><h1 style="font-size:24px;font-weight:300;margin:0 0 16px">${esc(heading)}</h1>
${paragraphs.map((p) => `<p style="font-size:16px;line-height:1.5;margin:0 0 14px">${p}</p>`).join('')}
${button ? `<p style="margin:24px 0"><a href="${esc(button.url)}" style="background:#C0100D;color:#fff;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:600;display:inline-block">${esc(button.label)}</a></p>` : ''}
<p style="font-size:13px;color:#666;margin-top:28px">Schweizer Verband für Kurzzeitvermietung</p></div></div>`;
}
