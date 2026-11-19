import type Stripe from 'stripe';
import type { DonationConfig } from '../config';
import { DONATION_SOURCE } from '../constants';
import { donationLog } from '../log';
import type { Mailer } from '../mail/mailer';
import { monthlyCancellationConfirmedMail, monthlyConfirmationMail, monthlyEndedMail } from '../mail/templates';
import type { SubscriberStore } from '../models/DonationSubscriber';
import type { WebhookHandlers } from '../webhook';
import { customerEmail, idOf, paymentMethodLabel } from './shared';

/**
 * Webhook-Handler für Dauerspenden (contracts/stripe-webhooks.md, T041/T042).
 *
 * - invoice.paid: Bestätigung je Abbuchung; die erste Rechnung (billing_reason subscription_create)
 *   bekommt den Willkommenstext mit Verwaltungslink.
 * - invoice.payment_failed: nur Log – die Mahn-E-Mail mit Link verschickt Stripe Billing selbst.
 * - customer.subscription.deleted / updated → incomplete_expired: Zuordnung als beendet markieren
 *   (Löschung nach 90 Tagen); Mail „beendet" nur, wenn die Dauerspende je bezahlt wurde und die
 *   Kündigung nicht schon vorher bestätigt wurde.
 * - customer.subscription.updated → Kündigung zum Periodenende vorgemerkt (App oder Kundenportal):
 *   Mail „Kündigung bestätigt" mit Enddatum (T052).
 */

interface Deps {
  stripe: Stripe;
  mailer: Mailer;
  config: DonationConfig;
  subscribers: SubscriberStore;
}

const subscriptionMetadata = (invoice: Stripe.Invoice): Record<string, string> =>
  (invoice.parent?.subscription_details?.metadata as Record<string, string> | null | undefined) ?? {};

const subscriptionIdOfInvoice = (invoice: Stripe.Invoice): string | null =>
  idOf(invoice.parent?.subscription_details?.subscription as string | { id: string } | null | undefined);

/** Zum Periodenende vorgemerkt? Dann liegt die Kündigung (canceled_at) vor dem tatsächlichen Ende. */
const wasScheduled = (subscription: Stripe.Subscription): boolean =>
  subscription.cancel_at_period_end ||
  Boolean(subscription.canceled_at && subscription.ended_at && subscription.ended_at - subscription.canceled_at > 60);

const isOwnMonthly = (subscription: Stripe.Subscription): boolean =>
  subscription.metadata?.source === DONATION_SOURCE && subscription.metadata?.interval === 'monthly';

const endReason = (subscription: Stripe.Subscription): 'cancellation_requested' | 'payment_failed' | 'other' => {
  const reason = subscription.cancellation_details?.reason;
  if (reason === 'cancellation_requested') return 'cancellation_requested';
  if (reason === 'payment_failed') return 'payment_failed';
  return 'other';
};

export const createMonthlyHandlers = ({ stripe, mailer, config, subscribers }: Deps): WebhookHandlers => {
  const endSubscription = async (subscription: Stripe.Subscription, sendMail: boolean) => {
    if (!isOwnMonthly(subscription)) return;
    const marked = await subscribers.markEnded(subscription.id, new Date());
    if (!sendMail) return;
    // Vorgemerkte Kündigung: Die Bestätigung mit Enddatum ging schon raus.
    if (wasScheduled(subscription)) return;

    // Nur informieren, wenn tatsächlich gespendet wurde (nicht bei ersetzten/abgebrochenen Erstzahlungen).
    const paid = await stripe.invoices.list({ subscription: subscription.id, status: 'paid', limit: 1 });
    if (paid.data.length === 0) return;
    const to = await customerEmail(stripe, idOf(subscription.customer));
    if (!to) return;
    await mailer.send(monthlyEndedMail({ to, reason: endReason(subscription), config }));
    donationLog.info('Dauerspende beendet, Mail versendet', { stripeId: subscription.id, code: String(marked) });
  };

  return {
    'invoice.paid': async (event) => {
      const invoice = event.data.object as Stripe.Invoice;
      const metadata = subscriptionMetadata(invoice);
      if (metadata.interval !== 'monthly') return;
      const subscriptionId = subscriptionIdOfInvoice(invoice);
      if (!subscriptionId) return;

      const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ['default_payment_method'],
      });
      const to = invoice.customer_email ?? (await customerEmail(stripe, idOf(invoice.customer)));
      if (!to) {
        donationLog.warn('Dauerspende ohne E-Mail-Adresse – keine Bestätigung', { stripeId: invoice.id });
        return;
      }

      const line = invoice.lines?.data?.[0];
      await mailer.send(
        monthlyConfirmationMail({
          to,
          firstPayment: invoice.billing_reason === 'subscription_create',
          chargedAmountCents: invoice.amount_paid,
          baseAmountCents: Number(metadata.base_amount) || invoice.amount_paid,
          coverFees: metadata.cover_fees === 'true',
          paidAt: invoice.status_transitions?.paid_at ?? event.created,
          nextChargeAt: line?.period?.end ?? null,
          paymentMethodLabel: paymentMethodLabel(
            (subscription.default_payment_method as Stripe.PaymentMethod | null) ?? null,
          ),
          config: { ...config, portalLoginUrl: config.stripe.portalLoginUrl },
        }),
      );
      donationLog.info('Bestätigung Dauerspende versendet', { stripeId: invoice.id, eventType: event.type });
    },

    'invoice.payment_failed': async (event) => {
      const invoice = event.data.object as Stripe.Invoice;
      if (subscriptionMetadata(invoice).interval !== 'monthly') return;
      donationLog.warn('Abbuchung einer Dauerspende fehlgeschlagen (Stripe mahnt per E-Mail)', {
        stripeId: invoice.id,
        eventType: event.type,
      });
    },

    'customer.subscription.deleted': async (event) => {
      await endSubscription(event.data.object as Stripe.Subscription, true);
    },

    'customer.subscription.updated': async (event) => {
      const subscription = event.data.object as Stripe.Subscription;
      if (subscription.status === 'incomplete_expired') {
        await endSubscription(subscription, false);
        return;
      }
      if (!isOwnMonthly(subscription)) return;

      const previous = (event.data.previous_attributes ?? {}) as Partial<Stripe.Subscription>;
      const scheduledNow =
        (subscription.cancel_at_period_end && previous.cancel_at_period_end === false) ||
        (Boolean(subscription.cancel_at) && 'cancel_at' in previous && previous.cancel_at === null);
      if (!scheduledNow) return;

      const to = await customerEmail(stripe, idOf(subscription.customer));
      if (!to) return;
      const endsAt = subscription.cancel_at ?? subscription.items?.data?.[0]?.current_period_end ?? null;
      await mailer.send(monthlyCancellationConfirmedMail({ to, endsAt, config }));
      donationLog.info('Kündigung der Dauerspende bestätigt', { stripeId: subscription.id, eventType: event.type });
    },
  };
};
