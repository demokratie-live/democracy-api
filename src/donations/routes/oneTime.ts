import type { RequestHandler } from 'express';
import type Stripe from 'stripe';
import type { DonationConfig } from '../config';
import { DONATION_SOURCE } from '../constants';
import { DonationError } from '../errors';
import { chargedAmountCents } from '../fees';
import { donationLog } from '../log';
import { findOrCreateDonor, stripeErrorCode, toDonationError } from '../stripeHelpers';
import { validateDonationRequest, validateIdempotencyKey } from '../validation';

/**
 * `POST /donations/v1/one-time` (contracts/donations-api.md, Deferred-Intent-Verfahren):
 * Die App hat im PaymentSheet bereits eine PaymentMethod erzeugt; der Server legt den PaymentIntent
 * mit dem verbindlich berechneten Betrag an, die App bestätigt ihn anschließend mit dem clientSecret.
 */
export const oneTimeRoute =
  ({ config, stripe }: { config: DonationConfig; stripe: Stripe }): RequestHandler =>
  async (req, res, next) => {
    try {
      const idempotencyKey = validateIdempotencyKey(req.get('Idempotency-Key'));
      const input = validateDonationRequest(req.body, 'one_time', config);
      const amount = chargedAmountCents(
        input.amountCents,
        { coverFees: input.coverFees, interval: 'one_time' },
        config.fees,
      );

      let intent: Stripe.PaymentIntent;
      try {
        const customer = input.email ? await findOrCreateDonor(stripe, input.email, idempotencyKey) : undefined;
        intent = await stripe.paymentIntents.create(
          {
            amount,
            currency: 'eur',
            customer,
            payment_method: input.paymentMethodId,
            payment_method_configuration: config.stripe.paymentMethodConfigurationId ?? undefined,
            automatic_payment_methods: { enabled: true },
            // Muss zur `captureMethod` der App passen (das PaymentSheet prüft das vor dem Bestätigen).
            // Bewusst „automatic": stripe-react-native 0.38.6 (iOS) kann „automatic_async" – den
            // API-Standard seit 2024 – nicht einlesen und bricht sonst ab (research.md R12).
            capture_method: 'automatic',
            description: `Spende an ${config.receipt.organization}`,
            statement_descriptor_suffix: 'SPENDE',
            metadata: {
              source: DONATION_SOURCE,
              interval: 'one_time',
              base_amount: String(input.amountCents),
              cover_fees: String(input.coverFees),
              platform: input.platform,
              app_version: input.appVersion ?? '',
            },
          },
          { idempotencyKey: `${idempotencyKey}:payment_intent` },
        );
      } catch (error) {
        const failure = toDonationError(error);
        donationLog.warn('Einzelspende konnte nicht angelegt werden', { code: stripeErrorCode(error) });
        throw failure;
      }

      if (!intent.client_secret) {
        donationLog.error('PaymentIntent ohne client_secret', { stripeId: intent.id });
        throw new DonationError('stripe_error');
      }
      donationLog.info('Einzelspende angelegt', { stripeId: intent.id });
      res.json({ clientSecret: intent.client_secret, paymentIntentId: intent.id, chargedAmountCents: amount });
    } catch (error) {
      next(error);
    }
  };
