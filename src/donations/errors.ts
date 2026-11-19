/**
 * Fehlerformat der Donations-API: `{ error: { code, message } }` (contracts/donations-api.md).
 * `message` ist deutsch und darf in der App angezeigt werden – sie enthält nie personenbezogene Daten.
 */

export type DonationErrorCode =
  | 'invalid_request'
  | 'amount_out_of_range'
  | 'invalid_email'
  | 'email_required'
  | 'invalid_platform'
  | 'invalid_payment_method'
  | 'payment_method_not_allowed'
  | 'invalid_idempotency_key'
  | 'idempotency_conflict'
  | 'invalid_donor_key'
  | 'not_found'
  | 'not_active'
  | 'subscription_exists'
  | 'subscription_pending'
  | 'payment_pending'
  | 'rate_limited'
  | 'donations_disabled'
  | 'invalid_signature'
  | 'stripe_error'
  | 'internal_error';

const MESSAGES: Record<DonationErrorCode, string> = {
  invalid_request: 'Die Anfrage ist ungültig.',
  amount_out_of_range: 'Der Betrag liegt außerhalb des erlaubten Bereichs.',
  invalid_email: 'Bitte gib eine gültige E-Mail-Adresse an.',
  email_required: 'Für eine monatliche Spende brauchen wir deine E-Mail-Adresse.',
  invalid_platform: 'Unbekannte Plattform.',
  invalid_payment_method: 'Die Zahlungsart ist ungültig.',
  payment_method_not_allowed: 'Diese Zahlungsart ist hierfür leider nicht verfügbar.',
  invalid_idempotency_key: 'Die Anfrage ist ungültig (Idempotency-Key).',
  idempotency_conflict: 'Dieser Zahlungsversuch wurde bereits verarbeitet. Bitte versuche es erneut.',
  invalid_donor_key: 'Deine Dauerspende konnte nicht zugeordnet werden.',
  not_found: 'Es wurde keine Dauerspende gefunden.',
  not_active: 'Diese Dauerspende ist nicht aktiv.',
  subscription_exists: 'Du hast bereits eine aktive Dauerspende. Du kannst sie unter „Dauerspende verwalten" ändern.',
  subscription_pending: 'Deine erste Spende wird gerade eingezogen. Bitte versuche es in ein paar Tagen erneut.',
  payment_pending: 'Deine erste Spende wird gerade eingezogen. Danach kannst du die Dauerspende ändern oder kündigen.',
  rate_limited: 'Zu viele Versuche. Bitte warte ein paar Minuten.',
  donations_disabled: 'Spenden in der App sind gerade nicht möglich. Du kannst gerne per Überweisung spenden.',
  invalid_signature: 'Ungültige Signatur.',
  stripe_error: 'Der Zahlungsdienst ist gerade nicht erreichbar. Bitte versuche es später erneut.',
  internal_error: 'Es ist ein Fehler aufgetreten. Bitte versuche es später erneut.',
};

const STATUS: Partial<Record<DonationErrorCode, number>> = {
  invalid_donor_key: 401,
  not_found: 404,
  not_active: 409,
  subscription_exists: 409,
  subscription_pending: 409,
  payment_pending: 409,
  idempotency_conflict: 409,
  rate_limited: 429,
  donations_disabled: 503,
  stripe_error: 502,
  internal_error: 500,
};

export class DonationError extends Error {
  readonly status: number;

  constructor(public readonly code: DonationErrorCode) {
    super(MESSAGES[code]);
    this.name = 'DonationError';
    this.status = STATUS[code] ?? 400;
  }

  toBody() {
    return { error: { code: this.code, message: this.message } };
  }
}
