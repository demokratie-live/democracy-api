import type { DonationConfig } from '../config';
import type { DonationMail } from './mailer';

/**
 * Texte der Spenden-E-Mails (FR-018/FR-019). Endgültige Abnahme durch Vorstand/Steuerberatung: T059.
 * Reiner Text – gut lesbar in jedem Mailprogramm und ohne Tracking-Elemente.
 */

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const longDate = new Intl.DateTimeFormat('de-DE', { dateStyle: 'long', timeZone: 'Europe/Berlin' });

export const formatEuro = (cents: number): string => euro.format(cents / 100);
export const formatDate = (unixSeconds: number): string => longDate.format(new Date(unixSeconds * 1000));

type ReceiptConfig = Pick<DonationConfig, 'receipt' | 'legal' | 'bankTransfer'>;

const footer = (config: ReceiptConfig) =>
  [
    'Herzliche Grüße',
    'Dein DEMOCRACY-Team',
    '',
    '—',
    `${config.receipt.organization} · Datenschutz: ${config.legal.privacyUrl}`,
    'Diese E-Mail wurde automatisch versendet, weil bei Deiner Spende diese Adresse angegeben wurde.',
  ].join('\n');

const taxSection = (config: ReceiptConfig) =>
  [
    'Angaben für das Finanzamt',
    '  Es handelt sich um eine Spende (Zuwendung ohne Gegenleistung), nicht um einen Mitgliedsbeitrag.',
    `  Steuerbegünstigter Zweck: ${config.receipt.purpose}`,
    config.receipt.exemption
      ? `  Freistellung: ${config.receipt.exemption}`
      : `  Freistellung: siehe Nachweis der Gemeinnützigkeit – ${config.legal.nonprofitProofUrl}`,
    '',
    'Für Spenden bis 300 € genügt dem Finanzamt Dein Zahlungsnachweis (z. B. Kontoauszug, Kreditkarten-',
    'oder PayPal-Abrechnung) zusammen mit dieser Bestätigung und unserem vereinfachten Zuwendungsnachweis:',
    config.legal.simplifiedReceiptUrl,
    '',
    'Du brauchst eine Zuwendungsbestätigung, etwa für Spenden über 300 € oder als Sammelbestätigung für',
    'das ganze Jahr? Antworte einfach auf diese E-Mail und nenne uns Deinen vollständigen Namen und Deine',
    'Anschrift.',
  ].join('\n');

interface OneTimeConfirmation {
  to: string;
  chargedAmountCents: number;
  baseAmountCents: number;
  coverFees: boolean;
  paidAt: number;
  paymentMethodLabel: string;
  config: ReceiptConfig;
}

export const oneTimeConfirmationMail = ({
  to,
  chargedAmountCents,
  baseAmountCents,
  coverFees,
  paidAt,
  paymentMethodLabel,
  config,
}: OneTimeConfirmation): DonationMail => {
  const surcharge = chargedAmountCents - baseAmountCents;
  const amountLine =
    coverFees && surcharge > 0
      ? `${formatEuro(chargedAmountCents)} (inklusive ${formatEuro(surcharge)} freiwillig übernommener Zahlungsgebühren)`
      : formatEuro(chargedAmountCents);

  const text = [
    'Hallo,',
    '',
    'vielen Dank für Deine Spende! Damit hilfst Du, DEMOCRACY unabhängig, überparteilich und werbefrei',
    'zu halten.',
    '',
    'Deine Spende',
    `  Betrag:      ${amountLine}`,
    `  Datum:       ${formatDate(paidAt)}`,
    `  Zahlungsart: ${paymentMethodLabel}`,
    `  Empfänger:   ${config.receipt.organization}`,
    '',
    taxSection(config),
    '',
    footer(config),
  ].join('\n');

  return { to, subject: 'Danke für Deine Spende an DEMOCRACY', text };
};

interface SepaFailure {
  to: string;
  chargedAmountCents: number;
  createdAt: number;
  config: ReceiptConfig;
}

