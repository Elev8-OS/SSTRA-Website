/**
 * Mitgliedschaft: Beitragstabelle, Leistungen und Bedingungen aus der Beitrags- und Gebührenordnung.
 * Inhalte: public/data/mitgliedschaft.json, Beiträge und Stufen: config/plans.json.
 */
import { config } from './config.js';
import { esc } from './views.js';
import { mitgliedschaft } from './data.js';
import { chf } from './fees.js';

/** Spalte der Zusatzleistungen je Stufe: Stufe 1, 2, 3 und 4, 5 und 6. */
export const zusatzSpalte = (tier) => (tier >= 1 ? [0, 1, 2, 2, 3, 3][tier - 1] : -1);
const price = (n) => `CHF ${chf(n).replace(/\B(?=(\d{3})+(?!\d))/g, "'")}`;
const ok = '<span class="yes" aria-label="Ja">✓</span>';
const no = '<span class="no" aria-label="Nein">–</span>';

/** Leistungen, die ein Mitglied dieser Stufe erhält (Mitgliederbereich). */
export function benefitsFor(planKey) {
  const M = mitgliedschaft(), plan = config.plans[planKey];
  if (!plan) return { alle: [], zusatz: [] };
  const col = zusatzSpalte(plan.tier);
  return { alle: M.alle.items.map((i) => i.t), zusatz: col < 0 ? [] : M.zusatz.items.filter((i) => i.v[col]).map((i) => i.t) };
}

export function mitgliedHtml() {
  const M = mitgliedschaft(), plans = Object.entries(config.plans);
  return `<section id="mitglied" class="on-light">
  <div class="wrap">
    <div class="sec-head">
      <h2 class="display h-l">Mitglied werden</h2>
      <p class="lead">Je mehr Gastgeber wir sind, desto mehr Gewicht hat unsere Stimme. Es gibt eine einzige Beitragstabelle: Du wählst die Stufe, die zu dir passt.</p>
    </div>
    <ol class="steps" aria-label="So läuft der Beitritt ab">
      <li><strong>Antrag senden</strong>Dauert zwei Minuten, ohne Zahlung.</li>
      <li><strong>Vorstand prüft</strong>Du hörst in der Regel innert weniger Tage von uns.</li>
      <li><strong>Beitrag und Zugang</strong>Du bezahlst den Beitrag nach der Freigabe. Danach öffnet sich der Mitgliederbereich.</li>
    </ol>

    <h3 class="h-m fee-h" id="beitraege">Mitgliederbeiträge ab 1. Januar 2027</h3>
    <div class="fee-wrap"><table class="fee-table">
      <thead><tr><th scope="col">Stufe</th><th scope="col">Kriterium</th><th scope="col" class="num">Jahresbeitrag</th><th scope="col"><span class="sr-only">Antrag</span></th></tr></thead>
      <tbody>${plans.map(([k, p]) => `<tr${p.tier === 0 ? ' class="fee-einzel"' : ''}><th scope="row">${esc(p.name)}</th><td>${esc(p.description)}</td><td class="num">${price(p.amountChf)}</td><td class="act"><a class="btn btn-${p.tier === 0 ? 'red' : 'black'} small" href="/mitglied-werden.html?plan=${esc(k)}">Antrag stellen</a></td></tr>`).join('')}</tbody>
    </table></div>
    <p class="vote-note">${esc(M.einzel)}</p>

    <div class="benefits">
      <div class="benefit-card">
        <h3 class="h-m">${esc(M.alle.titel)}</h3>
        <p class="muted">${esc(M.alle.lead)}</p>
        <ul class="benefit-list">${M.alle.items.map((i) => `<li><span>${esc(i.t)}</span>${i.wert ? `<em>${esc(i.wert)}</em>` : ''}</li>`).join('')}</ul>
        <p class="benefit-sum"><strong>Summe der bezifferbaren Leistungen: ${esc(M.alle.summe)}</strong></p>
        <p class="note">${esc(M.alle.fussnote)}</p>
      </div>
      <div class="benefit-card">
        <h3 class="h-m">${esc(M.zusatz.titel)}</h3>
        <p class="muted">${esc(M.zusatz.lead)}</p>
        <div class="fee-wrap"><table class="matrix">
          <thead><tr><th scope="col">Leistung</th>${M.zusatz.spalten.map((c) => `<th scope="col" class="c">${esc(c)}</th>`).join('')}</tr></thead>
          <tbody>${M.zusatz.items.map((i) => `<tr><th scope="row">${esc(i.t)}</th>${i.v.map((v, n) => `<td class="c" data-label="${esc(M.zusatz.spalten[n])}">${v ? ok : no}</td>`).join('')}</tr>`).join('')}</tbody>
        </table></div>
      </div>
    </div>

    <div class="fee-rules">
      <details><summary>Welcher Umsatz zählt für die Stufen 1 bis 6?</summary><p>${esc(M.umsatz)}</p></details>
      <details><summary>Fälligkeit und Zahlung</summary><p>${esc(M.zahlung)}</p></details>
      <details><summary>Stimmrecht</summary><p>${esc(M.stimmrecht)}</p></details>
    </div>
    <p class="note">${esc(M.hinweis)}</p>
  </div>
</section>`;
}
