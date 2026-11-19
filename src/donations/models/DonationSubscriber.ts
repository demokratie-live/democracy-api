import { mongoose } from '@democracy-deutschland/democracy-common';

/**
 * Zuordnung „Spender-Schlüssel auf diesem Gerät" → Stripe-Customer/Subscription (data-model.md §1).
 * Gespeichert wird nur der SHA-256-Hash des Schlüssels – keine E-Mail, keine IP, keine Verbindung zu
 * DEMOCRACY-Konten. 90 Tage nach Ende der Dauerspende löscht MongoDB den Eintrag (TTL auf `deleteAt`).
 *
 * Wie beim Webhook-Modell: Es muss die Mongoose-Instanz aus `democracy-common` sein (connectDB).
 */
const RETENTION_AFTER_END_MS = 90 * 24 * 60 * 60 * 1000;

const DonationSubscriberSchema = new mongoose.Schema(
  {
    keyHash: { type: String, required: true, unique: true, match: /^[0-9a-f]{64}$/ },
    stripeCustomerId: { type: String, required: true },
    stripeSubscriptionId: { type: String, default: null },
    endedAt: { type: Date, default: null },
    deleteAt: { type: Date, default: null, expires: 0 },
  },
  { collection: 'donation_subscribers', versionKey: false, timestamps: true },
);
DonationSubscriberSchema.index({ stripeSubscriptionId: 1 });

const DonationSubscriberModel =
  mongoose.models.DonationSubscriber || mongoose.model('DonationSubscriber', DonationSubscriberSchema);

export interface DonationSubscriber {
  id: string;
  keyHash: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string | null;
  endedAt: Date | null;
}

export interface SubscriberStore {
  findByKeyHash(keyHash: string): Promise<DonationSubscriber | null>;
  /**
   * Legt den Eintrag für einen neuen Schlüssel an. Gibt es ihn (paralleler Request) schon, bleibt er
   * unverändert und wird zurückgegeben – ein bestehender Eintrag wechselt nie den Customer.
   */
  insert(keyHash: string, stripeCustomerId: string): Promise<DonationSubscriber>;
  /**
   * Ordnet die Subscription zu, aber nur, wenn der Eintrag noch auf `expected` zeigt (Vergleichen und
   * Setzen gegen parallele Requests). Hebt einen „beendet"-Status auf. `false` = Race verloren.
   */
  linkSubscription(id: string, stripeSubscriptionId: string, expected: string | null): Promise<boolean>;
  /** Markiert die Dauerspende als beendet – nur, wenn es die aktuelle Subscription des Eintrags ist. */
  markEnded(stripeSubscriptionId: string, endedAt: Date): Promise<boolean>;
}

type SubscriberDocument = {
  _id: { toString(): string };
  keyHash: string;
  stripeCustomerId: string;
  stripeSubscriptionId?: string | null;
  endedAt?: Date | null;
};

const toSubscriber = (doc: SubscriberDocument): DonationSubscriber => ({
  id: doc._id.toString(),
  keyHash: doc.keyHash,
  stripeCustomerId: doc.stripeCustomerId,
  stripeSubscriptionId: doc.stripeSubscriptionId ?? null,
  endedAt: doc.endedAt ?? null,
});

export const mongoSubscriberStore: SubscriberStore = {
  async findByKeyHash(keyHash) {
    const doc = await DonationSubscriberModel.findOne({ keyHash }).lean();
    return doc ? toSubscriber(doc as SubscriberDocument) : null;
  },
  async insert(keyHash, stripeCustomerId) {
    const doc = await DonationSubscriberModel.findOneAndUpdate(
      { keyHash },
      { $setOnInsert: { keyHash, stripeCustomerId, stripeSubscriptionId: null, endedAt: null, deleteAt: null } },
      { upsert: true, new: true },
    ).lean();
    return toSubscriber(doc as SubscriberDocument);
  },
  async linkSubscription(id, stripeSubscriptionId, expected) {
    // endedAt zurücksetzen: Ein „beendet"-Webhook der ersetzten (incomplete) Subscription kann vor
    // diesem Aufruf eingetroffen sein und den Eintrag sonst fälschlich als beendet markieren.
    const result = await DonationSubscriberModel.updateOne(
      { _id: id, stripeSubscriptionId: expected },
      { $set: { stripeSubscriptionId, endedAt: null, deleteAt: null } },
    );
    // „Gefunden" zählt (nicht „geändert"): Bei einer Wiederholung ist der Wert schon gesetzt.
    const { matchedCount, n } = result as { matchedCount?: number; n?: number };
    return (matchedCount ?? n ?? 0) > 0;
  },
  async markEnded(stripeSubscriptionId, endedAt) {
    const result = await DonationSubscriberModel.updateOne(
      { stripeSubscriptionId, endedAt: null },
      { $set: { endedAt, deleteAt: new Date(endedAt.getTime() + RETENTION_AFTER_END_MS) } },
    );
    // Mongoose 5 (democracy-common) meldet `nModified`, Mongoose 6 `modifiedCount`.
    const { modifiedCount, nModified } = result as { modifiedCount?: number; nModified?: number };
    return (modifiedCount ?? nModified ?? 0) > 0;
  },
};
