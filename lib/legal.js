/** Impressum und Datenschutzerklärung (öffentlich, indexierbar). Stand und Inhalte hier pflegen. */
import { page } from './views.js';

const STAND = '23. Oktober 2026';
const ADR = 'Schweizer Verband für Kurzzeitvermietung «SSTRA» (Swiss Short Term Rental Association)<br>Hauptgasse 33<br>CH-4600 Olten';

const impressum = `
<nav class="crumbs" aria-label="Brotkrumen"><a href="/">Start</a> › Impressum</nav>
<h1 class="display h-l">Impressum</h1>
<div class="prose legal">
<h2>Herausgeber</h2>
<p>${ADR}<br>E-Mail: <a href="mailto:info@hostsummit.ch">info@hostsummit.ch</a><br>Web: sstra.ch</p>
<h2>Rechtsform und Vertretung</h2>
<p>Verein im Sinne von Art. 60 ff. ZGB mit Sitz in Olten. Gegründet am 19. September 2026. Präsident: Reto Baumgartner.</p>
<h2>Inhalt und Haftung</h2>
<p>Wir erstellen die Inhalte dieser Website mit Sorgfalt. Das <strong>Regelradar</strong> ist eine Zusammenstellung des Verbands auf Basis öffentlich zugänglicher Quellen, die bei jeder Aussage verlinkt sind. Regeln ändern sich schnell. Es ist <strong>keine Rechtsberatung</strong>, und wir übernehmen keine Gewähr für Vollständigkeit, Richtigkeit und Aktualität. Massgebend sind die verlinkten Originalquellen und die Auskunft der zuständigen Behörde.</p>
<p>Für Inhalte externer Websites, auf die wir verlinken, sind ausschliesslich deren Betreiber verantwortlich.</p>
<h2>Urheberrecht</h2>
<p>Texte, Grafiken und Daten dieser Website sind urheberrechtlich geschützt. Die Verwendung von Zahlen und Aussagen des Regelradars mit Quellenangabe ist erwünscht, zum Beispiel: «Quelle: Regelradar, Schweizer Verband für Kurzzeitvermietung (SSTRA), sstra.ch, Stand 21.10.2026». Medienbeiträge Dritter bleiben im Eigentum der jeweiligen Rechteinhaber. Der Ausschnitt aus 10vor10 (SRF) vom 21. Oktober 2026 wird mit Erlaubnis von SRF gezeigt.</p>
<h2>Quellen und Lizenzen</h2>
<p>Kartengrundlage: Bundesamt für Statistik (BFS), GEOSTAT, Gemeindegrenzen Stand 2024, bereitgestellt über das Paket «swiss-maps». Adresssuche: Bundesamt für Landestopografie swisstopo (geo.admin.ch). Schrift: Hanken Grotesk (SIL Open Font License), von uns selbst ausgeliefert.</p>
<p>Stand: ${STAND}</p>
</div>`;

