import type { RequestHandler } from 'express';
import type Stripe from 'stripe';
import { DONATION_SOURCE } from './constants';
import { DonationError } from './errors';
import { donationLog } from './log';
import type { WebhookEventStore } from './models/DonationWebhookEvent';
import { STRIPE_API_VERSION } from './stripe';

/**
 * `POST /donations/v1/stripe-webhook` (contracts/stripe-webhooks.md).
 *
 * Ablauf: Signatur prüfen → nur eigene Objekte (metadata.source) und Events mit Handler →
 * Idempotenz über die Event-ID → Handler. Schlägt ein Handler fehl, wird das Event freigegeben
 * und `500` geantwortet, damit Stripe die Zustellung wiederholt.
 */

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
      // info statt warn: unsignierte Anfragen von außen sollen nicht das MongoDB-Log füllen (warn+).
      // Ein falsch konfiguriertes Secret fällt trotzdem auf – Stripe meldet fehlschlagende Zustellungen.
      donationLog.info('Webhook mit ungültiger Signatur abgelehnt', { code: 'invalid_signature' });
      const error = new DonationError('invalid_signature');
      res.status(error.status).json(error.toBody());
      return;
    }

    const meta = { eventId: event.id, eventType: event.type };

    // Die Form der Event-Objekte hängt von der API-Version des Endpoints ab (z. B. `invoice.parent`
    // erst ab „basil"). Bei abweichender Version laut ablehnen statt still falsch zu verarbeiten.
    // Achtung: Stripe-Retries behalten die ursprüngliche Version – so abgelehnte Events sind verloren.
    // Den Endpoint deshalb VOR dem Einschalten mit der richtigen Version anlegen (docs/DONATIONS.md §2.4).
    if (event.api_version && event.api_version !== STRIPE_API_VERSION) {
      donationLog.error('Webhook mit falscher Stripe-API-Version abgelehnt – Endpoint umstellen', {
        ...meta,
        code: `api_version ${event.api_version} != ${STRIPE_API_VERSION}`,
      });
      const error = new DonationError('invalid_request');
      res.status(error.status).json(error.toBody());
      return;
    }

    const handler = handlers[event.type];
    if (!handler || !isDonationAppEvent(event)) {
      res.json({ received: true, ignored: true });
      return;
    }

    let claimed = false;
    try {
      const claim = await eventStore.claim(event.id, event.type);
      if (claim === 'done') {
        res.json({ received: true, duplicate: true });
        return;
      }
      if (claim === 'busy') {
        // Wird gerade parallel verarbeitet: kein 2xx, damit Stripe später erneut zustellt – falls die
        // laufende Verarbeitung scheitert, geht das Event so nicht verloren.
        res.status(409).json({ received: false, inProgress: true });
        return;
      }
      claimed = true;
      await handler(event);
      await eventStore.complete(event.id);
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
