/**
 * Beitragsberechnung nach der Beitrags- und Gebührenordnung (gültig ab 1. Januar 2027).
 * - Beitrag gilt fürs Kalenderjahr (1.1. bis 31.12.).
 * - Eintritt im Lauf des Jahres: monatsanteilig (Eintrittsmonat zählt voll).
 * - Eintritt vor Start der Ordnung: ganzes Jahr 2027.
 * - Erneuerung eines noch gültigen Beitrags: volles Folgejahr.
 */
import { config } from './config.js';

export const START_YEAR = 2027;
const r5 = (n) => Math.round(n * 20) / 20; // auf 5 Rappen runden

export function feeFor(planKey, { until = null, now = new Date() } = {}) {
  const plan = config.plans[planKey];
  if (!plan?.amountChf) return null;
  const today = now.toISOString().slice(0, 10);
  const full = plan.amountChf;
  let year, months = 12;
  if (until && until >= today) {
    year = Number(until.slice(0, 4)) + 1; // Erneuerung eines gültigen Beitrags
  } else if (now.getUTCFullYear() < START_YEAR) {
    year = START_YEAR;
  } else {
    year = now.getUTCFullYear();
    months = 12 - now.getUTCMonth(); // Januar = 12 Monate, Dezember = 1 Monat
  }
  const amount = months === 12 ? full : r5((full * months) / 12);
  return { year, months, amount, full, prorated: months < 12, until: `${year}-12-31` };
}

export const dmy = (d) => d.split('-').reverse().join('.');
export const chf = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
