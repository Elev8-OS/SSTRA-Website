import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.SESSION_SECRET = 'f'.repeat(40);
const { feeFor } = await import('../lib/fees.js');
const d = (s) => new Date(s + 'T12:00:00Z');

test('Eintritt vor Start der Ordnung: ganzes Jahr 2027', () => {
  const f = feeFor('stufe-1', { now: d('2026-12-01') });
  assert.deepEqual([f.amount, f.year, f.prorated, f.until], [199, 2027, false, '2027-12-31']);
});
test('Eintritt im Januar 2027 zahlt 12 Monate, im Juli 6 Monate, im Dezember 1 Monat', () => {
  assert.equal(feeFor('stufe-3', { now: d('2027-01-15') }).amount, 900);
  const jul = feeFor('stufe-3', { now: d('2027-07-01') });
  assert.deepEqual([jul.months, jul.amount, jul.prorated], [6, 450, true]);
  assert.equal(feeFor('einzel', { now: d('2027-12-20') }).amount, 7.5);
});
test('Erneuerung eines gültigen Beitrags: volles Folgejahr', () => {
  const f = feeFor('stufe-2', { until: '2027-12-31', now: d('2027-11-10') });
  assert.deepEqual([f.year, f.amount, f.until], [2028, 450, '2028-12-31']);
});
test('Abgelaufenes Mitglied zahlt monatsanteilig für das laufende Jahr', () => {
  const f = feeFor('stufe-1', { until: '2027-12-31', now: d('2028-04-10') });
  assert.deepEqual([f.year, f.months, f.amount], [2028, 9, 149.25]);
});
test('Unbekannte Stufe gibt null', () => assert.equal(feeFor('gastgeber'), null));
