import type { DonationConfig, DonationInterval } from './config';
import { DonationError } from './errors';

/**
 * Request-Validierung (T013). Alle Funktionen werfen `DonationError` mit passendem Code;
 * Eingaben werden nie geloggt.
 */

export type Platform = 'ios' | 'android';

export interface DonationRequest {
  amountCents: number;
  coverFees: boolean;
  email: string | null;
  paymentMethodId: string;
  platform: Platform;
  appVersion: string | null;
  /** Betrag, den die App angezeigt hat (inkl. Aufschlag); weicht er ab → 409 amount_changed. */
  expectedChargedAmountCents: number | null;
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Bewusst pragmatisch: eine Adresse, ein @, Domain mit Punkt, keine Leerzeichen. Max. 254 Zeichen (RFC 5321).
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PAYMENT_METHOD_ID = /^pm_[A-Za-z0-9]+$/;
const APP_VERSION = /^\d+\.\d+\.\d+$/;

export const validateAmountCents = (value: unknown, config: DonationConfig): number => {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new DonationError('amount_out_of_range');
  }
  if (value < config.minAmountCents || value > config.maxAmountCents) {
    throw new DonationError('amount_out_of_range');
  }
  return value;
};

export const normalizeEmail = (value: unknown): string | null => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new DonationError('invalid_email');
  const email = value.trim();
  if (email.length > 254 || !EMAIL.test(email)) throw new DonationError('invalid_email');
  return email;
};

export const validatePlatform = (value: unknown): Platform => {
  if (value === 'ios' || value === 'android') return value;
  throw new DonationError('invalid_platform');
};

export const validatePaymentMethodId = (value: unknown): string => {
  if (typeof value === 'string' && value.length <= 255 && PAYMENT_METHOD_ID.test(value)) return value;
  throw new DonationError('invalid_payment_method');
};

export const validateIdempotencyKey = (value: unknown): string => {
  if (typeof value === 'string' && UUID_V4.test(value)) return value.toLowerCase();
  throw new DonationError('invalid_idempotency_key');
};

const normalizeAppVersion = (value: unknown): string | null =>
  typeof value === 'string' && APP_VERSION.test(value) ? value : null;

/** Optional: von der App angezeigter Gesamtbetrag in Cent (ganzzahlig). */
const validateExpectedAmount = (value: unknown): number | null => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new DonationError('invalid_request');
  }
  return value;
};

/** Validiert den Body von `POST /one-time` bzw. `POST /monthly` (contracts/donations-api.md). */
export const validateDonationRequest = (
  body: unknown,
  interval: DonationInterval,
  config: DonationConfig,
): DonationRequest => {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new DonationError('invalid_request');
  }
  const input = body as Record<string, unknown>;
  if (input.coverFees !== undefined && typeof input.coverFees !== 'boolean') {
    throw new DonationError('invalid_request');
  }
  const email = normalizeEmail(input.email);
  if (interval === 'monthly' && email === null) {
    throw new DonationError('email_required');
  }
  return {
    amountCents: validateAmountCents(input.amountCents, config),
    coverFees: input.coverFees === true,
    email,
    paymentMethodId: validatePaymentMethodId(input.paymentMethodId),
    platform: validatePlatform(input.platform),
    appVersion: normalizeAppVersion(input.appVersion),
    expectedChargedAmountCents: validateExpectedAmount(input.expectedChargedAmountCents),
  };
};
