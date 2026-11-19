# Runbook: In-App-Spenden (Stripe)

Betriebshandbuch für das Modul `src/donations` (REST unter `/donations/v1`).
Spezifikation, Plan und Contracts liegen im Client-Repo:
`demokratie-live/democracy-client` → `specs/001-in-app-donations/`.

> **Grundsatz Datenschutz (Constitution Prinzip I):** Spenden dürfen nie mit DEMOCRACY-Konten,
> Geräte-Kennungen oder Abstimmungen verknüpfbar sein – auch nicht über Logs. Keine IPs, keine
> E-Mail-Adressen in Logs; Ingress-Pfad `/donations` ohne Access-Log.

---

## 1. Umgebungsvariablen

Siehe `.env.example` (Abschnitt „Donations"). Geheim (Kubernetes-Secret): `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, `SMTP_URL`. Alles andere über die ConfigMap.

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

### 2.1 Zahlungsarten
Dashboard → Einstellungen → Zahlungsmethoden:

- [ ] Karten, **Apple Pay**, **Google Pay** aktiv
- [ ] **SEPA-Lastschrift** aktiv
- [ ] **PayPal** aktiv: PayPal-Geschäftskonto des Vereins verknüpfen; Abwicklung „über Stripe";
      **wiederkehrende Zahlungen** beantragen (Freigabe durch PayPal, kann dauern). Erst nach
      Freigabe `paypal` in `DONATION_METHODS_MONTHLY` ergänzen.
- [ ] **Link** deaktiviert (vereinfacht das Zahlungsfenster)

### 2.2 Product für Dauerspenden
Preise werden **inline** je Subscription erzeugt (`price_data`), es braucht nur ein Product:

```bash
stripe products create \
  --name="Monatliche Spende an DEMOCRACY" \
  -d "metadata[source]=democracy-app"
# → prod_… in STRIPE_DONATION_PRODUCT_ID
```

- [ ] Product angelegt (Test): `prod_…`
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

- [ ] Test-Key erzeugt und als Secret hinterlegt (nie in Git, nie im Client)
- [ ] Live-Key erzeugt und als Secret hinterlegt

### 2.4 Webhook-Endpoint
Dashboard → Entwickler → Webhooks → Endpoint hinzufügen (URL siehe Tabelle oben), Events:

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

- **Monitoring:** Webhook-Fehler, Rückbuchungen (`charge.dispute.created`) und Erstattungen gehen
  als Warnung an den Discord-Logger (nur Stripe-IDs).
- **Monatsexport für die Buchhaltung:** folgt mit Task T061.
- **Formale Zuwendungs-/Sammelbestätigung auf Anfrage:** folgt mit Task T060.
- **DonorBox:** nutzt dasselbe Stripe-Konto. Alle App-Objekte tragen
  `metadata.source = democracy-app`; alles andere ignoriert der Webhook.
