import type Stripe from 'stripe';
import { DONATION_SOURCE } from './constants';
import { DonationError } from './errors';

/**
 * Sucht die Spender:in per E-Mail unter den von der App angelegten Stripe-Customers oder legt sie an
 * (data-model.md §2). Customers anderer Herkunft (z. B. DonorBox) werden nie wiederverwendet.
 */
export const findOrCreateDonor = async (stripe: Stripe, email: string, idempotencyKey: string): Promise<string> => {
  const existing = await stripe.customers.list({ email, limit: 10 });
  const own = existing.data.find((customer) => customer.metadata?.source === DONATION_SOURCE);
  if (own) return own.id;

  const created = await stripe.customers.create(
    { email, preferred_locales: ['de'], metadata: { source: DONATION_SOURCE } },
    { idempotencyKey: `${idempotencyKey}:customer` },
  );
  return created.id;
};

type StripeLikeError = { type?: string; code?: string; param?: string };

const PAYMENT_METHOD_REJECTED = new Set([
  'payment_intent_incompatible_payment_method',
  'payment_method_not_available',
  'payment_method_unactivated',
  'payment_method_unsupported_type',
]);

/** Übersetzt Stripe-Fehler in das Fehlerformat der Donations-API (contracts/donations-api.md). */
export const toDonationError = (error: unknown): DonationError => {
  if (error instanceof DonationError) return error;
  const { type, code, param } = (error ?? {}) as StripeLikeError;
  if (type === 'StripeIdempotencyError') return new DonationError('idempotency_conflict');
  if (type === 'StripeInvalidRequestError') {
    if (code === 'resource_missing' && param === 'payment_method') return new DonationError('invalid_payment_method');
    if (param === 'payment_method' || (code && PAYMENT_METHOD_REJECTED.has(code))) {
      return new DonationError('payment_method_not_allowed');
    }
  }
  return new DonationError('stripe_error');
};

/** Stripe-Fehlercode für Logs (nie Nachrichten mit personenbezogenen Daten). */
export const stripeErrorCode = (error: unknown): string => {
  const { type, code } = (error ?? {}) as StripeLikeError;
  return code ?? type ?? 'unknown';
};
