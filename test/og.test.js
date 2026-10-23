import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
process.env.SESSION_SECRET = 'o'.repeat(40); process.env.MOCK_LOG = '0';
delete process.env.GHL_TOKEN; delete process.env.STRIPE_SECRET_KEY; delete process.env.DATABASE_URL;
const { MockGhl } = await import('../lib/ghl.js');
const { createPayments } = await import('../lib/payments.js');
const { createApp } = await import('../app.js');

let server, base;
before(() => { server = createApp({ ghl: new MockGhl(), payments: createPayments() }).listen(0); base = `http://localhost:${server.address().port}`; });
after(() => server.close());
const html = async (p) => (await fetch(base + p)).text();

test('Vorschaubild (Open Graph): Tags erscheinen, sobald og-image.png existiert', async () => {
  const f = new URL('../public/og-image.png', import.meta.url).pathname; const existed = fs.existsSync(f);
  if (!existed) { assert.ok(!(await html('/')).includes('og:image')); fs.writeFileSync(f, 'x'); }
  try {
    for (const p of ['/', '/medien', '/hostsummit/2027']) {
      const h = await html(p);
      assert.ok(h.includes('property="og:image" content="') && h.includes('og-image.png') && h.includes('summary_large_image'), p);
      assert.equal(h.split('og:image"').length - 1, 1, 'nur ein og:image');
    }
  } finally { if (!existed) fs.rmSync(f); }
});
