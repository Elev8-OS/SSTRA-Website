import { config, isProd } from './config.js';
import { MockGhl } from './ghl.js';
import { startSession } from './auth.js';
import { userFromContact } from './roles.js';
import { page, esc } from './views.js';
import express from 'express';

/**
 * Demo-Zugang für den Testbetrieb.
 * Nur aktiv, wenn NICHT produktiv UND der lokale GHL-Mock läuft (also keine echten Daten existieren).
 * Sobald GHL_TOKEN gesetzt ist oder NODE_ENV=production, werden diese Routen gar nicht erst eingehängt.
 */
const DAY = '2026-09-19';
const base = ['status:aktiv'];
export const DEMO_USERS = [
  { key: 'mitglied', label: 'Mitglied', text: 'Gastgeber mit aktivem Beitrag', email: 'demo-mitglied@example.org', firstName: 'Anna', lastName: 'Muster', companyName: 'Ferienhaus Muster', tags: [...base, 'rolle:mitglied', 'kategorie:gastgeber', `seit:${DAY}`, 'bis:2027-09-19'] },
  { key: 'foerdermitglied', label: 'Fördermitglied', text: 'Partnerunternehmen, ohne Stimmrecht', email: 'demo-partner@example.org', firstName: 'Pia', lastName: 'Partner', companyName: 'Beispiel Tech AG', tags: [...base, 'rolle:foerdermitglied', 'kategorie:foerdermitglied', `seit:${DAY}`, 'bis:2027-09-19'] },
  { key: 'abgelaufen', label: 'Mitglied, Beitrag abgelaufen', text: 'Sieht nur den Button «Beitrag erneuern»', email: 'demo-abgelaufen@example.org', firstName: 'Ueli', lastName: 'Alt', companyName: 'Chalet Alt', tags: [...base, 'rolle:mitglied', 'kategorie:gastgeber', 'seit:2024-01-10', 'bis:2025-01-10'] },
  { key: 'vorstand', label: 'Vorstand', text: 'Anträge prüfen, Zahlungen bestätigen, Unterlagen', email: 'demo-vorstand@example.org', firstName: 'Vera', lastName: 'Vorstand', companyName: 'Property Manager GmbH', tags: [...base, 'rolle:vorstand', 'kategorie:property-manager', `seit:${DAY}`, 'bis:2027-09-19'] },
  { key: 'admin', label: 'Administration', text: 'Zusätzlich: Rollen vergeben', email: 'demo-admin@example.org', firstName: 'Armin', lastName: 'Admin', companyName: 'Geschäftsstelle', tags: [] }
];
const APPLICANTS = [
  { email: 'peter@example.org', firstName: 'Peter', lastName: 'Beispiel', companyName: 'Chalet am See', tags: ['antrag:offen', 'kategorie:gastgeber', 'kanton:be'] },
  { email: 'lea@example.org', firstName: 'Lea', lastName: 'Test', companyName: 'Stadtapartments AG', tags: ['antrag:offen', 'kategorie:property-manager', 'zahlung:rechnung', 'kanton:zh'] },
  { email: 'marco@example.org', firstName: 'Marco', lastName: 'Rossi', companyName: 'Casa Lago', tags: ['antrag:freigegeben', 'kategorie:gastgeber', 'zahlung:rechnung', 'kanton:ti'] }
];

export async function mountDemo(root, { ghl }) {
  if (isProd || !(ghl instanceof MockGhl)) return false;
  config.adminEmails.push('demo-admin@example.org');
  for (const c of [...DEMO_USERS, ...APPLICANTS]) await ghl.upsertContact(c);

  root.use(express.urlencoded({ extended: false }));
  root.get('/api/demo-status', (_req, res) => res.json({ demo: true }));

  root.get('/demo', (_req, res) => {
    res.send(page({ title: 'Demo-Zugang', body: `
      <h1 class="display h-l">Demo-Zugang</h1>
      <p class="lead" style="margin-bottom:12px">Testbetrieb mit Beispieldaten. Wähle eine Rolle und sieh, was sie im geschützten Bereich sieht.</p>
      <p style="margin-bottom:32px;color:#5b5b5b">Alle Daten liegen nur im Speicher und verschwinden beim Neustart. Es werden keine echten Mails verschickt und keine Zahlungen ausgelöst.</p>
      <div class="grid2" style="grid-template-columns:repeat(auto-fill,minmax(280px,1fr))">
        ${DEMO_USERS.map((u) => `<form class="card" method="post" action="/demo/login"><h2 class="h-m">${esc(u.label)}</h2><p style="margin-bottom:18px">${esc(u.text)}</p><input type="hidden" name="key" value="${esc(u.key)}"><button class="btn btn-red" type="submit">Als ${esc(u.label)} ansehen</button></form>`).join('')}
      </div>` }));
  });

  root.post('/demo/login', async (req, res) => {
    const u = DEMO_USERS.find((x) => x.key === req.body.key);
    if (!u) return res.status(400).send('Unbekannte Demo-Rolle');
    const contact = await ghl.getContactByEmail(u.email);
    const user = userFromContact(u.email, contact);
    startSession(res, user);
    res.redirect(303, ['vorstand', 'admin'].includes(u.key) ? '/vorstand' : '/mitglieder');
  });
  return true;
}
