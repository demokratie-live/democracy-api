import crypto from 'crypto';
import { mongoose } from '@democracy-deutschland/democracy-common';

/**
 * Idempotenz für Stripe-Webhooks (data-model.md §1): Stripe stellt Events „at least once" zu,
 * auch parallel. `_id` ist die Stripe-Event-ID; Einträge verfallen nach 30 Tagen (TTL-Index).
 *
 * Ablauf: `claim` legt das Event als „processing" mit Zeitstempel an. Erst nach erfolgreicher
 * Verarbeitung setzt `complete` es auf „done". Stirbt ein Pod mitten in der Verarbeitung, darf ein
 * späterer Stripe-Retry das Event nach Ablauf der Frist (LEASE_MS) erneut übernehmen. Jede Übernahme
 * bekommt ein eigenes Token; `complete`/`release` wirken nur mit dem Token des aktuellen Eigentümers.
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
    token: { type: String, default: null },
    processedAt: { type: Date, default: Date.now, expires: THIRTY_DAYS_IN_SECONDS },
  },
  { collection: 'donation_webhook_events', versionKey: false },
);

const DonationWebhookEventModel =
  mongoose.models.DonationWebhookEvent || mongoose.model('DonationWebhookEvent', DonationWebhookEventSchema);

/** claimed = jetzt verarbeiten (mit Token) · done = schon erledigt · busy = läuft gerade woanders */
export type Claim = { status: 'claimed'; token: string } | { status: 'done' } | { status: 'busy' };

export interface WebhookEventStore {
  claim(eventId: string, type: string): Promise<Claim>;
  /** Nach erfolgreicher Verarbeitung: Wiederholungen werden ab jetzt als Duplikat beantwortet. */
  complete(eventId: string, token: string): Promise<void>;
  /** Nach einem Fehler: Ein Stripe-Retry darf das Event sofort erneut verarbeiten. */
  release(eventId: string, token: string): Promise<void>;
}

const DUPLICATE_KEY = 11000;

export const mongoWebhookEventStore: WebhookEventStore = {
  async claim(eventId, type) {
    const token = crypto.randomUUID();
    try {
      await DonationWebhookEventModel.create({
        _id: eventId,
        type,
        status: 'processing',
        claimedAt: new Date(),
        token,
      });
      return { status: 'claimed', token };
    } catch (error) {
      if ((error as { code?: number })?.code !== DUPLICATE_KEY) throw error;
    }
    // Abgelaufene Verarbeitung (z. B. Pod beendet) übernehmen – atomar, damit nur ein Pod gewinnt.
    const now = new Date();
    const takeover = await DonationWebhookEventModel.updateOne(
      { _id: eventId, status: 'processing', claimedAt: { $lt: new Date(now.getTime() - LEASE_MS) } },
      { $set: { claimedAt: now, token } },
    );
    const { matchedCount, n } = takeover as { matchedCount?: number; n?: number };
    if ((matchedCount ?? n ?? 0) > 0) return { status: 'claimed', token };

    const existing = (await DonationWebhookEventModel.findById(eventId).lean()) as { status?: string } | null;
    // Kein Eintrag mehr (gerade freigegeben) → „busy": Stripe stellt erneut zu, nichts geht verloren.
    if (!existing || existing.status === 'processing') return { status: 'busy' };
    // „done" – und Einträge aus der Zeit vor dem Status-Feld gelten als erledigt.
    return { status: 'done' };
  },
  async complete(eventId, token) {
    await DonationWebhookEventModel.updateOne(
      { _id: eventId, token },
      { $set: { status: 'done', processedAt: new Date() } },
    );
  },
  async release(eventId, token) {
    await DonationWebhookEventModel.deleteOne({ _id: eventId, token });
  },
};
