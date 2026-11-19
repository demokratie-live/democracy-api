import Stripe from 'stripe';

/**
 * Fest gepinnte Stripe-API-Version (research.md R3: mindestens „basil" wegen
 * `latest_invoice.confirmation_secret`). Ein Update ist eine bewusste Änderung mit Tests.
 */
export const STRIPE_API_VERSION = '2026-10-28.endive' as const;

export const createStripeClient = (secretKey: string): Stripe =>
  new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION,
    maxNetworkRetries: 2,
    timeout: 20_000,
    telemetry: false,
    appInfo: { name: 'democracy-api-donations', url: 'https://github.com/demokratie-live/democracy-api' },
  });
