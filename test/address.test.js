import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
process.env.SESSION_SECRET = 'z'.repeat(40); process.env.MOCK_LOG = '0';
delete process.env.GHL_TOKEN; delete process.env.STRIPE_SECRET_KEY;
const { MockGhl } = await import('../lib/ghl.js');
const { createPayments } = await import('../lib/payments.js');
const { createApp } = await import('../app.js');
const { searchPlaces, municipalityAt } = await import('../lib/address.js');

// Nachgebaute Antworten von geo.admin.ch (Form wie dokumentiert)
const fake = async (url) => {
  if (url.includes('SearchServer')) return { results: [
    { attrs: { origin: 'address', label: '<b>Höheweg 37</b> 3800 Interlaken', lat: 46.6863, lon: 7.8632, featureId: '1' } },
    { attrs: { origin: 'gg25', label: '<b>Interlaken</b> (BE)', lat: 46.69, lon: 7.86, featureId: '581' } },
    { attrs: { origin: 'zipcode', label: '3800 Interlaken', lat: 46.68, lon: 7.86 } } ] };
  if (url.includes('identify')) return { results: [{ layerBodId: 'ch.swisstopo.swissboundaries3d-gemeinde-flaeche.fill', featureId: 581, attributes: { gemname: 'Interlaken', bfs_nummer: 581, kanton: 'BE' } }] };
  throw new Error('unbekannte URL ' + url);
};

let server, base;
before(() => { server = createApp({ ghl: new MockGhl(), payments: createPayments(), geoFetch: fake }).listen(0); base = `http://localhost:${server.address().port}`; });
after(() => server.close());

test('Suche normalisiert Labels und erkennt Gemeinden', async () => {
  const r = await searchPlaces('Interlaken', fake);
  assert.equal(r.length, 3);
  assert.equal(r[0].label, 'Höheweg 37 3800 Interlaken'); assert.equal(r[0].bfs, null);
  assert.equal(r[1].bfs, 581);
  assert.deepEqual(await searchPlaces('ab', fake), []);
});

test('Punkt wird zur Gemeinde aufgelöst, Ausland abgelehnt', async () => {
  assert.deepEqual(await municipalityAt(7.8632, 46.6863, fake), { bfs: 581, name: 'Interlaken', kanton: 'BE' });
  await assert.rejects(municipalityAt(2.35, 48.85, fake));
});

test('API-Endpunkte', async () => {
  const s = await (await fetch(base + '/api/adresse?q=Interlaken')).json();
  assert.equal(s.results[1].bfs, 581);
  const g = await (await fetch(base + '/api/adresse/gemeinde?lon=7.8632&lat=46.6863')).json();
  assert.equal(g.kanton, 'BE');
  assert.equal((await fetch(base + '/api/adresse/gemeinde?lon=2&lat=48')).status, 400);
});
