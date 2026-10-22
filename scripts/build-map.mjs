/**
 * Erzeugt public/data/ch.json (TopoJSON, vereinfacht) aus dem npm-Paket swiss-maps
 * (Geodaten: Bundesamt für Statistik BFS, GEOSTAT; nicht-kommerzielle Lizenz, Quellenangabe Pflicht)
 * und kopiert topojson-client für den Browser. Läuft automatisch nach `npm install`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import * as simplify from 'topojson-simplify';
import * as client from 'topojson-client';

const require = createRequire(import.meta.url);
const YEAR = '2024'; // letztes Jahr mit Gemeindenamen im Paket
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const pkg = path.dirname(require.resolve('swiss-maps/package.json'));
const KT = ['', 'ZH', 'BE', 'LU', 'UR', 'SZ', 'OW', 'NW', 'GL', 'ZG', 'FR', 'SO', 'BS', 'BL', 'SH', 'AR', 'AI', 'SG', 'GR', 'AG', 'TG', 'TI', 'VD', 'VS', 'NE', 'GE', 'JU'];

/** Minimaler DBF-Leser (dBase III), reicht für id / name / KTNR. */
function readDbf(file) {
  const b = fs.readFileSync(file);
  const n = b.readUInt32LE(4), headerLen = b.readUInt16LE(8), recLen = b.readUInt16LE(10);
  const fields = [];
  for (let o = 32; b[o] !== 0x0d; o += 32) {
    fields.push({ name: b.toString('ascii', o, o + 11).replace(/\0.*$/, ''), type: String.fromCharCode(b[o + 11]), len: b[o + 16] });
  }
  const rows = [];
  for (let i = 0; i < n; i++) {
    let o = headerLen + i * recLen;
    if (b[o] === 0x2a) continue; // gelöscht
    o += 1;
    const r = {};
    for (const f of fields) {
      const raw = b.subarray(o, o + f.len);
      r[f.name] = f.type === 'N' ? Number(raw.toString('ascii').trim()) : raw.toString('utf8').replace(/\0/g, '').trim();
      o += f.len;
    }
    rows.push(r);
  }
  return rows;
}

const names = {};
for (const r of readDbf(path.join(pkg, YEAR, 'municipalities.dbf'))) names[r.id] = [r.name, r.KTNR];

const topo = JSON.parse(fs.readFileSync(path.join(pkg, YEAR, 'ch-combined.json'), 'utf8'));
delete topo.objects.districts; delete topo.objects.country;
topo.objects.cantons.geometries.forEach((g) => { g.properties = { k: KT[g.id] }; });
topo.objects.municipalities.geometries.forEach((g) => { const n = names[g.id] || []; g.properties = { n: n[0] || '', k: KT[n[1]] || '' }; });

let t = simplify.presimplify(topo);
t = simplify.simplify(t, simplify.quantile(t, 0.3));
t = simplify.filter(t, simplify.filterAttached(t));
t = client.quantize(t, 8000);

fs.mkdirSync(path.join(root, 'public/data'), { recursive: true });
fs.writeFileSync(path.join(root, 'public/data/ch.json'), JSON.stringify(t));
fs.copyFileSync(require.resolve('topojson-client/dist/topojson-client.min.js'), path.join(root, 'public/js/topojson-client.min.js'));
console.log(`Karte gebaut: ${t.objects.municipalities.geometries.length} Gemeinden, ${Math.round(fs.statSync(path.join(root, 'public/data/ch.json')).size / 1024)} KB`);

/* Schrift (SIL OFL) selbst ausliefern, kein Aufruf an Google */
const fontPkg = path.dirname(require.resolve('@fontsource-variable/hanken-grotesk/package.json'));
fs.mkdirSync(path.join(root, 'public/fonts'), { recursive: true });
for (const f of ['hanken-grotesk-latin-wght-normal.woff2', 'hanken-grotesk-latin-ext-wght-normal.woff2']) {
  fs.copyFileSync(path.join(fontPkg, 'files', f), path.join(root, 'public/fonts', f));
}
console.log('Schriften kopiert');
