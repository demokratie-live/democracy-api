import type { RequestHandler } from 'express';
import type { DonationConfig } from '../config';

/**
 * `GET /donations/v1/config` (contracts/donations-api.md). Enthält nur öffentliche Werte –
 * nie den Secret Key oder das Webhook-Secret.
 */
const publicDonationConfig = (config: DonationConfig) => ({
  enabled: config.enabled,
  publishableKey: config.enabled ? config.stripe.publishableKey : null,
  merchantDisplayName: config.merchantDisplayName,
  merchantCountryCode: config.merchantCountryCode,
  defaultInterval: config.defaultInterval,
  minAmountCents: config.minAmountCents,
  maxAmountCents: config.maxAmountCents,
  presets: config.presets,
  fees: config.fees,
  portalLoginUrl: config.stripe.portalLoginUrl,
  bankTransfer: config.bankTransfer,
  legal: config.legal,
});

export const configRoute =
  (config: DonationConfig): RequestHandler =>
  (_req, res) => {
    res.set('Cache-Control', 'public, max-age=300');
    res.json(publicDonationConfig(config));
  };