const datenschutz = `
<nav class="crumbs" aria-label="Brotkrumen"><a href="/">Start</a> › Datenschutz</nav>
<h1 class="display h-l">Datenschutzerklärung</h1>
<div class="prose legal">
<p>Wir nehmen den Schutz deiner Personendaten ernst. Diese Erklärung zeigt, welche Daten wir auf sstra.ch bearbeiten, wozu, und welche Rechte du hast. Sie richtet sich nach dem Schweizer Datenschutzgesetz (DSG).</p>
<h2>1. Verantwortlicher</h2>
<p>${ADR}<br>E-Mail: <a href="mailto:info@hostsummit.ch">info@hostsummit.ch</a></p>
<h2>2. Welche Daten wir bearbeiten und wozu</h2>
<ul>
<li><strong>Besuch der Website.</strong> Beim Aufruf fallen technische Daten an (IP-Adresse, Zeitpunkt, aufgerufene Seite, Browsertyp). Der Hosting-Anbieter kann sie kurzzeitig protokollieren, damit die Seite sicher und stabil läuft. Wir setzen <strong>keine Analyse-, Werbe- oder Tracking-Cookies</strong> ein und laden keine Schriften oder Skripte von Drittanbietern nach.</li>
<li><strong>Login.</strong> Für den Mitgliederbereich setzen wir nach dem Login ein technisch notwendiges Sitzungs-Cookie. Ein Passwort gibt es nicht, du erhältst einen Login-Link per E-Mail.</li>
<li><strong>Newsletter.</strong> E-Mail-Adresse und deine Einwilligung. Zweck: Versand von Neuigkeiten zu Regeln und Terminen. Du kannst dich jederzeit abmelden.</li>
<li><strong>Mitgliedsantrag und Mitgliedschaft.</strong> Name, E-Mail, Telefon, Firma oder Objektname, Kanton, Anzahl Objekte, Nachricht, gewählte Mitgliedschaft und Zahlungsart. Zweck: Prüfung des Antrags, Mitgliederverwaltung, Rechnungsstellung, Zugang zum Mitgliederbereich.</li>
<li><strong>Rechnungen und Zahlungen.</strong> Rechnungsnummer, Betrag, Datum, Name und E-Mail, Zahlungsstatus. Bei Online-Zahlung wickelt unser Zahlungsdienstleister die Zahlung ab. Wir sehen deine Kartendaten nie.</li>
<li><strong>Stammtische und Regionalgruppen.</strong> Name, E-Mail und deine Einwilligung zur Anmeldung oder Interessensmeldung. Zweck: Organisation und Information zum Anlass.</li>
<li><strong>Kontakt.</strong> Wenn du uns schreibst, bearbeiten wir deine Angaben, um dir zu antworten.</li>
<li><strong>Adress-Check.</strong> Dein Suchtext wird von unserem Server an die offene Schnittstelle von swisstopo (geo.admin.ch) weitergeleitet, um Adresse und Gemeinde zu finden. Deine IP-Adresse wird dabei nicht weitergegeben, und wir speichern die Eingabe nicht dauerhaft.</li>
</ul>
<h2>3. Rechtsgrundlagen</h2>
<p>Wir bearbeiten Daten, soweit es für die Mitgliedschaft und deren Abwicklung nötig ist, aufgrund deiner Einwilligung (zum Beispiel Newsletter, Stammtisch) oder aufgrund unseres berechtigten Interesses an einem sicheren und funktionierenden Webauftritt.</p>
<h2>4. Dienstleister, an die wir Daten weitergeben</h2>
<p>Wir setzen sorgfältig ausgewählte Dienstleister ein, die Daten in unserem Auftrag bearbeiten:</p>
<ul>
<li><strong>Railway</strong> (Hosting der Website und der Datenbank).</li>
<li><strong>GoHighLevel</strong> (Verwaltung von Kontakten und Mitgliedern, Versand von E-Mails, inklusive dessen E-Mail-Infrastruktur).</li>
<li><strong>Stripe</strong> (Online-Zahlungen, sobald sie angeboten werden).</li>
<li><strong>Hostpoint</strong> (Domain und DNS) und <strong>Microsoft 365</strong> (unser E-Mail-Postfach).</li>
<li><strong>swisstopo</strong> (Adress- und Gemeindesuche, siehe oben).</li>
</ul>
<h2>5. Datenübermittlung ins Ausland</h2>
<p>Einige Dienstleister bearbeiten Daten ausserhalb der Schweiz, insbesondere in den USA. Wir stellen sicher, dass dabei ein angemessener Datenschutz besteht, etwa durch Zertifizierungen unter dem Swiss-US Data Privacy Framework oder durch Standardvertragsklauseln.</p>
<h2>6. Aufbewahrung</h2>
<p>Newsletter-Daten bewahren wir bis zur Abmeldung auf. Mitgliederdaten bewahren wir für die Dauer der Mitgliedschaft auf. Rechnungen und Buchungsbelege bewahren wir während der gesetzlichen Frist von zehn Jahren auf. Danach löschen wir die Daten.</p>
<h2>7. Deine Rechte</h2>
<p>Du kannst jederzeit Auskunft über deine Daten verlangen, sie berichtigen oder löschen lassen, der Bearbeitung widersprechen und eine erteilte Einwilligung widerrufen. Schreibe uns an <a href="mailto:info@hostsummit.ch">info@hostsummit.ch</a>. Du kannst dich ausserdem beim Eidgenössischen Datenschutz- und Öffentlichkeitsbeauftragten (EDÖB) beschweren.</p>
<h2>8. Datensicherheit</h2>
<p>Die Verbindung zur Website ist verschlüsselt. Login-Links sind kurz gültig, und der Zugriff auf Mitgliederdaten ist auf den Vorstand beschränkt. Eine absolute Sicherheit bei der Datenübertragung im Internet kann niemand garantieren.</p>
<h2>9. Änderungen</h2>
<p>Wir passen diese Erklärung an, wenn sich unsere Angebote oder die Rechtslage ändern. Es gilt die jeweils hier veröffentlichte Fassung.</p>
<p>Stand: ${STAND}</p>
</div>`;

export function mountLegal(app) {
  const show = (path, title, body, description) => app.get(path, (req, res) => res.send(page({ title, body, user: req.user, publicNav: true, index: true, canonical: path, description })));
  show('/impressum.html', 'Impressum', impressum, 'Impressum des Schweizer Verbands für Kurzzeitvermietung SSTRA, Hauptgasse 33, 4600 Olten.');
  show('/datenschutz.html', 'Datenschutzerklärung', datenschutz, 'Datenschutzerklärung des Schweizer Verbands für Kurzzeitvermietung SSTRA nach Schweizer Datenschutzgesetz.');
}
