/**
 * Konfiguration des Spendenmoduls (specs/001-in-app-donations, data-model.md §3).
 *
 * Alle Werte kommen aus Umgebungsvariablen (ConfigMap/Secret). `loadDonationConfig` ist eine reine
 * Funktion, damit sie ohne Prozess-Umgebung testbar ist. Ist das Modul aktiviert und fehlen
 * Pflichtwerte, wird beim Start ein Fehler geworfen (fail fast).
 */

export type DonationInterval = 'one_time' | 'monthly';
/** Stripe-Mindestbetrag für EUR-Zahlungen in Cent. */
const STRIPE_MIN_CHARGE_CENTS = 50;

export interface DonationFeeConfig {
  /** Prozentsatz der Standard-EWR-Kartengebühr, z. B. 1.5 */
  cardPct: number;
  cardFixedCents: number;
  sepaFixedCents: number;
  /** Stripe-Billing-Aufschlag auf wiederkehrende Zahlungen in Prozent, z. B. 0.7 */
  billingPct: number;
}

export interface DonationConfig {
  enabled: boolean;
  stripe: {
    secretKey: string | null;
    publishableKey: string | null;
    webhookSecret: string | null;
    donationProductId: string | null;
    /**
     * Stripe-Zahlungsprofil (pmc_…), das die Zahlungsarten steuert. Wird bei Einzelspenden übergeben.
     * Abos (Dauerspenden) und das App-SDK nutzen technisch bedingt das Standardprofil des Kontos –
     * dieses Profil muss daher das Standardprofil sein (docs/DONATIONS.md).
     */
    paymentMethodConfigurationId: string | null;
    portalLoginUrl: string | null;
    /** Eigene Kundenportal-Konfiguration (bpc_…) für Sessions aus der App (Phase 5). */
    portalConfigurationId: string | null;
  };
  merchantDisplayName: string;
  merchantCountryCode: 'DE';
  defaultInterval: DonationInterval;
  minAmountCents: number;
  maxAmountCents: number;
  presets: Record<DonationInterval, number[]>;
  fees: DonationFeeConfig;
  bankTransfer: { holder: string; iban: string; bic: string };
  legal: { privacyUrl: string; nonprofitProofUrl: string; simplifiedReceiptUrl: string };
  mail: { smtpUrl: string | null; from: string; replyTo: string | null };
  /**
   * Angaben für die Spendenbestätigung (FR-018, vereinfachter Zuwendungsnachweis).
   * `exemption` (Finanzamt, Datum, Steuernummer des Freistellungsbescheids) wird bewusst nicht
   * vorbelegt – ohne Wert verweist die Mail auf den Nachweis der Gemeinnützigkeit (research.md O2).
   */
  receipt: { organization: string; purpose: string; exemption: string | null };
}

