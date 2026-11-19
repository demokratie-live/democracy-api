import type { RequestHandler } from 'express';
import type Stripe from 'stripe';
import type { DonationConfig } from '../config';
import { DONATION_SOURCE } from '../constants';
import { hashDonorKey } from '../donorKey';
import { DonationError } from '../errors';
import { chargedAmountCents } from '../fees';
import { donationLog } from '../log';
import type { SubscriberStore } from '../models/DonationSubscriber';
import { stripeErrorCode, toDonationError } from '../stripeHelpers';
import { validateDonationRequest, validateIdempotencyKey } from '../validation';

/**
 * `POST /donations/v1/monthly` (contracts/donations-api.md, data-model.md §5):
 * legt eine Stripe-Billing-Subscription mit Inline-Preis an und gibt das clientSecret der ersten
 * Rechnung zurück; die App bestätigt sie im PaymentSheet (Deferred Intent, setupFutureUsage OffSession).
 *
 * `paymentMethodId` wird validiert, aber nicht an Stripe übergeben: Die erste Rechnung bestätigt das
 * PaymentSheet selbst mit der gewählten Zahlungsart (Stripe-Muster „deferred intent + subscription");
 * `save_default_payment_method` macht sie danach zur Standard-Zahlungsart der Dauerspende.
 *
 * Duplikatsperre: aktive/überfällige Dauerspende des Schlüssels → 409 (außer sie ist schon zum
 * Periodenende gekündigt). Eine noch unbezahlte (`incomplete`) Subscription – z. B. erste Karte
 * abgelehnt – wird gekündigt und ersetzt, außer es ist die Wiederholung desselben Requests.
 *
 * Customer: einer je Spender-Schlüssel. Nie per E-Mail einen bestehenden Customer übernehmen – die
 * E-Mail ist unbestätigt, und der Schlüssel öffnet das Kundenportal dieses Customers.
 */

const BLOCKING_STATUSES = new Set<Stripe.Subscription.Status>(['active', 'past_due', 'trialing', 'unpaid', 'paused']);

interface Deps {
  config: DonationConfig;
  stripe: Stripe;
  subscribers: SubscriberStore;
}

export const monthlyRoute =
  ({ config, stripe, subscribers }: Deps): RequestHandler =>
  async (req, res, next) => {
    try {
      const keyHash = hashDonorKey(req.get('Authorization'));
      const idempotencyKey = validateIdempotencyKey(req.get('Idempotency-Key'));
      const input = validateDonationRequest(req.body, 'monthly', config);
      const amount = chargedAmountCents(
        input.amountCents,
        { coverFees: input.coverFees, interval: 'monthly' },
        config.fees,
      );
      const productId = config.stripe.donationProductId;
      if (!productId) throw new DonationError('donations_disabled');

      try {
        const existing = await subscribers.findByKeyHash(keyHash);
        if (existing?.stripeSubscriptionId && !existing.endedAt) {
          const current = await stripe.subscriptions.retrieve(existing.stripeSubscriptionId);
          const scheduledToEnd = current.cancel_at_period_end || current.cancel_at !== null;
          if (BLOCKING_STATUSES.has(current.status) && !scheduledToEnd) {
            throw new DonationError('subscription_exists');
          }
          // Wiederholung desselben Requests (Antwort ging verloren): nicht kündigen – Stripe liefert
          // für denselben Idempotency-Key ohnehin dieselbe Subscription zurück.
          if (current.status === 'incomplete' && current.metadata?.request_id !== idempotencyKey) {
            await stripe.subscriptions.cancel(current.id);
            donationLog.info('Unbezahlte Dauerspende ersetzt', { stripeId: current.id });
          }
        }

        const email = input.email as string;
        let subscriber = existing;
        if (subscriber) {
          // Der Schlüssel gehört zu diesem Customer – eine geänderte E-Mail übernehmen.
          await stripe.customers.update(
            subscriber.stripeCustomerId,
            { email },
            { idempotencyKey: `${idempotencyKey}:customer-email` },
          );
        } else {
          const created = await stripe.customers.create(
            { email, preferred_locales: ['de'], metadata: { source: DONATION_SOURCE, kind: 'monthly' } },
            { idempotencyKey: `${idempotencyKey}:customer` },
          );
          subscriber = await subscribers.insert(keyHash, created.id);
        }
        const customer = subscriber.stripeCustomerId;

        const subscription = await stripe.subscriptions.create(
          {
            customer,
            items: [
              {
                price_data: {
                  currency: 'eur',
                  product: productId,
                  unit_amount: amount,
                  recurring: { interval: 'month' },
                },
              },
            ],
            payment_behavior: 'default_incomplete',
            payment_settings: { save_default_payment_method: 'on_subscription' },
            description: `Monatliche Spende an ${config.receipt.organization}`,
            metadata: {
              source: DONATION_SOURCE,
              interval: 'monthly',
              base_amount: String(input.amountCents),
              cover_fees: String(input.coverFees),
              platform: input.platform,
              app_version: input.appVersion ?? '',
              subscriber_id: subscriber.id,
              request_id: idempotencyKey,
            },
            expand: ['latest_invoice.confirmation_secret'],
          },
          { idempotencyKey: `${idempotencyKey}:subscription` },
        );
        const linked = await subscribers.linkSubscription(
          subscriber.id,
          subscription.id,
          existing?.stripeSubscriptionId ?? null,
        );
        if (!linked) {
          // Ein paralleler Request hat dem Schlüssel inzwischen eine andere Dauerspende zugeordnet –
          // diese hier darf nicht verwaist weiterlaufen.
          await stripe.subscriptions.cancel(subscription.id).catch(() => undefined);
          donationLog.warn('Paralleler Request: Dauerspende verworfen', { stripeId: subscription.id });
          throw new DonationError('idempotency_conflict');
        }

        const invoice = subscription.latest_invoice as Stripe.Invoice | null;
        const clientSecret = invoice?.confirmation_secret?.client_secret;
        if (!clientSecret) {
          donationLog.error('Dauerspende ohne confirmation_secret', { stripeId: subscription.id });
          throw new DonationError('stripe_error');
        }
        donationLog.info('Dauerspende angelegt', { stripeId: subscription.id });
        res.json({
          clientSecret,
          subscriptionId: subscription.id,
          chargedAmountCents: amount,
          currentPeriodEnd: subscription.items.data[0]?.current_period_end
            ? new Date(subscription.items.data[0].current_period_end * 1000).toISOString()
            : null,
        });
      } catch (error) {
        if (error instanceof DonationError) throw error;
        donationLog.warn('Dauerspende konnte nicht angelegt werden', { code: stripeErrorCode(error) });
        throw toDonationError(error);
      }
    } catch (error) {
      next(error);
    }
  };
