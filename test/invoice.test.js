import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
process.env.SESSION_SECRET = 'i'.repeat(40); process.env.MOCK_LOG = '0'; process.env.INVOICE_IBAN = 'CH44 3199 9123 0008 8901 2';
delete process.env.GHL_TOKEN; delete process.env.STRIPE_SECRET_KEY; delete process.env.DATABASE_URL;
const { MockGhl } = await import('../lib/ghl.js');
const { createPayments } = await import('../lib/payments.js');
const { createApp } = await import('../app.js');
const inv = await import('../lib/invoice.js');
const { approveApplication } = await import('../lib/membership.js');

let server, base, ghl;
before(() => { ghl = new MockGhl(); server = createApp({ ghl, payments: createPayments() }).listen(0); base = `http://localhost:${server.address().port}`; });
after(() => server.close());

test('Referenzen entsprechen den Normbeispielen (QR-Referenz Mod 10, ISO 11649)', () => {
  assert.equal(inv.qrReference('21000000000313947143000901'), '210000000003139471430009017');
  assert.equal(inv.creditorReference('539007547034'), 'RF18539007547034');
  assert.match(inv.referenceFor('R-2026-0001'), /^\d{27}$/); // QR-IBAN → QRR
  assert.match(inv.referenceFor('R-2026-0001', 'CH9300762011623852957'), /^RF\d{2}20260001$/); // normale IBAN → SCOR
});

test('Link-Signatur: gültig, manipuliert, fremde Nummer', () => {
  const t = inv.invoiceUrl('R-2026-0001').split('/rechnung/')[1].replace('.pdf', '');
  assert.equal(inv.numberFromToken(t), 'R-2026-0001');
  assert.equal(inv.numberFromToken(t + 'x'), null);
  assert.equal(inv.numberFromToken('R-2026-0002_' + t.split('_').slice(1).join('_')), null);
});

test('Freigabe stellt eine QR-Rechnung über CHF 199 mit 10 Tagen Frist und PDF-Anhang aus', async () => {
  const c = await ghl.upsertContact({ email: 'eva@muster.ch', firstName: 'Eva', lastName: 'Muster', companyName: 'Muster Ferien GmbH', tags: ['antrag:offen', 'kategorie:gastgeber', 'zahlung:rechnung'] });
  const r = await approveApplication({ ghl, payments: createPayments(), contactId: c.id });
  assert.equal(r.mode, 'invoice'); assert.match(r.number, /^R-\d{4}-0001$/);
  const mail = ghl.outbox.at(-1);
  assert.match(mail.subject, /Rechnung R-\d{4}-0001/);
  assert.equal(mail.attachments.length, 1);
  assert.ok(mail.html.includes('CHF 199') && mail.html.includes('10 Tagen'));
  const pdf = await fetch(mail.attachments[0].replace(/^https?:\/\/[^/]+/, base));
  assert.equal(pdf.status, 200); assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  const buf = Buffer.from(await pdf.arrayBuffer());
  assert.equal(buf.subarray(0, 4).toString(), '%PDF'); assert.ok(buf.length > 5000);
  assert.equal((await fetch(base + '/rechnung/R-2026-0001_falsch.pdf')).status, 404);
  const due = (await import('../lib/store.js')).store; const rec = await due.getInvoice(r.number);
  assert.equal(Math.round((new Date(rec.due) - new Date(rec.issued)) / 864e5), 10);
});

test('Nächste Rechnung bekommt die nächste Nummer', async () => {
  const c = await ghl.upsertContact({ email: 'ben@muster.ch', firstName: 'Ben', lastName: 'Muster', tags: ['antrag:offen', 'kategorie:gastgeber'] });
  assert.match((await approveApplication({ ghl, payments: createPayments(), contactId: c.id })).number, /-0002$/);
});