export class DonationConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Ungültige Spenden-Konfiguration: ${problems.join('; ')}`);
    this.name = 'DonationConfigError';
  }
}

type Env = Record<string, string | undefined>;

const nonEmpty = (value: string | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const parseInteger = (env: Env, key: string, fallback: number, problems: string[]): number => {
  const raw = nonEmpty(env[key]);
  if (raw === null) return fallback;
  if (!/^\d+$/.test(raw)) {
    problems.push(`${key} muss eine ganze Zahl sein`);
    return fallback;
  }
  return Number(raw);
};

const parseNumber = (env: Env, key: string, fallback: number, problems: string[]): number => {
  const raw = nonEmpty(env[key]);
  if (raw === null) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    problems.push(`${key} muss eine nicht-negative Zahl sein`);
    return fallback;
  }
  return value;
};

const parseIntegerList = (env: Env, key: string, fallback: number[], problems: string[]): number[] => {
  const raw = nonEmpty(env[key]);
  if (raw === null) return fallback;
  const parts = raw.split(',').map((part) => part.trim());
  if (parts.some((part) => !/^\d+$/.test(part))) {
    problems.push(`${key} muss eine kommagetrennte Liste ganzer Zahlen (Cent) sein`);
    return fallback;
  }
  return parts.map(Number);
};

const keyMode = (key: string | null): 'test' | 'live' | null => {
  if (!key) return null;
  if (/^(sk|rk|pk)_test_/.test(key)) return 'test';
  if (/^(sk|rk|pk)_live_/.test(key)) return 'live';
  return null;
};

export const loadDonationConfig = (env: Env = process.env): DonationConfig => {
  const problems: string[] = [];

  const enabled = env.DONATIONS_ENABLED === 'true';
  const defaultIntervalRaw = nonEmpty(env.DONATION_DEFAULT_INTERVAL) ?? 'monthly';
  if (defaultIntervalRaw !== 'monthly' && defaultIntervalRaw !== 'one_time') {
    problems.push('DONATION_DEFAULT_INTERVAL muss "monthly" oder "one_time" sein');
  }

  const config: DonationConfig = {
    enabled,
    stripe: {
      secretKey: nonEmpty(env.STRIPE_SECRET_KEY),
      publishableKey: nonEmpty(env.STRIPE_PUBLISHABLE_KEY),
      webhookSecret: nonEmpty(env.STRIPE_WEBHOOK_SECRET),
      donationProductId: nonEmpty(env.STRIPE_DONATION_PRODUCT_ID),
      paymentMethodConfigurationId: nonEmpty(env.STRIPE_PAYMENT_METHOD_CONFIGURATION_ID),
      portalLoginUrl: nonEmpty(env.STRIPE_PORTAL_LOGIN_URL),
      portalConfigurationId: nonEmpty(env.STRIPE_PORTAL_CONFIGURATION_ID),
    },
    merchantDisplayName: nonEmpty(env.DONATION_MERCHANT_DISPLAY_NAME) ?? 'DEMOCRACY Deutschland e.V.',
    merchantCountryCode: 'DE',
    defaultInterval: defaultIntervalRaw === 'one_time' ? 'one_time' : 'monthly',
    minAmountCents: parseInteger(env, 'DONATION_MIN_CENTS', 500, problems),
    maxAmountCents: parseInteger(env, 'DONATION_MAX_CENTS', 100000, problems),
    presets: {
      one_time: parseIntegerList(env, 'DONATION_PRESETS_ONE_TIME', [1000, 2500, 5000, 10000, 25000], problems),
      monthly: parseIntegerList(env, 'DONATION_PRESETS_MONTHLY', [500, 1000, 1500, 2500, 5000], problems),
    },
    fees: {
      cardPct: parseNumber(env, 'DONATION_FEE_CARD_PCT', 1.5, problems),
      cardFixedCents: parseInteger(env, 'DONATION_FEE_CARD_FIXED_CENTS', 25, problems),
      sepaFixedCents: parseInteger(env, 'DONATION_FEE_SEPA_FIXED_CENTS', 35, problems),
      billingPct: parseNumber(env, 'DONATION_FEE_BILLING_PCT', 0.7, problems),
    },
    bankTransfer: {
      holder: nonEmpty(env.DONATION_BANK_HOLDER) ?? 'DEMOCRACY Deutschland e.V.',
      iban: nonEmpty(env.DONATION_BANK_IBAN) ?? 'DE83 2605 0001 0056 1290 91',
      bic: nonEmpty(env.DONATION_BANK_BIC) ?? 'NOLADE21GOE',
    },
    legal: {
      privacyUrl: nonEmpty(env.DONATION_PRIVACY_URL) ?? 'https://www.democracy-deutschland.de/datenschutz',
      nonprofitProofUrl:
        nonEmpty(env.DONATION_NONPROFIT_PROOF_URL) ??
        'https://www.democracy-deutschland.de/files/download/Gemeinnutzigkeit_DEMOCRACY.pdf',
      simplifiedReceiptUrl:
        nonEmpty(env.DONATION_SIMPLIFIED_RECEIPT_URL) ??
        'https://www.democracy-deutschland.de/files/download/Vereinfachter_Zuwendungsnachweis.pdf',
    },
    receipt: {
      organization: nonEmpty(env.DONATION_RECEIPT_ORGANIZATION) ?? 'DEMOCRACY Deutschland e.V.',
      purpose:
        nonEmpty(env.DONATION_RECEIPT_PURPOSE) ??
        'Förderung des demokratischen Staatswesens sowie der Volks- und Berufsbildung',
      exemption: nonEmpty(env.DONATION_RECEIPT_EXEMPTION),
    },
    mail: {
      smtpUrl: nonEmpty(env.SMTP_URL),
      from: nonEmpty(env.DONATION_MAIL_FROM) ?? 'DEMOCRACY Spenden <spenden@democracy-deutschland.de>',
      replyTo: nonEmpty(env.DONATION_MAIL_REPLY_TO),
    },
  };

  // Beträge
  if (config.minAmountCents < STRIPE_MIN_CHARGE_CENTS) {
    problems.push(`DONATION_MIN_CENTS muss mindestens ${STRIPE_MIN_CHARGE_CENTS} sein (Stripe-Minimum)`);
  }
  if (config.maxAmountCents < config.minAmountCents) {
    problems.push('DONATION_MAX_CENTS muss größer oder gleich DONATION_MIN_CENTS sein');
  }
  for (const interval of ['one_time', 'monthly'] as const) {
    const outOfRange = config.presets[interval].filter(
      (cents) => cents < config.minAmountCents || cents > config.maxAmountCents,
    );
    if (outOfRange.length > 0) {
      problems.push(`Betragsvorschläge (${interval}) außerhalb von Mindest-/Höchstbetrag: ${outOfRange.join(', ')}`);
    }
  }
  if (config.fees.cardPct + config.fees.billingPct >= 100) {
    problems.push('Gebührensätze ergeben 100 % oder mehr');
  }

  // Stripe-Schlüssel: nur Pflicht, wenn das Modul aktiv ist.
  if (enabled) {
    const required: [string, string | null][] = [
      ['STRIPE_SECRET_KEY', config.stripe.secretKey],
      ['STRIPE_PUBLISHABLE_KEY', config.stripe.publishableKey],
      ['STRIPE_WEBHOOK_SECRET', config.stripe.webhookSecret],
      ['STRIPE_DONATION_PRODUCT_ID', config.stripe.donationProductId],
      ['STRIPE_PAYMENT_METHOD_CONFIGURATION_ID', config.stripe.paymentMethodConfigurationId],
    ];
    for (const [key, value] of required) {
      if (!value) problems.push(`${key} fehlt, obwohl DONATIONS_ENABLED=true`);
    }
  }
  if (config.stripe.secretKey && !/^(sk|rk)_(test|live)_/.test(config.stripe.secretKey)) {
    problems.push('STRIPE_SECRET_KEY muss mit sk_ oder rk_ (test/live) beginnen');
  }
  if (config.stripe.publishableKey && !/^pk_(test|live)_/.test(config.stripe.publishableKey)) {
    problems.push('STRIPE_PUBLISHABLE_KEY muss mit pk_test_ oder pk_live_ beginnen');
  }
  const secretMode = keyMode(config.stripe.secretKey);
  const publishableMode = keyMode(config.stripe.publishableKey);
  if (secretMode && publishableMode && secretMode !== publishableMode) {
    problems.push('STRIPE_SECRET_KEY und STRIPE_PUBLISHABLE_KEY gehören zu unterschiedlichen Modi (test/live)');
  }
  if (config.stripe.webhookSecret && !config.stripe.webhookSecret.startsWith('whsec_')) {
    problems.push('STRIPE_WEBHOOK_SECRET muss mit whsec_ beginnen');
  }
  if (config.stripe.donationProductId && !config.stripe.donationProductId.startsWith('prod_')) {
    problems.push('STRIPE_DONATION_PRODUCT_ID muss mit prod_ beginnen');
  }
  if (config.stripe.paymentMethodConfigurationId && !config.stripe.paymentMethodConfigurationId.startsWith('pmc_')) {
    problems.push('STRIPE_PAYMENT_METHOD_CONFIGURATION_ID muss mit pmc_ beginnen');
  }
  if (config.stripe.portalConfigurationId && !config.stripe.portalConfigurationId.startsWith('bpc_')) {
    problems.push('STRIPE_PORTAL_CONFIGURATION_ID muss mit bpc_ beginnen');
  }

  if (problems.length > 0) {
    throw new DonationConfigError(problems);
  }
  return config;
};
