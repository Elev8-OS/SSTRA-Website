import { config } from './config.js';

/** Alle Status- und Rollen-Informationen leben als Tags am GHL-Kontakt. */
export const TAG = {
  active: 'status:aktiv',
  applied: 'antrag:offen',
  approved: 'antrag:freigegeben',
  rejected: 'antrag:abgelehnt',
  invoice: 'zahlung:rechnung',
  newsletter: 'newsletter',
  contact: 'kontakt',
  consentNewsletter: 'einwilligung:newsletter',
  consentMembership: 'einwilligung:mitgliedschaft'
};
export const roleTag = (r) => `rolle:${r}`;
export const planTag = (p) => `kategorie:${p}`;
export const untilTag = (d) => `bis:${d}`;
export const sinceTag = (d) => `seit:${d}`;
export const payTag = (ref) => `pay:${ref}`;

export const ROLES = ['foerdermitglied', 'mitglied', 'vorstand', 'admin'];
const RANK = { foerdermitglied: 1, mitglied: 2, vorstand: 3, admin: 4 };

export const isBoard = (role) => role === 'vorstand' || role === 'admin';

export function tagValue(tags, prefix) {
  const t = (tags || []).find((x) => x.startsWith(prefix));
  return t ? t.slice(prefix.length) : null;
}

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Leitet aus Tags den Zugriffsstatus ab.
 * role: höchste Rolle oder null (kein Zugang)
 * expired: Beitrag abgelaufen (Zugang nur zur Erneuerung)
 */
export function userFromContact(email, contact) {
  const tags = contact?.tags || [];
  const lower = (email || '').toLowerCase();
  let role = ROLES.filter((r) => tags.includes(roleTag(r))).sort((a, b) => RANK[b] - RANK[a])[0] || null;
  if (config.adminEmails.includes(lower)) role = 'admin';
  const active = tags.includes(TAG.active) || isBoard(role);
  if (!active) role = null;
  const until = tagValue(tags, 'bis:');
  const expired = !!role && !isBoard(role) && !!until && until < today();
  return {
    email: lower,
    contactId: contact?.id || null,
    name: [contact?.firstName, contact?.lastName].filter(Boolean).join(' ') || lower,
    company: contact?.companyName || '',
    role,
    plan: tagValue(tags, 'kategorie:'),
    since: tagValue(tags, 'seit:'),
    until,
    expired
  };
}

/** Darf diese Rolle Inhalte sehen, die für `allowed` freigegeben sind? Vorstand/Admin sehen alles. */
export function canSee(user, allowed) {
  if (!user?.role || user.expired) return false;
  if (isBoard(user.role)) return true;
  return (allowed || []).includes(user.role);
}
