# Swiss Short Term Rental Association: Website mit Mitgliederbereich

Statische Website plus kleiner Node-Server (Express). GoHighLevel (GHL) ist die einzige Datenquelle für Mitglieder, Stripe verarbeitet die Zahlungen.

## Architektur

```
Besucher ──► Website (public/)  ──► /api/apply, /api/newsletter, /api/contact
                                        │
Mitglieder ─► Login per Magic Link ──►  Node-Server (app.js) ──► GHL (Kontakte, Tags, Notizen, E-Mails, Workflow-Webhook)
Vorstand  ──► /vorstand                 │
                                        └──► Stripe Checkout (Karte, TWINT) ──► Webhook ──► Mitglied aktiv
```

**Rollen und Status leben als Tags am GHL-Kontakt.** Der Vorstand sieht und ändert alles auch direkt in GHL.

| Tag | Bedeutung |
|---|---|
| `antrag:offen` / `antrag:freigegeben` / `antrag:abgelehnt` | Stand des Antrags |
| `status:aktiv` | Zugang zum Mitgliederbereich |
| `rolle:mitglied` / `rolle:foerdermitglied` / `rolle:vorstand` | Rolle (Admin kommt aus `ADMIN_EMAILS`) |
| `kategorie:gastgeber` usw. | Mitgliedschaftskategorie |
| `bis:2027-10-21`, `seit:2026-10-21` | Beitrag gültig bis, Mitglied seit |
| `zahlung:rechnung` | Zahlung per Rechnung gewünscht |
| `pay:<id>` | letzte Zahlung (verhindert Doppelverarbeitung) |
| `kanton:lu`, `newsletter`, `kontakt`, `einwilligung:*` | Zusatzinfos |

**Rechte**

| Bereich | Fördermitglied | Mitglied | Vorstand | Admin |
|---|---|---|---|---|
| `/mitglieder` (Dokumente laut Rolle) | ja | ja | ja | ja |
| `/vorstand` (Anträge, Mitglieder, Unterlagen) | nein | nein | ja | ja |
| Rollen vergeben | nein | nein | nein | ja |

Dokumente und ihre Rollen stehen in `content/members/index.json`. Neue Inhalte: Markdown-Datei ins Verzeichnis legen, Eintrag ergänzen, deployen.

> **Achtung:** Die Mitglieder-Dokumente liegen in diesem Repo. Das Repo muss deshalb **privat** sein, sobald echte Inhalte (Protokolle, interne Unterlagen) hineinkommen.

## Ablauf Mitgliedschaft

1. Antrag auf `/mitglied-werden.html` ➜ Kontakt in GHL mit `antrag:offen`, Notiz, Bestätigungsmail.
2. Vorstand gibt in `/vorstand` frei ➜ Mail an Antragsteller mit **Zahlungslink** (Stripe: Karte, TWINT) oder Hinweis auf Rechnung.
3. Zahlung ➜ Stripe-Webhook ➜ `status:aktiv`, Rolle, `bis:`-Datum (+1 Jahr), Willkommensmail mit Login-Link.
   Bei Rechnung bestätigt der Vorstand die Zahlung per Klick.
4. Erneuerung: Nach Ablauf sehen Mitglieder nur noch den Button „Beitrag erneuern“.

## Einrichtung

### 1. GHL (wichtig: eigene Subaccount-Location für den Verband)
Der Verband braucht eine eigene GHL-Subaccount-Location, getrennt vom Vertriebs-CRM von Elev8 (Datenschutz, Unabhängigkeit, Elev8 ist Partner des Verbands).

1. **Private Integration** erstellen (Settings ➜ Private Integrations) mit Berechtigungen: Contacts lesen/schreiben, Conversations/Messages schreiben. ➜ `GHL_TOKEN`, Location-ID ➜ `GHL_LOCATION_ID`.
2. **E-Mail-Versand** im Subaccount einrichten (eigene Absenderdomain mit SPF/DKIM). Ohne diese gehen Login-Links nicht zuverlässig raus.
3. Optional **Workflow mit Inbound-Webhook** erstellen und die URL in `GHL_WORKFLOW_WEBHOOK_URL` eintragen. Der Server meldet dorthin diese Ereignisse (JSON mit `event`):
   `application.received`, `application.approved.payment`, `application.approved.invoice`, `application.rejected`, `member.activated`, `contact.received`.
   Damit baust du in GHL ohne Code: Benachrichtigung an den Vorstand, Slack-Meldung, Aufgabe für die Rechnung, Erinnerungs-Mails vor Ablauf.

