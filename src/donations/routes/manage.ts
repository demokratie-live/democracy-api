import type { Request, RequestHandler } from 'express';
import type Stripe from 'stripe';
import type { DonationConfig } from '../config';
import { hashDonorKey } from '../donorKey';
import { DonationError } from '../errors';
import { chargedAmountCents } from '../fees';
import { idOf, paymentMethodLabel } from '../handlers/shared';
import { donationLog } from '../log';
import type { DonationSubscriber, SubscriberStore } from '../models/DonationSubscriber';
import { stripeErrorCode, toDonationError } from '../stripeHelpers';
import { validateAmountCents, validateIdempotencyKey } from '../validation';

/**
 * Dauerspende verwalten (contracts/donations-api.md, T048–T051): `GET/PATCH/DELETE /monthly` und
 * `POST /monthly/portal-session`. Zugriff nur mit Spender-Schlüssel; der Kill-Switch
 * (`DONATIONS_ENABLED=false`) sperrt diese Endpunkte bewusst nicht – Kündigen muss immer gehen.
 */

/** Rücksprung aus dem Kundenportal in die App (In-App-Browser fängt die URL ab). */
const PORTAL_RETURN_URL = 'democracy://donate/manage';

type PublicStatus = 'incomplete' | 'active' | 'past_due' | 'canceled' | 'incomplete_expired';
const STATUS: Record<Stripe.Subscription.Status, PublicStatus> = {
  incomplete: 'incomplete',
  incomplete_expired: 'incomplete_expired',
  active: 'active',
  trialing: 'active',
  past_due: 'past_due',
  unpaid: 'past_due',
  paused: 'past_due',
  canceled: 'canceled',
};
const PAYMENT_TROUBLE = new Set<Stripe.Subscription.Status>(['incomplete', 'past_due', 'unpaid']);
const CANCEL_IMMEDIATELY = new Set<Stripe.Subscription.Status>(['incomplete', 'past_due', 'unpaid', 'paused']);
const EXPAND = ['default_payment_method', 'latest_invoice'];

/** Fehlermeldungen der Bank/Karte auf Deutsch – Stripes englische Texte geben wir nicht weiter. */
const paymentErrorMessage = (error: Stripe.PaymentIntent.LastPaymentError): string => {
  const code = error.decline_code ?? error.code;
  switch (code) {
    case 'expired_card':
      return 'Die Karte ist abgelaufen.';
    case 'insufficient_funds':
      return 'Das Konto war nicht ausreichend gedeckt.';
    case 'card_declined':
    case 'generic_decline':
    case 'do_not_honor':
      return 'Die Karte wurde abgelehnt.';
    default:
      return error.payment_method?.type === 'sepa_debit'
        ? 'Die Lastschrift ist fehlgeschlagen.'
        : 'Die Abbuchung ist fehlgeschlagen.';
  }
};

interface Deps {
  config: DonationConfig;
  stripe: Stripe;
  subscribers: SubscriberStore;
}

