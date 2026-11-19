import { mongoose } from '@democracy-deutschland/democracy-common';

/**
 * Idempotenz für Stripe-Webhooks (data-model.md §1): Stripe stellt Events „at least once" zu.
 * `_id` ist die Stripe-Event-ID; Einträge verfallen nach 30 Tagen (TTL-Index).
 *
 * Wichtig: Es muss die Mongoose-Instanz aus `democracy-common` verwendet werden – nur sie ist
 * über `connectDB` verbunden.
 */
const THIRTY_DAYS_IN_SECONDS = 60 * 60 * 24 * 30;

const DonationWebhookEventSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    type: { type: String, required: true },
    processedAt: { type: Date, default: Date.now, expires: THIRTY_DAYS_IN_SECONDS },
  },
  { collection: 'donation_webhook_events', versionKey: false },
);

const DonationWebhookEventModel =
  mongoose.models.DonationWebhookEvent || mongoose.model('DonationWebhookEvent', DonationWebhookEventSchema);

export interface WebhookEventStore {
  /** Markiert ein Event als in Verarbeitung. `false`, wenn es bereits verarbeitet wurde. */
  claim(eventId: string, type: string): Promise<boolean>;
  /** Gibt ein Event wieder frei, damit ein Stripe-Retry es erneut verarbeiten kann. */
  release(eventId: string): Promise<void>;
}

const DUPLICATE_KEY = 11000;

export const mongoWebhookEventStore: WebhookEventStore = {
  async claim(eventId, type) {
    try {
      await DonationWebhookEventModel.create({ _id: eventId, type });
      return true;
    } catch (error) {
      if ((error as { code?: number })?.code === DUPLICATE_KEY) return false;
      throw error;
    }
  },
  async release(eventId) {
    await DonationWebhookEventModel.deleteOne({ _id: eventId });
  },
};
