import type Stripe from 'stripe';
import type { DonationConfig } from '../config';
import { donationLog } from '../log';
import type { Mailer } from '../mail/mailer';
import { oneTimeConfirmationMail, sepaFailedMail } from '../mail/templates';
import type { WebhookHandlers } from '../webhook';
import { customerEmail, idOf, paymentMethodLabel, retrievePaymentMethod } from './shared';

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
