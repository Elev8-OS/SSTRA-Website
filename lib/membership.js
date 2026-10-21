import { config } from './config.js';
import { TAG, roleTag, planTag, untilTag, sinceTag, payTag, tagValue, isBoard, ROLES } from './roles.js';
import { magicToken, payToken } from './auth.js';
import { mailHtml } from './views.js';

const iso = (d) => d.toISOString().slice(0, 10);
const plusYear = (from) => { const d = new Date(from); d.setUTCFullYear(d.getUTCFullYear() + 1); return d; };

export const payLink = (email, planKey) => `${config.baseUrl}/bezahlen?token=${payToken(email, planKey)}`;
export const loginLink = (email) => `${config.baseUrl}/auth/verify?token=${magicToken(email)}`;

/** Mitgliedschaft aktivieren (nach Zahlung oder manueller Bestätigung). Idempotent über `ref`. */
export async function activateMember({ ghl, email, planKey, ref }) {
  const plan = config.plans[planKey];
  if (!plan) throw new Error('Unbekannte Mitgliedschaft: ' + planKey);
  const contact = await ghl.getContactByEmail(email);
  if (!contact) throw new Error('Kontakt nicht gefunden: ' + email);
  if (ref && contact.tags.includes(payTag(ref).toLowerCase())) return { already: true, contact };

  const today = iso(new Date());
  const currentUntil = tagValue(contact.tags, 'bis:');
  const base = currentUntil && currentUntil > today ? new Date(currentUntil) : new Date(today);
  const until = iso(plusYear(base));

  const hasBoardRole = contact.tags.some((t) => isBoard(t.replace('rolle:', '')) && t.startsWith('rolle:'));
  const remove = contact.tags.filter((t) =>
    t.startsWith('bis:') || t.startsWith('pay:') || t.startsWith('kategorie:') ||
    [TAG.applied, TAG.approved, TAG.rejected, TAG.invoice].includes(t) ||
    (!hasBoardRole && t.startsWith('rolle:') && ['mitglied', 'foerdermitglied'].includes(t.slice(6)))
  );
  const add = [TAG.active, planTag(planKey), untilTag(until)];
  if (ref) add.push(payTag(ref));
  if (!tagValue(contact.tags, 'seit:')) add.push(sinceTag(today));
  if (!hasBoardRole) add.push(roleTag(plan.role));

  await ghl.removeTags(contact.id, remove);
  await ghl.addTags(contact.id, add);

  await ghl.sendEmail(contact.id, 'Willkommen im Verband', mailHtml({
    heading: 'Willkommen im Verband',
    paragraphs: [
      `Deine Mitgliedschaft <strong>${plan.name}</strong> ist aktiv bis ${until.split('-').reverse().join('.')}.`,
      'Mit diesem Link meldest du dich im Mitgliederbereich an. Er ist 15 Minuten gültig. Später kannst du dir jederzeit selbst einen neuen Link schicken lassen.'
    ],
    button: { label: 'Zum Mitgliederbereich', url: loginLink(contact.email) }
  }));
  await ghl.notify('member.activated', { email, plan: planKey, until });
  return { already: false, until };
}

export async function approveApplication({ ghl, payments, contactId }) {
  const contact = await ghl.getContactById(contactId);
  if (!contact) throw new Error('Kontakt nicht gefunden');
  const planKey = tagValue(contact.tags, 'kategorie:');
  const plan = config.plans[planKey];
  if (!plan) throw new Error('Keine Kategorie am Kontakt');
  await ghl.removeTags(contact.id, [TAG.applied]);
  await ghl.addTags(contact.id, [TAG.approved]);

  const wantsInvoice = contact.tags.includes(TAG.invoice) || !plan.amountChf;
  if (wantsInvoice) {
    await ghl.sendEmail(contact.id, 'Dein Antrag wurde freigegeben', mailHtml({
      heading: 'Dein Antrag wurde freigegeben',
      paragraphs: ['Willkommen! Die Geschäftsstelle schickt dir die Rechnung für den Mitgliederbeitrag separat. Nach Zahlungseingang schalten wir den Mitgliederbereich frei.']
    }));
    await ghl.notify('application.approved.invoice', { email: contact.email, plan: planKey });
    return { mode: 'invoice' };
  }
  await ghl.sendEmail(contact.id, 'Dein Antrag wurde freigegeben', mailHtml({
    heading: 'Dein Antrag wurde freigegeben',
    paragraphs: [`Willkommen! Bezahle jetzt den Mitgliederbeitrag (${plan.name}, CHF ${plan.amountChf}) mit Karte oder TWINT. Danach wird dein Zugang sofort freigeschaltet.`],
    button: { label: 'Beitrag bezahlen', url: payLink(contact.email, planKey) }
  }));
  await ghl.notify('application.approved.payment', { email: contact.email, plan: planKey });
  return { mode: 'online' };
}

export async function rejectApplication({ ghl, contactId }) {
  const contact = await ghl.getContactById(contactId);
  if (!contact) throw new Error('Kontakt nicht gefunden');
  await ghl.removeTags(contact.id, [TAG.applied, TAG.approved]);
  await ghl.addTags(contact.id, [TAG.rejected]);
  await ghl.notify('application.rejected', { email: contact.email });
}

export async function setRole({ ghl, contactId, role }) {
  if (!ROLES.includes(role) || role === 'admin') throw new Error('Ungültige Rolle');
  const contact = await ghl.getContactById(contactId);
  if (!contact) throw new Error('Kontakt nicht gefunden');
  await ghl.removeTags(contact.id, ROLES.map(roleTag));
  await ghl.addTags(contact.id, [roleTag(role), TAG.active]);
}
