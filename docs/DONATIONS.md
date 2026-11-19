# Runbook: In-App-Spenden (Stripe)

Betriebshandbuch für das Modul `src/donations` (REST unter `/donations/v1`).
Spezifikation, Plan und Contracts liegen im Client-Repo:
`demokratie-live/democracy-client` → `specs/001-in-app-donations/`.

> **Grundsatz Datenschutz (Constitution Prinzip I):** Spenden dürfen nie mit DEMOCRACY-Konten,
> Geräte-Kennungen oder Abstimmungen verknüpfbar sein – auch nicht über Logs. Keine IPs, keine
> E-Mail-Adressen in Logs; Ingress-Pfad `/donations` ohne Access-Log.

---

## 1. Umgebungsvariablen

Siehe `.env.example` (Abschnitt „Donations").

- **Geheim** – ins Cluster-Secret `democracy-api-secrets` (wird nicht in Git gepflegt):
  `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SMTP_URL`. Beispiel (Werte nie in die Shell-History
  schreiben, z. B. aus einer Datei lesen):

  ```bash
  kubectl -n democracy-internal create secret generic democracy-api-secrets \
    --from-env-file=donations.secret.env --dry-run=client -o yaml | kubectl apply -f -
  ```

  Achtung: `create secret … | apply` ersetzt das ganze Secret – bestehende Schlüssel in die Datei
  übernehmen oder einzeln mit `kubectl patch` ergänzen.
- **Öffentlich** – in die ConfigMap (Repo `infrastructure`,
  `kustomize/overlays/<stage>/configs/democracy-api.env`): `DONATIONS_ENABLED`,
  `STRIPE_PUBLISHABLE_KEY`, `STRIPE_DONATION_PRODUCT_ID`, `STRIPE_PORTAL_LOGIN_URL`, optionale
  `DONATION_*`-Werte.
- **Ingress**: `kustomize/overlays/<stage>/yamls/donations-ingress.yaml` leitet `/donations` ohne
  Access-Log an die API (keine IP-Protokollierung von Spenden-Requests).

| Stage | Stripe-Modus | Webhook-URL |
|---|---|---|
| lokal | Test | `stripe listen --forward-to localhost:3000/donations/v1/stripe-webhook` |
| internal | Test | `https://internal.api.democracy-app.de/donations/v1/stripe-webhook` |
| production | Live | `https://api.democracy-app.de/donations/v1/stripe-webhook` |

Kill-Switch: `DONATIONS_ENABLED=false` → die App zeigt nur Finanzierungsstand und Bankverbindung.
Wirksam nach Rollout der ConfigMap; die App cacht `/config` max. 5 Minuten.

---

## 2. Stripe einrichten (erst Testmodus, später identisch im Live-Modus)

Status je Schritt hier abhaken und Datum/Person eintragen.

**Test-Umgebung:** die Sandbox **„Test-Modus"** des Kontos DEMOCRACY (Kontoauswahl oben links;
Dashboard-Links mit `/test/`). Stripe CLI: eigenes Profil `democracy`
(`stripe login --project-name democracy`, danach Befehle mit `stripe -p democracy …`).

**Wichtig:** Diese Test-Sandbox teilt laut Stripe manche Dashboard-Einstellungen mit dem Live-Modus.
Objekte (Products, Schlüssel, Webhooks, Portal-Konfigurationen) sind getrennt – Einstellungsseiten
ohne Test-Hinweis wirken dagegen ggf. auch live. In Sandboxes verschickt Stripe keine E-Mails an
Kund:innen; die kontoweiten Einstellungen 2.5 (Billing-Mails/Retries), 2.7 (Branding) und
2.8 (Radar) werden deshalb erst bei der Live-Einrichtung bewusst gesetzt – sie gelten dann auch für
DonorBox-Zahlungen im selben Konto.

### 2.1 Zahlungsarten (Zahlungsprofil)
Die Zahlungsarten steuert ein **Stripe-Zahlungsprofil** (Payment Method Configuration):
Dashboard → Einstellungen → Zahlungen → Zahlungsmethoden. Die ID (`pmc_…`) kommt in
`STRIPE_PAYMENT_METHOD_CONFIGURATION_ID`.

- Test-Modus: Profil **„Donation Test"** `pmc_1LBwvYLGpvKcZpqce4bG1PuO` ✓ (2026-11-19)
- Live: eigenes Profil anlegen und hier eintragen: `pmc_…`

In jedem Profil:

- [ ] Karten, **Apple Pay**, **Google Pay** an
- [ ] **SEPA-Lastschrift** an
- [ ] **PayPal** an: PayPal-Geschäftskonto des Vereins verknüpfen; Abwicklung „über Stripe";
      **wiederkehrende Zahlungen** bei PayPal beantragen (Freigabe kann dauern)
