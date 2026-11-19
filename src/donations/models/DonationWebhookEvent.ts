import { mongoose } from '@democracy-deutschland/democracy-common';

/**
 * Idempotenz für Stripe-Webhooks (data-model.md §1): Stripe stellt Events „at least once" zu,
 * auch parallel. `_id` ist die Stripe-Event-ID; Einträge verfallen nach 30 Tagen (TTL-Index).
 *
 * Ablauf: `claim` legt das Event als „processing" mit Zeitstempel an. Erst nach erfolgreicher
 * Verarbeitung setzt `complete` es auf „done". Stirbt ein Pod mitten in der Verarbeitung, darf ein
 * späterer Stripe-Retry das Event nach Ablauf der Frist (LEASE_MS) erneut übernehmen.
 *
 * Wichtig: Es muss die Mongoose-Instanz aus `democracy-common` verwendet werden – nur sie ist
 * über `connectDB` verbunden.
 */
const THIRTY_DAYS_IN_SECONDS = 60 * 60 * 24 * 30;
const LEASE_MS = 5 * 60 * 1000;

const DonationWebhookEventSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    type: { type: String, required: true },
    status: { type: String, enum: ['processing', 'done'], default: 'processing' },
    claimedAt: { type: Date, default: Date.now },
    processedAt: { type: Date, default: Date.now, expires: THIRTY_DAYS_IN_SECONDS },
  },
  { collection: 'donation_webhook_events', versionKey: false },
);

const DonationWebhookEventModel =
  mongoose.models.DonationWebhookEvent || mongoose.model('DonationWebhookEvent', DonationWebhookEventSchema);

/** claimed = jetzt verarbeiten · done = schon erledigt · busy = läuft gerade woanders */
export type ClaimResult = 'claimed' | 'done' | 'busy';

export interface WebhookEventStore {
  claim(eventId: string, type: string): Promise<ClaimResult>;
  /** Nach erfolgreicher Verarbeitung: Wiederholungen werden ab jetzt als Duplikat beantwortet. */
  complete(eventId: string): Promise<void>;
  /** Nach einem Fehler: Ein Stripe-Retry darf das Event sofort erneut verarbeiten. */
  release(eventId: string): Promise<void>;
}

const DUPLICATE_KEY = 11000;

export const mongoWebhookEventStore: WebhookEventStore = {
  async claim(eventId, type) {
    try {
      await DonationWebhookEventModel.create({ _id: eventId, type, status: 'processing', claimedAt: new Date() });
      return 'claimed';
    } catch (error) {
      if ((error as { code?: number })?.code !== DUPLICATE_KEY) throw error;
    }
    // Abgelaufene Verarbeitung (z. B. Pod beendet) übernehmen – atomar, damit nur ein Pod gewinnt.
    const now = new Date();
    const takeover = await DonationWebhookEventModel.updateOne(
      { _id: eventId, status: 'processing', claimedAt: { $lt: new Date(now.getTime() - LEASE_MS) } },
      { $set: { claimedAt: now } },
    );
    const { matchedCount, n } = takeover as { matchedCount?: number; n?: number };
    if ((matchedCount ?? n ?? 0) > 0) return 'claimed';

    const existing = (await DonationWebhookEventModel.findById(eventId).lean()) as { status?: string } | null;
    // Einträge aus der Zeit vor dem Status-Feld gelten als erledigt.
    return existing?.status === 'processing' ? 'busy' : 'done';
  },
  async complete(eventId) {
    await DonationWebhookEventModel.updateOne({ _id: eventId }, { $set: { status: 'done', processedAt: new Date() } });
  },
  async release(eventId) {
    await DonationWebhookEventModel.deleteOne({ _id: eventId });
  },
};
