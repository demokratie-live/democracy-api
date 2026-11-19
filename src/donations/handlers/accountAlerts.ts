import type Stripe from 'stripe';
import { DONATION_SOURCE } from '../constants';
import { donationLog } from '../log';
import type { WebhookHandlers } from '../webhook';
import { idOf } from './shared';

/**
 * Hinweise für den Kassenwart (T062, User Story 5): Erstattungen, Rückbuchungen/Widersprüche und
 * geänderte SEPA-Mandate. Diese Events filtert webhook.ts bewusst nicht nach Herkunft – sie betreffen
 * das ganze Konto (auch DonorBox). Wir protokollieren sie als Warnung mit Herkunft „app" oder „andere"
 * und ausschließlich Stripe-IDs. Keine Mail an die Spender:in, Dauerspenden bleiben unverändert.
 *
 * Ein Alarm-Kanal (Discord o. Ä.) ist im Logger derzeit nicht angebunden; den eigentlichen Alarm
 * liefern Stripes E-Mail-Benachrichtigungen (docs/DONATIONS.md §5).
 */

type Origin = 'app' | 'andere' | 'unbekannt';

const metadataSource = (value: unknown): string | undefined =>
  (value as { metadata?: Record<string, string> | null } | null)?.metadata?.source;

export const createAccountAlertHandlers = ({ stripe }: { stripe: Stripe }): WebhookHandlers => {
  /**
   * Einzelspenden tragen `source` am PaymentIntent (und am daraus erzeugten Charge), Dauerspenden am
   * Customer. Charges werden nie nachgeladen – der eingeschränkte Schlüssel hat kein Charges-Recht.
   */
  const originOf = async (
    tagged: { metadata?: Record<string, string> | null } | null,
    customerRef: string | { id: string } | null | undefined,
  ): Promise<Origin> => {
    if (tagged?.metadata?.source === DONATION_SOURCE) return 'app';
    const customerId = idOf(customerRef ?? null);
    if (!customerId) return 'andere';
    try {
      const customer = await stripe.customers.retrieve(customerId);
      return metadataSource(customer) === DONATION_SOURCE ? 'app' : 'andere';
    } catch {
      // Der Hinweis selbst ist wichtiger als die Herkunft – nicht am Nachladen scheitern lassen.
      return 'unbekannt';
    }
  };

  return {
    'charge.refunded': async (event) => {
      const charge = event.data.object as Stripe.Charge;
      const origin = await originOf(charge, charge.customer as string | { id: string } | null);
      donationLog.warn(`Zahlung erstattet (${origin})`, { stripeId: charge.id, eventId: event.id, code: origin });
    },

    'charge.dispute.created': async (event) => {
      const dispute = event.data.object as Stripe.Dispute;
      const intentId = idOf(dispute.payment_intent as string | { id: string } | null);
      const intent = intentId ? await stripe.paymentIntents.retrieve(intentId).catch(() => null) : null;
      const origin = intent ? await originOf(intent, intent.customer as string | { id: string } | null) : 'unbekannt';
      donationLog.warn(`Rückbuchung/Widerspruch eingegangen (${origin}) – im Stripe-Dashboard prüfen`, {
        stripeId: dispute.id,
        eventId: event.id,
        code: `${origin}/${dispute.reason}`,
      });
    },

    'mandate.updated': async (event) => {
      const mandate = event.data.object as Stripe.Mandate;
      // Nur das Ende eines Mandats ist relevant (Folge-Lastschriften einer Dauerspende scheitern dann).
      if (mandate.status !== 'inactive') return;
      const methodId = idOf(mandate.payment_method as string | { id: string });
      const method = methodId ? await stripe.paymentMethods.retrieve(methodId).catch(() => null) : null;
      const origin = await originOf(null, method?.customer as string | { id: string } | null | undefined);
      donationLog.warn(`SEPA-Mandat nicht mehr gültig (${origin})`, {
        stripeId: mandate.id,
        eventId: event.id,
        code: origin,
      });
    },
  };
};