- [ ] **Klarna**, **Link**, **Giropay** und **Sofort** aus (sonst erscheinen sie in der App; Spike T009)
- [ ] Das Profil ist das **Standardprofil** des Kontos. Pflicht: Das App-SDK und Stripe-Abos
      (Dauerspenden) nutzen technisch immer das Standardprofil; nur Einzelspenden bekommen die ID
      explizit. Das von DonorBox verwaltete Plattform-Profil („Default", mit Plattform-Anwendung)
      ist davon getrennt und bleibt unverändert.

### 2.2 Product für Dauerspenden
Preise werden **inline** je Subscription erzeugt (`price_data`), es braucht nur ein Product:

```bash
stripe products create \
  --name="Monatliche Spende an DEMOCRACY" \
  -d "metadata[source]=democracy-app"
# → prod_… in STRIPE_DONATION_PRODUCT_ID
```

- [x] Product angelegt (Test): `prod_VelcsPtIRfzAjq` (2026-11-19, per CLI)
- [ ] Product angelegt (Live): `prod_…`

### 2.3 Restricted API Key (statt Secret Key)
Dashboard → Entwickler → API-Schlüssel → „Eingeschränkten Schlüssel erstellen", Name
`democracy-api donations`:

| Ressource | Recht |
|---|---|
| Customers | Schreiben |
| PaymentIntents | Schreiben |
| PaymentMethods | Lesen |
| Subscriptions | Schreiben |
| Invoices | Lesen |
| Prices | Schreiben (für `price_data`) |
| Products | Lesen |
| Customer portal (Billing Portal Sessions) | Schreiben |
| Mandates | Lesen |

- [x] Test-Key erzeugt (2026-11-19); lokal in `.env`, für internal noch ins Cluster-Secret
- [ ] Live-Key erzeugt und als Secret hinterlegt

### 2.4 Webhook-Endpoint

> **API-Version:** Das Konto steht (wegen DonorBox) auf der Standard-Version `2020-03-02`. Webhooks des
> Spendenmoduls müssen in der Version kommen, auf die der Server gepinnt ist (`STRIPE_API_VERSION` in
> `src/donations/stripe.ts`, derzeit `2026-10-28.endive`) – sonst fehlen z. B. `invoice.parent`-Daten.
> Der Server lehnt abweichende Events mit `400` ab und loggt „falsche Stripe-API-Version". Beim Anlegen
> des Endpoints deshalb die API-Version ausdrücklich wählen; die Standard-Version des Kontos **nicht**
> ändern (betrifft DonorBox).

Lokal: kein Dashboard-Endpoint nötig – `stripe -p democracy listen --latest --forward-to
localhost:3000/donations/v1/stripe-webhook` (`--latest` liefert Events in der neuesten API-Version;
weicht die von der gepinnten ab, lehnt der Server sie ab → dann SDK-Pin anheben oder Endpoint im
Dashboard nutzen). Das Secret liefert `stripe -p democracy listen --print-secret` (✓ 2026-11-19 in
lokaler `.env`). Den internal-Endpoint erst anlegen, wenn die API mit
dem Spendenmodul auf internal läuft (sonst deaktiviert Stripe ihn nach Fehlzustellungen).
Dashboard → Entwickler → Webhooks → Endpoint hinzufügen (URL siehe Tabelle oben), **API-Version
`2026-10-28.endive`**, Events:

```
payment_intent.succeeded
payment_intent.payment_failed
invoice.paid
invoice.payment_failed
customer.subscription.updated
customer.subscription.deleted
charge.refunded
charge.dispute.created
mandate.updated
```

- [ ] Test-Endpoint (internal) angelegt, Signing Secret → `STRIPE_WEBHOOK_SECRET`
- [ ] Live-Endpoint (production) angelegt, Signing Secret → `STRIPE_WEBHOOK_SECRET`

### 2.5 Billing (Dauerspenden)
Dashboard → Einstellungen → Billing → Abonnements und E-Mails:

- [ ] **Smart Retries** an (Stripe-Standard), danach **Abonnement kündigen**
- [ ] E-Mail bei fehlgeschlagener Zahlung **an**, mit Link zur von Stripe gehosteten Seite
- [ ] E-Mail, wenn eine Zahlung bestätigt werden muss (3-D Secure), **an**
- [ ] Kunden-E-Mails „Erfolgreiche Zahlungen" **aus** (wir senden eigene Bestätigungen)
- [ ] SEPA-Lastschrift-Benachrichtigungen (Mandat/Vorabankündigung) **an**

### 2.6 Kundenportal
Dashboard → Einstellungen → Billing → Kundenportal:

- [ ] Zahlungsmethode aktualisieren: an
- [ ] Rechnungsverlauf: an
- [ ] Abonnement kündigen: an (zum Periodenende)
- [ ] Abonnement aktualisieren / Tarifwechsel: **aus** (Betrag ändert man in der App)
- [ ] Links: Datenschutz `https://www.democracy-deutschland.de/datenschutz`, Impressum
- [ ] **Login-Link aktivieren** → URL in `STRIPE_PORTAL_LOGIN_URL` (Test und Live getrennt)
- Test: eigene Konfiguration „DEMOCRACY App" `bpc_1UdSNXLGpvKcZpqcJ10Y76O7` per API angelegt
  (Zahlungsart ändern, Rechnungen, E-Mail ändern, Kündigen zum Periodenende, kein Tarifwechsel,
  Login-Link `https://billing.stripe.com/p/login/test_6oU00k0E10gMcSFd8d1kA00`). Das Standardportal
  bleibt unverändert. Live analog anlegen → `STRIPE_PORTAL_CONFIGURATION_ID` (Pflicht, sonst startet das
  Modul nicht).
- **Ein Stripe-Customer je Spender-Schlüssel:** Dauerspenden übernehmen nie einen bestehenden Customer per
  E-Mail (die E-Mail ist unbestätigt, der Schlüssel öffnet das Portal dieses Customers). Wer auf zwei
  Geräten je eine Dauerspende einrichtet, hat deshalb zwei Customers mit derselben E-Mail. **Beim ersten
  Test prüfen**, wie der Portal-Login per E-Mail-Link damit umgeht.

### 2.7 Branding und Abrechnungstexte
Dashboard → Einstellungen → Branding / Öffentliche Unternehmensdaten:

- [ ] Öffentlicher Name „DEMOCRACY Deutschland e.V.", Icon, Akzentfarbe `#4494d3`
- [ ] Abrechnungstext (Statement Descriptor) `DEMOCRACY DEUTSCHLAND` (max. 22 Zeichen); der Server
      setzt das Suffix `SPENDE`
- [ ] Support-E-Mail `spenden@democracy-deutschland.de`

### 2.8 Radar (Missbrauchsschutz)
- [ ] Regel „Blockieren, wenn die CVC-Prüfung fehlschlägt" aktiv
- [ ] Benachrichtigung bei frühen Betrugswarnungen an Kassenwart

---

## 3. Apple Pay und Google Pay

Schritte für Apple (Merchant ID, Zertifikat über Stripe-CSR) und Google (Production-Zugang) stehen
im Client-Repo: `docs/deployment/IOS.md` und `docs/deployment/ANDROID.md` (Abschnitt
„In-App-Spenden").

---

## 4. Organisatorisches (Vorstand)

- [ ] **Stripe-Nonprofit-Rabatt** beantragen: Support-Formular im Dashboard; Konto-ID,
      Konto-E-Mail, aktueller Freistellungsbescheid, Bestätigung ≥ 80 % steuerbegünstigte
      Spenden im Stripe-Volumen. Ausdrücklich fragen, ob SEPA und Wallets mit rabattiert werden.
- [ ] **PayPal-Tarif prüfen**: Gebühr einer 10-€-Spende im PayPal-Konto ansehen
      (0,50 € = Gemeinnützigkeitstarif 1,5 % + 0,35 €; 0,60 € = Standard-Spendentarif).
      Bei PayPal bestätigen lassen, dass der Tarif auch für über Stripe verknüpfte Zahlungen gilt.
- [ ] **Aktueller Freistellungsbescheid** (Finanzamt, Datum, Steuernummer, Zwecke) für
      Bestätigungs-E-Mails und App-Texte bereitstellen.
- [ ] **SMTP-Zugang** für `spenden@democracy-deutschland.de` bereitstellen.

---

## 5. Betrieb

- **Hinweise für den Kassenwart (T062):** Erstattungen (`charge.refunded`), Rückbuchungen/Widersprüche
  (`charge.dispute.created`) und ungültig gewordene SEPA-Mandate (`mandate.updated` → `inactive`)
  protokolliert der Server als Warnung mit Herkunft `app`/`andere`/`unbekannt` und nur Stripe-IDs –
  auch für DonorBox-Zahlungen. Spender:innen bekommen dazu keine Mail, Dauerspenden bleiben unverändert.
  **Achtung:** Der Logger von democracy-api schreibt nur in Konsole und MongoDB (`LOGGING_DISCORD*` ist
  konfiguriert, aber kein Transport angebunden). Den eigentlichen Alarm liefern deshalb Stripes
  E-Mail-Benachrichtigungen: Dashboard → Einstellungen → Persönliche Daten → **Kommunikations-
  einstellungen** → für den Kassenwart „Rückbuchungen/Disputes", „Erfolgreiche Zahlungen" (optional)
  und „Fehlgeschlagene Zahlungen" aktivieren. Rückbuchungen haben eine Antwortfrist.
- **Rate-Limit:** 30 Zahlungsversuche (Verwalten: 60 Anfragen) je 10 Minuten und Client, gezählt
  **pro Pod** im Speicher (Produktion: 10 Replicas → im ungünstigsten Fall das Zehnfache). 30 statt 10,
  weil viele Mobilfunkkund:innen sich eine IPv4 teilen (Carrier-NAT). Der Zählerschlüssel ist ein
  gesalzener IP-Hash; IPs werden nicht gespeichert. Hauptschutz gegen Card-Testing sind Stripe Radar
  und der Mindestbetrag; bei Missbrauch Radar-Regeln verschärfen.
- **Fehlerhafte Konfiguration:** Ist eine Spenden-Variable ungültig (z. B. `DONATION_FEE_CARD_PCT=1,5`),
  startet die API trotzdem; das Spendenmodul antwortet dann auf alles mit `503 donations_disabled` und
  loggt „Spendenmodul deaktiviert – Konfiguration ungültig" mit den Problemen (ohne Werte).
- **Testmodus-Mails:** Mit Stripe-Testschlüssel (internal) gehen Bestätigungen nur an
  `DONATION_TEST_MAIL_ALLOWLIST` – dort kann jeder mit Testkarten „spenden", ohne Liste ließe sich der
  Vereins-Absender als Spam-Schleuder missbrauchen.
- **Webhook-Verarbeitung:** Ein Event gilt erst nach erfolgreicher Verarbeitung als erledigt. Läuft es
  parallel noch, antwortet der Server `409` (Stripe stellt später erneut zu); bleibt eine Verarbeitung
  hängen (Pod beendet), übernimmt ein Retry nach 5 Minuten. Events mit falscher API-Version lehnt der
  Server ab – Stripe-Retries behalten die alte Version, solche Events sind verloren. Deshalb den
  Endpoint **vor** dem Einschalten mit der richtigen Version anlegen.
- **Ingress-Logs:** Das Access-Log ist für `/donations` aus. Das **Error-Log** von ingress-nginx
  enthält bei Upstream-Fehlern (502/504, z. B. während eines Rollouts) aber weiterhin Client-IP und
  Pfad. Eine Abschaltung je Location ginge nur per Snippet-Annotation (im Cluster oft gesperrt);
  bewusst als Restrisiko dokumentiert.
- **Monatsexport für die Buchhaltung (T061):** Dashboard → **Berichte → Saldo** → Zeitraum = Monat →
  Detailbericht **„Saldoänderungen aus Aktivität" (Itemized balance change from activity)** →
  „Spalten" → zusätzlich `payment_method_type`, `customer_email`, `subscription_id` sowie die
  Metadaten `payment_metadata[source]`, `payment_metadata[interval]`, `payment_metadata[cover_fees]`,
  `payment_metadata[base_amount]` → CSV herunterladen. In der Tabelle nach
  `payment_metadata[source] = democracy-app` filtern; `gross` = Spende inkl. Aufschlag, `fee` =
  Stripe-/PayPal-Gebühr, `net` = Auszahlung an den Verein. Erstattungen und Rückbuchungen stehen als
  eigene Zeilen (`reporting_category` `refund` bzw. `dispute`) im selben Bericht.
  - Dauerspenden: Stripe setzt bei Rechnungszahlungen keine Metadaten; der Server ergänzt sie beim
    Webhook `invoice.paid` am PaymentIntent (ab 2026-11-19). **Beim ersten Monatsexport prüfen**, ob
    die Spalte `payment_metadata[source]` auch bei Dauerspenden gefüllt ist. Falls nicht: Zeilen mit
    `subscription_id` über die Subscription-Metadaten (`source: democracy-app`) zuordnen.
  - Für den Abgleich mit dem Bankkonto: Bericht **„Auszahlungsabgleich" (Payout reconciliation)**
    desselben Monats – jede Auszahlung mit den enthaltenen Spenden.
  - Kennzahlen: Anteil `cover_fees = true` an allen App-Spenden (SC-002a); Erfolgsquote = erfolgreiche
    / alle angelegten PaymentIntents mit `source = democracy-app` (Dashboard → Zahlungen, Filter
    „Status") (SC-004).
- **Formale Zuwendungs-/Sammelbestätigung auf Anfrage:** folgt mit Task T060.
- **DonorBox:** nutzt dasselbe Stripe-Konto. Alle App-Objekte tragen
  `metadata.source = democracy-app`; alles andere ignoriert der Webhook.