export const sepaFailedMail = ({ to, chargedAmountCents, createdAt, config }: SepaFailure): DonationMail => {
  const text = [
    'Hallo,',
    '',
    `leider konnte Deine Lastschrift über ${formatEuro(chargedAmountCents)} vom ${formatDate(createdAt)}`,
    'nicht eingezogen werden – zum Beispiel wegen fehlender Kontodeckung oder einer abgelehnten Lastschrift.',
    'Der Betrag wurde nicht abgebucht bzw. wieder zurückgebucht.',
    '',
    'Wenn Du es noch einmal versuchen möchtest, kannst Du jederzeit in der DEMOCRACY-App spenden oder',
    'per Überweisung:',
    `  Kontoinhaber: ${config.bankTransfer.holder}`,
    `  IBAN:         ${config.bankTransfer.iban}`,
    `  BIC:          ${config.bankTransfer.bic}`,
    '',
    'Bei Fragen antworte einfach auf diese E-Mail.',
    '',
    footer(config),
  ].join('\n');

  return { to, subject: 'Deine Spende an DEMOCRACY konnte nicht eingezogen werden', text };
};

type MonthlyConfig = ReceiptConfig & { portalLoginUrl: string | null };

const manageSection = (portalLoginUrl: string | null) =>
  [
    'Deine Dauerspende verwaltest Du in der DEMOCRACY-App unter „Spenden".',
    portalLoginUrl
      ? `Auf einem anderen Gerät geht das auch hier – mit Anmeldung per E-Mail-Link: ${portalLoginUrl}`
      : null,
    'Kündigen kannst Du jederzeit zum Ende des laufenden Monats.',
  ]
    .filter(Boolean)
    .join('\n');

interface MonthlyConfirmation {
  to: string;
  firstPayment: boolean;
  chargedAmountCents: number;
  baseAmountCents: number;
  coverFees: boolean;
  paidAt: number;
  nextChargeAt: number | null;
  paymentMethodLabel: string;
  config: MonthlyConfig;
}

export const monthlyConfirmationMail = ({
  to,
  firstPayment,
  chargedAmountCents,
  baseAmountCents,
  coverFees,
  paidAt,
  nextChargeAt,
  paymentMethodLabel,
  config,
}: MonthlyConfirmation): DonationMail => {
  const surcharge = chargedAmountCents - baseAmountCents;
  const amountLine =
    coverFees && surcharge > 0
      ? `${formatEuro(chargedAmountCents)} (inklusive ${formatEuro(surcharge)} freiwillig übernommener Zahlungsgebühren)`
      : formatEuro(chargedAmountCents);

  const intro = firstPayment
    ? [
        'vielen Dank, dass Du DEMOCRACY ab jetzt jeden Monat unterstützt! Mit Deiner Patenschaft hilfst Du,',
        'DEMOCRACY unabhängig, überparteilich und werbefrei zu halten.',
      ]
    : ['vielen Dank für Deine monatliche Spende – schön, dass Du dabei bist!'];

  const text = [
    'Hallo,',
    '',
    ...intro,
    '',
    'Deine Spende',
    `  Betrag:      ${amountLine}`,
    `  Rhythmus:    monatlich`,
    `  Datum:       ${formatDate(paidAt)}`,
    nextChargeAt ? `  Nächste Abbuchung: ${formatDate(nextChargeAt)}` : null,
    `  Zahlungsart: ${paymentMethodLabel}`,
    `  Empfänger:   ${config.receipt.organization}`,
    '',
    taxSection(config),
    '',
    manageSection(config.portalLoginUrl),
    '',
    footer(config),
  ]
    .filter((line) => line !== null)
    .join('\n');

  return {
    to,
    subject: firstPayment
      ? 'Willkommen als Pat:in – danke für Deine monatliche Spende'
      : 'Danke für Deine monatliche Spende an DEMOCRACY',
    text,
  };
};

interface MonthlyEnded {
  to: string;
  reason: 'cancellation_requested' | 'payment_failed' | 'other';
  config: ReceiptConfig;
}

export const monthlyEndedMail = ({ to, reason, config }: MonthlyEnded): DonationMail => {
  const why =
    reason === 'payment_failed'
      ? 'Die letzten Abbuchungen sind leider fehlgeschlagen, deshalb haben wir Deine Dauerspende beendet.'
      : 'Deine Dauerspende ist wie gewünscht beendet.';
  const text = [
    'Hallo,',
    '',
    `${why} Es werden keine weiteren Beträge abgebucht.`,
    '',
    'Vielen Dank für Deine bisherige Unterstützung! Wenn Du DEMOCRACY wieder unterstützen möchtest, geht',
    'das jederzeit in der DEMOCRACY-App unter „Spenden" oder per Dauerauftrag:',
    `  Kontoinhaber: ${config.bankTransfer.holder}`,
    `  IBAN:         ${config.bankTransfer.iban}`,
    `  BIC:          ${config.bankTransfer.bic}`,
    '',
    footer(config),
  ].join('\n');
  return { to, subject: 'Deine Dauerspende an DEMOCRACY ist beendet', text };
};
