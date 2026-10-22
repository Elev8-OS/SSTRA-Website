/**
 * Mitgliederrechnung als PDF mit Schweizer QR-Rechnung (Einzahlungsschein).
 * Aktiv, sobald INVOICE_IBAN gesetzt ist (IBAN oder QR-IBAN des Verbandskontos).
 */
import crypto from 'node:crypto';
import PDFDocument from 'pdfkit';
import { SwissQRBill } from 'swissqrbill/pdf';
import { config } from './config.js';

export const CREDITOR = { name: 'Schweizer Verband für Kurzzeitvermietung SSTRA', address: 'Hauptgasse', buildingNumber: '33', zip: '4600', city: 'Olten', country: 'CH' };
const iban = () => (process.env.INVOICE_IBAN || '').replace(/\s/g, '').toUpperCase();
export const invoicingEnabled = () => Boolean(iban());
const isQrIban = (s) => /^CH\d{2}3[01]\d{3}/.test(s);
export const PAYMENT_DAYS = 10;

/* ---- Referenzen ---- */
const MOD10 = [0, 9, 4, 6, 8, 2, 7, 1, 3, 5];
/** QR-Referenz (27 Stellen, Modulo 10 rekursiv), für QR-IBAN. */
export function qrReference(base) {
  const s = String(base).padStart(26, '0'); let c = 0;
  for (const ch of s) c = MOD10[(c + Number(ch)) % 10];
  return s + ((10 - c) % 10);
}
/** Creditor Reference nach ISO 11649 (RF…), für normale IBAN. */
export function creditorReference(ref) {
  const r = String(ref).toUpperCase();
  const digits = (r + 'RF00').replace(/[A-Z]/g, (ch) => ch.charCodeAt(0) - 55);
  let m = 0; for (const d of digits) m = (m * 10 + Number(d)) % 97;
  return 'RF' + String(98 - m).padStart(2, '0') + r;
}
export const referenceFor = (number, account = iban()) => {
  const digits = number.replace(/\D/g, '');
  return isQrIban(account) ? qrReference(digits) : creditorReference(digits);
};

/* ---- Datensatz ---- */
const dmy = (d) => d.split('-').reverse().join('.');
const isoDay = (d) => d.toISOString().slice(0, 10);
const chf = (n) => Number(n).toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/’/g, "'");

export async function issueInvoice({ store, contact, plan, planKey }) {
  const now = new Date(); const year = now.getFullYear();
  const number = `R-${year}-${String(await store.nextInvoiceNumber(year)).padStart(4, '0')}`;
  const rec = {
    number, email: contact.email, name: [contact.firstName, contact.lastName].filter(Boolean).join(' '), company: contact.companyName || '',
    planKey, amount: plan.amountChf,
    description: `Jahresbeitrag Mitgliedschaft ${plan.name} (12 Monate)${plan.includesTicket ? ', inkl. 1 Ticket für den jährlichen Host Summit' : ''}`,
    issued: isoDay(now), due: isoDay(new Date(now.getTime() + PAYMENT_DAYS * 86_400_000)), reference: referenceFor(number)
  };
  await store.saveInvoice(rec);
  return rec;
}

/* ---- Download-Link (ohne Login, mit Signatur) ---- */
const sig = (number) => crypto.createHmac('sha256', config.sessionSecret).update('invoice:' + number).digest('base64url').slice(0, 24);
export const invoiceUrl = (number) => `${config.baseUrl}/rechnung/${number}_${sig(number)}.pdf`;
export function numberFromToken(id) {
  const i = String(id).indexOf('_'); if (i < 1) return null; // Rechnungsnummern enthalten keinen Unterstrich, die Signatur schon möglich
  const number = id.slice(0, i), given = Buffer.from(id.slice(i + 1)), want = Buffer.from(sig(number));
  return given.length === want.length && crypto.timingSafeEqual(given, want) ? number : null;
}