### 2. Stripe
1. Konto aktivieren, **TWINT** im Dashboard unter Zahlungsmethoden einschalten (Anforderungen von TWINT beachten; Betragslimit bei TWINT-Einmalzahlungen: CHF 5000).
2. Webhook anlegen: `https://DEINE-DOMAIN/api/stripe/webhook`, Ereignis `checkout.session.completed` ➜ Signing Secret ➜ `STRIPE_WEBHOOK_SECRET`.
3. `STRIPE_SECRET_KEY` setzen. Erst im Testmodus prüfen, dann auf Live umstellen.
4. **Beiträge festlegen** in `config/plans.json` (`amountChf`). Solange `null` steht, läuft alles über Rechnung.

### 3. Railway
1. Neues Railway-Projekt ➜ „Deploy from GitHub“ ➜ dieses Repo wählen.
2. Variablen aus `.env.example` im Railway-Dashboard setzen (nie ins Repo schreiben).
3. Custom Domain verbinden, `BASE_URL` auf die finale `https://`-Adresse setzen.
4. Healthcheck ist `/health` (in `railway.json`).

### 4. Erster Login
`ADMIN_EMAILS` enthält die ersten Administratoren. Diese melden sich über `/login.html` an, ein Kontakt wird automatisch angelegt. Danach können sie im Vorstandsbereich Rollen vergeben.

## Lokal ausprobieren
```
npm install
npm start        # ohne Schlüssel: Mock-Modus (Daten nur im Speicher, Zahlungs-Simulator)
npm test         # 12 End-to-End-Tests
```
Im Mock-Modus wird keine echte Mail verschickt. Der Test-Code zeigt, wie der Login-Link aus dem Outbox gelesen wird. Im Produktivmodus (`NODE_ENV=production`) startet der Server nur mit vollständiger Konfiguration.

## Sicherheit
- Login ohne Passwort: Link 15 Minuten gültig, einmal verwendbar, Zwischenseite gegen Mail-Scanner.
- Session als HttpOnly-Cookie (12 h). Rolle wird bei jeder Anfrage aus GHL geladen (30 s Zwischenspeicher), ein Entzug wirkt also spätestens nach 30 Sekunden.
- Stripe-Webhook mit Signaturprüfung, Verarbeitung idempotent.
- Herkunftsprüfung gegen CSRF, Rate-Limits, Honeypot, Eingabe-Validierung, Security-Header (CSP, HSTS).
- Antworten beim Login verraten nicht, ob eine Adresse existiert.

## Vor dem Livegang zu prüfen
- [ ] **Repo auf privat stellen** (Settings ➜ Danger Zone ➜ Change visibility).
- [ ] **GHL-Aufrufe im Livebetrieb testen.** Der Code ist gegen die GHL-API v2 geschrieben, konnte aber nicht gegen ein echtes Konto laufen. Besonders prüfen: Kontaktsuche per E-Mail (`/contacts/search/duplicate`), Tag-Suche für die Vorstandsliste (`/contacts/search`), E-Mail-Versand (`/conversations/messages`). Anpassungen stehen alle in `lib/ghl.js`.
- [ ] Beiträge in `config/plans.json`, Statuten, Impressum und Datenschutzerklärung (Platzhalter-Seiten) erstellen lassen.
- [ ] Inhalte der Kanton-Regelkarte (`public/js/site.js`) juristisch prüfen und mit Quellen versehen.
- [ ] `package-lock.json` erzeugen (`npm install`) und einchecken, damit Abhängigkeiten fest gepinnt sind.
- [ ] Mehrere Server-Instanzen: Magic-Link-Speicher und Cache (`lib/auth.js`) wären dann in Redis auszulagern. Eine Instanz reicht für den Start.
- [ ] Mitgliederliste regelmässig aus GHL exportieren (Backup).
