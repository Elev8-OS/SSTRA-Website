/**
 * Adress-Check: «Was gilt an meiner Adresse?»
 * Nutzt die offene Schnittstelle von geo.admin.ch (Bundesamt für Landestopografie):
 *  - SearchServer: Adressen, Orte, Gemeinden suchen
 *  - Identify: Punkt → Gemeinde (BFS-Nummer, Kanton)
 * Läuft serverseitig als Proxy, damit die CSP eng bleibt und wir Anfragen begrenzen können.
 */
import rateLimit from 'express-rate-limit';

const BASE = 'https://api3.geo.admin.ch/rest/services/api';
const GEMEINDE_LAYER = 'ch.swisstopo.swissboundaries3d-gemeinde-flaeche.fill';
const stripTags = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const cache = new Map();
const cached = async (key, fn, ttl = 6 * 3600_000) => {
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.val;
  const val = await fn();
  if (cache.size > 2000) cache.clear();
  cache.set(key, { val, exp: Date.now() + ttl });
  return val;
};

async function getJson(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'sstra-regelradar/1.0 (+https://sstra.ch)' }, signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error(`geo.admin.ch ${r.status}`);
  return r.json();
}

/** Suche nach Adresse, Ort oder Gemeinde. Liefert bis zu 6 Vorschläge. */
export async function searchPlaces(q, fetchJson = getJson) {
  const text = String(q || '').trim().slice(0, 120);
  if (text.length < 3) return [];
  return cached('s:' + text.toLowerCase(), async () => {
    const u = `${BASE}/SearchServer?searchText=${encodeURIComponent(text)}&type=locations&origins=address,gg25,zipcode&limit=6&sr=4326&lang=de`;
    const d = await fetchJson(u);
    return (d.results || []).map((r) => {
      const a = r.attrs || {};
      return { label: stripTags(a.label), origin: a.origin, lat: a.lat, lon: a.lon, bfs: a.origin === 'gg25' ? Number(a.featureId) || null : null };
    }).filter((x) => x.label && Number.isFinite(x.lat) && Number.isFinite(x.lon));
  });
}

/** Punkt (WGS84) → Gemeinde. */
export async function municipalityAt(lon, lat, fetchJson = getJson) {
  lon = Number(lon); lat = Number(lat);
  if (!(lon > 5.9 && lon < 10.6 && lat > 45.7 && lat < 47.9)) throw new Error('Koordinate ausserhalb der Schweiz');
  return cached(`m:${lon.toFixed(5)},${lat.toFixed(5)}`, async () => {
    const u = `${BASE}/MapServer/identify?geometry=${lon},${lat}&geometryType=esriGeometryPoint&geometryFormat=geojson&layers=all:${GEMEINDE_LAYER}&tolerance=0&sr=4326&returnGeometry=false&lang=de`;
    const d = await fetchJson(u);
    const f = (d.results || [])[0];
    if (!f) return null;
    const at = f.attributes || f.properties || {};
    return { bfs: Number(at.bfs_nummer ?? f.featureId) || null, name: at.gemname || at.name || '', kanton: at.kanton || '' };
  });
}

export function mountAddress(app, { fetchJson } = {}) {
  const limiter = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false, message: { error: 'Zu viele Anfragen.' } });
  app.get('/api/adresse', limiter, async (req, res) => {
    try { res.json({ results: await searchPlaces(req.query.q, fetchJson) }); }
    catch (e) { console.error(e.message); res.status(502).json({ error: 'Adresssuche momentan nicht erreichbar.' }); }
  });
  app.get('/api/adresse/gemeinde', limiter, async (req, res) => {
    try {
      const m = await municipalityAt(req.query.lon, req.query.lat, fetchJson);
      if (!m) return res.status(404).json({ error: 'Keine Gemeinde an dieser Stelle gefunden.' });
      res.json(m);
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
}
