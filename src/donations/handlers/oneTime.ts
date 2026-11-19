import type Stripe from 'stripe';
import type { DonationConfig } from '../config';
import { donationLog } from '../log';
import type { Mailer } from '../mail/mailer';
import { oneTimeConfirmationMail, sepaFailedMail } from '../mail/templates';
import type { WebhookHandlers } from '../webhook';

/**
 * Webhook-Handler für Einzelspenden (contracts/stripe-webhooks.md, T029).
 * Empfänger der Mail: E-Mail des Customers (in der App angegeben), sonst die vom Zahlungsfenster
 * erhobene E-Mail der Zahlungsmethode (z. B. Pflicht bei SEPA), sonst keine Mail.
 */

interface Deps {
  stripe: Stripe;
  mailer: Mailer;
  config: DonationConfig;
}

const idOf = (value: string | { id: string } | null | undefined): string | null =>
  typeof value === 'string' ? value : (value?.id ?? null);

const paymentMethodLabel = (method: Stripe.PaymentMethod | null): string => {
  if (!method) return 'unbekannt';
  switch (method.type) {
    case 'card': {
      const wallet = method.card?.wallet?.type;
      if (wallet === 'apple_pay') return 'Apple Pay';
      if (wallet === 'google_pay') return 'Google Pay';
      return method.card?.last4 ? `Karte (•••• ${method.card.last4})` : 'Karte';
    }
    case 'sepa_debit':
      return method.sepa_debit?.last4 ? `SEPA-Lastschrift (•••• ${method.sepa_debit.last4})` : 'SEPA-Lastschrift';
    case 'paypal':
      return 'PayPal';
    default:
      return method.type;
  }
};

const customerEmail = async (stripe: Stripe, customerId: string | null): Promise<string | null> => {
  if (!customerId) return null;
  const customer = await stripe.customers.retrieve(customerId);
  if ('deleted' in customer && customer.deleted) return null;
  return (customer as Stripe.Customer).email ?? null;
};

const retrievePaymentMethod = async (stripe: Stripe, id: string | null): Promise<Stripe.PaymentMethod | null> =>
  id ? stripe.paymentMethods.retrieve(id) : null;

export const createOneTimeHandlers = ({ stripe, mailer, config }: Deps): WebhookHandlers => ({
  'payment_intent.succeeded': async (event) => {
    const intent = event.data.object as Stripe.PaymentIntent;
    if (intent.metadata?.interval !== 'one_time') return;

    const method = await retrievePaymentMethod(stripe, idOf(intent.payment_method));
    const to = (await customerEmail(stripe, idOf(intent.customer))) ?? method?.billing_details?.email ?? null;
    if (!to) {
      donationLog.info('Einzelspende ohne E-Mail-Adresse – keine Bestätigung', { stripeId: intent.id });
      return;
    }

    await mailer.send(
      oneTimeConfirmationMail({
        to,
        chargedAmountCents: intent.amount_received || intent.amount,
        baseAmountCents: Number(intent.metadata.base_amount) || intent.amount,
        coverFees: intent.metadata.cover_fees === 'true',
        paidAt: event.created,
        paymentMethodLabel: paymentMethodLabel(method),
        config,
      }),
    );
    donationLog.info('Spendenbestätigung versendet', { stripeId: intent.id, eventType: event.type });
  },

  'payment_intent.payment_failed': async (event) => {
    const intent = event.data.object as Stripe.PaymentIntent;
    if (intent.metadata?.interval !== 'one_time') return;
    // Karten-/Wallet-Fehler sieht die Spender:in direkt im Zahlungsfenster. Eine Mail gibt es nur für
    // Lastschriften, die erst Tage später scheitern.
    const failedMethod = intent.last_payment_error?.payment_method ?? null;
    if (failedMethod?.type !== 'sepa_debit') return;

    const to = (await customerEmail(stripe, idOf(intent.customer))) ?? failedMethod.billing_details?.email ?? null;
    if (!to) return;

    await mailer.send(sepaFailedMail({ to, chargedAmountCents: intent.amount, createdAt: intent.created, config }));
    donationLog.info('Hinweis zur gescheiterten Lastschrift versendet', { stripeId: intent.id });
  },
});
