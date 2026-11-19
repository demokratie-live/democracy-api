import type { RequestHandler } from 'express';
import type Stripe from 'stripe';
import { DonationError } from './errors';
import { donationLog } from './log';
import type { WebhookEventStore } from './models/DonationWebhookEvent';

/**
 * `POST /donations/v1/stripe-webhook` (contracts/stripe-webhooks.md).
 *
 * Ablauf: Signatur prüfen → nur eigene Objekte (metadata.source) und Events mit Handler →
 * Idempotenz über die Event-ID → Handler. Schlägt ein Handler fehl, wird das Event freigegeben
 * und `500` geantwortet, damit Stripe die Zustellung wiederholt.
 */

const DONATION_SOURCE = 'democracy-app';

export type WebhookHandler = (event: Stripe.Event) => Promise<void>;
export type WebhookHandlers = Partial<Record<Stripe.Event['type'], WebhookHandler>>;

/**
 * Konto-weite Ereignisse (Rückbuchungen, Erstattungen, Mandate) betreffen den Verein unabhängig
 * davon, ob die Zahlung aus der App oder z. B. aus DonorBox stammt; sie werden nur als Alarm
 * protokolliert und deshalb nicht nach Herkunft gefiltert.
 */
const ACCOUNT_LEVEL_EVENTS = new Set<string>(['charge.refunded', 'charge.dispute.created', 'mandate.updated']);

type MaybeTagged = {
  object?: string;
  metadata?: Record<string, string> | null;
  parent?: { subscription_details?: { metadata?: Record<string, string> | null } | null } | null;
};

const isDonationAppEvent = (event: Stripe.Event): boolean => {
  if (ACCOUNT_LEVEL_EVENTS.has(event.type)) return true;
  const object = event.data.object as MaybeTagged;
  if (object.metadata?.source === DONATION_SOURCE) return true;
  // Rechnungen tragen die Subscription-Metadaten als Snapshot in parent.subscription_details.
  if (object.object === 'invoice') {
    return object.parent?.subscription_details?.metadata?.source === DONATION_SOURCE;
  }
  return false;
};

interface WebhookDeps {
  stripe: Stripe;
  webhookSecret: string;
  eventStore: WebhookEventStore;
  handlers: WebhookHandlers;
}

export const createWebhookHandler =
  ({ stripe, webhookSecret, eventStore, handlers }: WebhookDeps): RequestHandler =>
  async (req, res) => {
    let event: Stripe.Event;
    try {
      const signature = req.headers['stripe-signature'];
      if (!Buffer.isBuffer(req.body) || typeof signature !== 'string') {
        throw new Error('missing payload or signature');
      }
      event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret) as Stripe.Event;
    } catch {
      donationLog.warn('Webhook mit ungültiger Signatur abgelehnt', { code: 'invalid_signature' });
      const error = new DonationError('invalid_signature');
      res.status(error.status).json(error.toBody());
      return;
    }

    const meta = { eventId: event.id, eventType: event.type };
    const handler = handlers[event.type];
    if (!handler || !isDonationAppEvent(event)) {
      res.json({ received: true, ignored: true });
      return;
    }

    let claimed = false;
    try {
      claimed = await eventStore.claim(event.id, event.type);
      if (!claimed) {
        res.json({ received: true, duplicate: true });
        return;
      }
      await handler(event);
      donationLog.info('Webhook verarbeitet', meta);
      res.json({ received: true });
    } catch (error) {
      if (claimed) {
        await eventStore.release(event.id).catch(() => undefined);
      }
      donationLog.error('Webhook-Verarbeitung fehlgeschlagen', {
        ...meta,
        code: (error as { code?: string })?.code ?? 'handler_error',
      });
      const failure = new DonationError('internal_error');
      res.status(failure.status).json(failure.toBody());
    }
  };