export const createManageRoutes = ({ config, stripe, subscribers }: Deps) => {
  const findSubscriber = async (req: Request): Promise<DonationSubscriber> => {
    const subscriber = await subscribers.findByKeyHash(hashDonorKey(req.get('Authorization')));
    if (!subscriber?.stripeSubscriptionId) throw new DonationError('not_found');
    return subscriber;
  };

  const retrieve = async (subscriptionId: string): Promise<Stripe.Subscription> => {
    try {
      return await stripe.subscriptions.retrieve(subscriptionId, { expand: EXPAND });
    } catch (error) {
      if ((error as { code?: string })?.code === 'resource_missing') throw new DonationError('not_found');
      throw error;
    }
  };

  const lastPaymentError = async (subscription: Stripe.Subscription) => {
    const invoice = subscription.latest_invoice as Stripe.Invoice | null;
    if (!PAYMENT_TROUBLE.has(subscription.status) || !invoice?.id || invoice.status !== 'open') return null;
    const payments = await stripe.invoicePayments.list({
      invoice: invoice.id,
      limit: 1,
      expand: ['data.payment.payment_intent'],
    });
    const intent = payments.data[0]?.payment?.payment_intent;
    const error = typeof intent === 'object' ? intent?.last_payment_error : null;
    if (!error) return null;
    return { message: paymentErrorMessage(error), at: new Date(invoice.created * 1000).toISOString() };
  };

  const toStatus = async (subscription: Stripe.Subscription) => {
    const item = subscription.items.data[0];
    const amountCents = item?.price?.unit_amount ?? 0;
    const invoice = subscription.latest_invoice as Stripe.Invoice | null;
    const method = subscription.default_payment_method as Stripe.PaymentMethod | null;
    const endsAt = subscription.cancel_at ?? item?.current_period_end ?? null;
    return {
      status: STATUS[subscription.status],
      cancelAtPeriodEnd: subscription.cancel_at_period_end || subscription.cancel_at !== null,
      amountCents,
      baseAmountCents: Number(subscription.metadata?.base_amount) || amountCents,
      coverFees: subscription.metadata?.cover_fees === 'true',
      currentPeriodEnd: endsAt ? new Date(endsAt * 1000).toISOString() : null,
      paymentMethod: method ? { type: method.type, label: paymentMethodLabel(method) } : null,
      // SEPA: Die Subscription ist sofort aktiv, die erste Rechnung bleibt offen, bis die Lastschrift durch ist.
      firstPaymentPending:
        subscription.status === 'active' &&
        invoice?.billing_reason === 'subscription_create' &&
        invoice.status === 'open',
      lastPaymentError: await lastPaymentError(subscription),
    };
  };

  /** Fehlerbehandlung wie bei POST /monthly: DonationError durchreichen, Stripe-Fehler übersetzen. */
  const handle =
    (name: string, action: (req: Request) => Promise<unknown>): RequestHandler =>
    async (req, res, next) => {
      try {
        res.json(await action(req));
      } catch (error) {
        if (!(error instanceof DonationError)) {
          donationLog.warn(`Dauerspende verwalten fehlgeschlagen (${name})`, { code: stripeErrorCode(error) });
        }
        next(toDonationError(error));
      }
    };

  const get = handle('get', async (req) => {
    const subscriber = await findSubscriber(req);
    return toStatus(await retrieve(subscriber.stripeSubscriptionId as string));
  });

  const update = handle('update', async (req) => {
    const idempotencyKey = validateIdempotencyKey(req.get('Idempotency-Key'));
    const body = req.body as Record<string, unknown> | undefined;
    if (typeof body !== 'object' || body === null || typeof body.coverFees !== 'boolean') {
      throw new DonationError('invalid_request');
    }
    const amountCents = validateAmountCents(body.amountCents, config);
    const coverFees = body.coverFees;

    const subscriber = await findSubscriber(req);
    const subscription = await retrieve(subscriber.stripeSubscriptionId as string);
    if (subscription.status !== 'active' || subscription.cancel_at_period_end || subscription.cancel_at) {
      throw new DonationError('not_active');
    }
    const item = subscription.items.data[0];
    const amount = chargedAmountCents(amountCents, { coverFees, interval: 'monthly' }, config.fees);
    if (item.price.unit_amount === amount && subscription.metadata?.base_amount === String(amountCents)) {
      return toStatus(subscription);
    }

    const updated = await stripe.subscriptions.update(
      subscription.id,
      {
        items: [
          {
            id: item.id,
            price_data: {
              currency: 'eur',
              product: idOf(item.price.product as string | { id: string }) as string,
              unit_amount: amount,
              recurring: { interval: 'month' },
            },
          },
        ],
        // Neuer Betrag gilt ab der nächsten Abbuchung, keine anteilige Verrechnung.
        proration_behavior: 'none',
        metadata: { base_amount: String(amountCents), cover_fees: String(coverFees) },
        expand: EXPAND,
      },
      { idempotencyKey: `${idempotencyKey}:update` },
    );
    donationLog.info('Betrag der Dauerspende geändert', { stripeId: subscription.id });
    return toStatus(updated);
  });

  const cancel = handle('cancel', async (req) => {
    const subscriber = await findSubscriber(req);
    const subscription = await retrieve(subscriber.stripeSubscriptionId as string);

    if (subscription.status === 'active' && !subscription.cancel_at_period_end && !subscription.cancel_at) {
      // Zum Ende des bezahlten Monats; eine laufende erste Lastschrift wird regulär eingezogen.
      const updated = await stripe.subscriptions.update(subscription.id, {
        cancel_at_period_end: true,
        expand: EXPAND,
      });
      donationLog.info('Dauerspende zum Periodenende gekündigt', { stripeId: subscription.id });
      return toStatus(updated);
    }
    if (CANCEL_IMMEDIATELY.has(subscription.status)) {
      const canceled = await stripe.subscriptions.cancel(subscription.id, { expand: EXPAND });
      donationLog.info('Dauerspende sofort beendet', { stripeId: subscription.id });
      return toStatus(canceled);
    }
    // Bereits gekündigt oder beendet: idempotent den aktuellen Stand liefern.
    return toStatus(subscription);
  });

  const portalSession = handle('portal', async (req) => {
    const subscriber = await findSubscriber(req);
    const session = await stripe.billingPortal.sessions.create({
      customer: subscriber.stripeCustomerId,
      configuration: config.stripe.portalConfigurationId ?? undefined,
      return_url: PORTAL_RETURN_URL,
      locale: 'de',
    });
    return { url: session.url };
  });

  return { get, update, cancel, portalSession };
};
