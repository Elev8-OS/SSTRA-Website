/**
 * Zeigt, welche deutschen Texte der übersetzten Seiten in fr/it/en noch fehlen.
 *   npm run i18n:check            Übersicht
 *   npm run i18n:check -- --list  alle fehlenden deutschen Texte (Vorlage für die Wörterbuch-Dateien)
 *   npm run i18n:check -- --strict  Exit-Code 1, wenn etwas fehlt (für CI)
 */
process.env.SESSION_SECRET ||= 'i'.repeat(40); process.env.MOCK_LOG = '0';
delete process.env.GHL_TOKEN; delete process.env.STRIPE_SECRET_KEY; delete process.env.DATABASE_URL;
const { MockGhl } = await import('../lib/ghl.js');
const { createPayments } = await import('../lib/payments.js');
const { createApp } = await import('../app.js');
const { TRANSLATED, missingStrings } = await import('../lib/i18n.js');
const server = createApp({ ghl: new MockGhl(), payments: createPayments() }).listen(0);
const base = `http://localhost:${server.address().port}`;
const list = process.argv.includes('--list');
const all = {};
let total = 0;
for (const p of TRANSLATED) {
  const html = await (await fetch(base + p)).text();
  for (const l of ['fr', 'it', 'en']) {
    const miss = missingStrings(html, l);
    total += miss.length;
    miss.forEach((s) => { (all[l] ||= new Set()).add(s); });
    console.log(`${p.padEnd(24)} ${l}: ${miss.length ? miss.length + ' fehlen' : 'vollständig'}`);
  }
}
if (list) console.log('\n' + JSON.stringify([...(all.fr || [])], null, 1));
server.close();
process.exit(total && process.argv.includes('--strict') ? 1 : 0);
