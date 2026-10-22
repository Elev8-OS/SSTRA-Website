/**
 * Fallback für den Adress-Check: Punkt (WGS84) → Gemeinde, lokal aus unserer eigenen
 * Gemeindekarte (BFS/GEOSTAT, public/data/ch.json). Greift, wenn geo.admin.ch nichts liefert.
 * Hinweis: Die Karte ist vereinfacht, an Gemeindegrenzen kann das Ergebnis um einige Dutzend Meter abweichen.
 */
import fs from 'node:fs';
import path from 'node:path';
import * as topojson from 'topojson-client';

const file = path.join(path.dirname(new URL(import.meta.url).pathname), '../public/data/ch.json');
let index = null;

function load() {
  if (index) return index;
  try {
    const topo = JSON.parse(fs.readFileSync(file, 'utf8'));
    index = topojson.feature(topo, topo.objects.municipalities).features.map((f) => {
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      const b = [Infinity, Infinity, -Infinity, -Infinity];
      for (const p of polys) for (const [x, y] of p[0]) { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); }
      return { bfs: Number(f.id), name: f.properties.n || '', kanton: f.properties.k || '', polys, b };
    });
  } catch (e) { console.error('geo-local: Karte nicht geladen:', e.message); index = []; }
  return index;
}

function inRing(r, x, y) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const inPoly = (p, x, y) => inRing(p[0], x, y) && !p.slice(1).some((h) => inRing(h, x, y));

export function locateLocal(lon, lat) {
  for (const m of load()) {
    if (lon < m.b[0] || lon > m.b[2] || lat < m.b[1] || lat > m.b[3]) continue;
    if (m.polys.some((p) => inPoly(p, lon, lat))) return { bfs: m.bfs, name: m.name, kanton: m.kanton };
  }
  return null;
}
export const municipalitiesLocal = () => load();
