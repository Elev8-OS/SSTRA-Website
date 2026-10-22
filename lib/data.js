import fs from 'node:fs';
import path from 'node:path';
import { isProd } from './config.js';

const dir = path.join(path.dirname(new URL(import.meta.url).pathname), '../public/data');
const cache = new Map();
function load(file) {
  if (isProd && cache.has(file)) return cache.get(file);
  const v = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  if (isProd) cache.set(file, v);
  return v;
}
export const rules = () => load('regeln.json');
export const regionen = () => load('regionen.json');
export const aktuell = () => load('aktuell.json');

export const NAMES = { SH:'Schaffhausen',TG:'Thurgau',BS:'Basel-Stadt',AG:'Aargau',ZH:'Zürich',SG:'St. Gallen',AR:'Appenzell Ausserrhoden',JU:'Jura',BL:'Basel-Landschaft',SO:'Solothurn',ZG:'Zug',SZ:'Schwyz',AI:'Appenzell Innerrhoden',NE:'Neuenburg',BE:'Bern',LU:'Luzern',NW:'Nidwalden',UR:'Uri',GL:'Glarus',GR:'Graubünden',GE:'Genf',VD:'Waadt',FR:'Freiburg',OW:'Obwalden',VS:'Wallis',TI:'Tessin' };

/** URL-taugliche Schreibweise, identisch zur Variante im Browser (radar.js). */
export const slugify = (s) => String(s).toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/[éèê]/g, 'e').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const slugOf = (k) => slugify(NAMES[k]);
export const codeOfSlug = (s) => { s = String(s).toLowerCase(); return Object.keys(NAMES).find((k) => slugOf(k) === s || k.toLowerCase() === s) || null; };

export const today = () => new Date().toISOString().slice(0, 10);
export const fmtDate = (d) => d.split('-').reverse().join('.');

/** Nächste Anlässe über alle Regionen, sortiert nach Datum. */
export function upcomingEvents(limit = 50) {
  const t = today();
  return regionen().regionen.flatMap((r) => r.events.filter((e) => e.datum >= t).map((e) => ({ ...e, region: r.name, slug: r.slug })))
    .sort((a, b) => a.datum.localeCompare(b.datum)).slice(0, limit);
}
