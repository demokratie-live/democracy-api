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
    'Diese E-Mail wurde automatisch versendet, weil bei deiner Spende diese Adresse angegeben wurde.',
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
    'Für Spenden bis 300 € genügt dem Finanzamt dein Zahlungsnachweis (z. B. Kontoauszug, Kreditkarten-',
    'oder PayPal-Abrechnung) zusammen mit dieser Bestätigung und unserem vereinfachten Zuwendungsnachweis:',
    config.legal.simplifiedReceiptUrl,
    '',
    'Du brauchst eine Zuwendungsbestätigung, etwa für Spenden über 300 € oder als Sammelbestätigung für',
    'das ganze Jahr? Antworte einfach auf diese E-Mail und nenne uns deinen vollständigen Namen und deine',
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
    'vielen Dank für deine Spende! Damit hilfst du, DEMOCRACY unabhängig, überparteilich und werbefrei',
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

  return { to, subject: 'Danke für deine Spende an DEMOCRACY', text };
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
    `leider konnte deine Lastschrift über ${formatEuro(chargedAmountCents)} vom ${formatDate(createdAt)}`,
    'nicht eingezogen werden – zum Beispiel wegen fehlender Kontodeckung oder einer abgelehnten Lastschrift.',
    'Der Betrag wurde nicht abgebucht bzw. wieder zurückgebucht.',
    '',
    'Wenn du es noch einmal versuchen möchtest, kannst du jederzeit in der DEMOCRACY-App spenden oder',
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