/* ---- PDF ---- */
export function renderInvoicePdf(inv) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: `Rechnung ${inv.number}`, Author: CREDITOR.name } });
    const chunks = []; doc.on('data', (c) => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
    const L = 57, R = 538;
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#000').text(CREDITOR.name, L, 54, { width: 260 });
    doc.font('Helvetica').fontSize(9).fillColor('#444').text(`Hauptgasse 33\nCH-4600 Olten\ninfo@hostsummit.ch · sstra.ch`, L, doc.y + 2);
    doc.font('Helvetica-Bold').fontSize(22).fillColor('#C0100D').text('Rechnung', 330, 52, { width: R - 330, align: 'right' });
    doc.font('Helvetica').fontSize(9.5).fillColor('#000')
      .text(`Rechnungs-Nr.  ${inv.number}`, 330, 86, { width: R - 330, align: 'right' })
      .text(`Datum  ${dmy(inv.issued)}`, 330, doc.y + 2, { width: R - 330, align: 'right' })
      .text(`Zahlbar bis  ${dmy(inv.due)}`, 330, doc.y + 2, { width: R - 330, align: 'right' });
    const to = [inv.company, inv.name, inv.email].filter(Boolean);
    doc.font('Helvetica').fontSize(11).fillColor('#000').text(to.join('\n'), L, 168, { width: 260, lineGap: 2 });
    doc.font('Helvetica').fontSize(10.5).text('Willkommen im Verband! Für deine Mitgliedschaft stellen wir dir folgenden Betrag in Rechnung.', L, 252, { width: R - L });
    const y0 = 300;
    doc.moveTo(L, y0).lineTo(R, y0).lineWidth(0.8).strokeColor('#000').stroke();
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#444').text('BESCHREIBUNG', L, y0 + 8).text('BETRAG', L, y0 + 8, { width: R - L, align: 'right' });
    doc.font('Helvetica').fontSize(10.5).fillColor('#000').text(inv.description, L, y0 + 30, { width: 340 });
    doc.text(`CHF ${chf(inv.amount)}`, L, y0 + 30, { width: R - L, align: 'right' });
    const y1 = y0 + 76;
    doc.moveTo(L, y1).lineTo(R, y1).lineWidth(0.5).strokeColor('#999').stroke();
    doc.font('Helvetica-Bold').fontSize(12).text('Total', L, y1 + 10).text(`CHF ${chf(inv.amount)}`, L, y1 + 10, { width: R - L, align: 'right' });
    doc.font('Helvetica').fontSize(9.5).fillColor('#333').text(`Bitte bezahle den Betrag innert ${PAYMENT_DAYS} Tagen mit dem Einzahlungsschein unten oder per E-Banking (QR-Code scannen). Nach Zahlungseingang schalten wir den Mitgliederbereich frei. Fragen: info@hostsummit.ch`, L, y1 + 44, { width: R - L, lineGap: 2 });
    const data = { amount: Number(inv.amount), currency: 'CHF', creditor: { account: iban(), ...CREDITOR }, reference: inv.reference, message: `${inv.number} Mitgliedschaft SSTRA` };
    new SwissQRBill(data, { language: 'DE' }).attachTo(doc);
    doc.end();
  });
}

export function mountInvoices(app, { store }) {
  app.get('/rechnung/:id.pdf', async (req, res) => {
    try {
      const number = numberFromToken(req.params.id); const inv = number && await store.getInvoice(number);
      if (!inv || !invoicingEnabled()) return res.status(404).send('Rechnung nicht gefunden.');
      const pdf = await renderInvoicePdf(inv);
      res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="Rechnung-${inv.number}.pdf"`, 'Cache-Control': 'private, max-age=300', 'X-Robots-Tag': 'noindex' }).send(pdf);
    } catch (e) { console.error('Rechnung:', e.message); res.status(500).send('Rechnung momentan nicht abrufbar.'); }
  });
}
