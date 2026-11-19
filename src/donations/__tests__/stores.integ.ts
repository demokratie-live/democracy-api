import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mongoose } from '@democracy-deutschland/democracy-common';
import config from '../../config';
import { connectDB, disconnectDB } from '../../services/mongoose';
import { mongoSubscriberStore } from '../models/DonationSubscriber';
import { mongoWebhookEventStore } from '../models/DonationWebhookEvent';

/**
 * Die echten MongoDB-Implementierungen (mongoose 5 aus democracy-common) – die Unit-Tests nutzen nur
 * In-Memory-Attrappen. Läuft mit `vitest.config.integration.ts` gegen `DB_URL`.
 */
const run = `${Date.now()}`;

// Die Collection-Typen von mongoose 5 kennen die Treiber-Methoden nicht – für die Tests genügt das.
type RawCollection = {
  deleteMany(filter: object): Promise<unknown>;
  findOne(filter: object): Promise<Record<string, unknown> | null>;
  updateOne(filter: object, update: object): Promise<unknown>;
  insertOne(doc: object): Promise<unknown>;
};
const collection = (name: string) => mongoose.connection.collection(name) as unknown as RawCollection;
const hash = (n: number) => `${run}${n}`.padStart(64, '0').slice(-64);

beforeAll(async () => {
  await connectDB(config.DB_URL, { debug: false });
});

afterAll(async () => {
  await collection('donation_subscribers').deleteMany({ keyHash: { $regex: `${run}` } });
  await collection('donation_webhook_events').deleteMany({ _id: { $regex: `^evt_${run}` } });
  await disconnectDB();
});

describe('mongoSubscriberStore', () => {
  it('legt einen Eintrag einmal an; parallele Inserts liefern denselben Eintrag', async () => {
    const [a, b] = await Promise.all([
      mongoSubscriberStore.insert(hash(1), 'cus_a'),
      mongoSubscriberStore.insert(hash(1), 'cus_b'),
    ]).catch(async () => [
      await mongoSubscriberStore.insert(hash(1), 'cus_a'),
      await mongoSubscriberStore.insert(hash(1), 'cus_b'),
    ]);
    expect(a.id).toBe(b.id);
    expect(b.stripeCustomerId).toBe(a.stripeCustomerId);
    const raw = await collection('donation_subscribers').findOne({ keyHash: hash(1) });
    // Ohne zugeordnete Dauerspende verfällt der Eintrag (TTL).
    expect(raw?.deleteAt).toBeInstanceOf(Date);
  });

  it('ordnet per Vergleichen-und-Setzen zu – Wiederholung mit derselben Subscription gilt als Erfolg', async () => {
    const entry = await mongoSubscriberStore.insert(hash(2), 'cus_x');
    expect(await mongoSubscriberStore.linkSubscription(entry.id, 'sub_1', null)).toBe(true);
    // gleiche Subscription erneut (überlappende Wiederholung)
    expect(await mongoSubscriberStore.linkSubscription(entry.id, 'sub_1', null)).toBe(true);
    // anderer Request mit veralteter Erwartung verliert
    expect(await mongoSubscriberStore.linkSubscription(entry.id, 'sub_2', null)).toBe(false);
    const stored = await mongoSubscriberStore.findByKeyHash(hash(2));
    expect(stored?.stripeSubscriptionId).toBe('sub_1');
    const raw = await collection('donation_subscribers').findOne({ keyHash: hash(2) });
    expect(raw?.deleteAt).toBeNull();
  });

  it('markiert nur die aktuelle Subscription als beendet und setzt die Löschfrist', async () => {
    const entry = await mongoSubscriberStore.insert(hash(3), 'cus_y');
    await mongoSubscriberStore.linkSubscription(entry.id, 'sub_3', null);
    expect(await mongoSubscriberStore.markEnded('sub_other', new Date())).toBe(false);
    expect(await mongoSubscriberStore.markEnded('sub_3', new Date())).toBe(true);
    expect(await mongoSubscriberStore.markEnded('sub_3', new Date())).toBe(false);
    const raw = await collection('donation_subscribers').findOne({ keyHash: hash(3) });
    expect(raw?.deleteAt).toBeInstanceOf(Date);
  });
});

describe('mongoWebhookEventStore', () => {
  it('claimed → busy → done, mit Token des Eigentümers', async () => {
    const id = `evt_${run}_1`;
    const first = await mongoWebhookEventStore.claim(id, 'invoice.paid');
    expect(first.status).toBe('claimed');
    expect((await mongoWebhookEventStore.claim(id, 'invoice.paid')).status).toBe('busy');

    // fremdes Token wirkt nicht
    await mongoWebhookEventStore.complete(id, 'falsches-token');
    expect((await mongoWebhookEventStore.claim(id, 'invoice.paid')).status).toBe('busy');

    await mongoWebhookEventStore.complete(id, (first as { token: string }).token);
    expect((await mongoWebhookEventStore.claim(id, 'invoice.paid')).status).toBe('done');
  });

  it('gibt nach einem Fehler frei und übernimmt abgelaufene Sperren', async () => {
    const id = `evt_${run}_2`;
    const first = (await mongoWebhookEventStore.claim(id, 'invoice.paid')) as { status: 'claimed'; token: string };
    await mongoWebhookEventStore.release(id, first.token);
    const second = await mongoWebhookEventStore.claim(id, 'invoice.paid');
    expect(second.status).toBe('claimed');

    // Sperre künstlich altern lassen (Pod beendet) → Übernahme mit neuem Token
    await collection('donation_webhook_events').updateOne(
      { _id: id },
      { $set: { claimedAt: new Date(Date.now() - 6 * 60 * 1000) } },
    );
    const takeover = await mongoWebhookEventStore.claim(id, 'invoice.paid');
    expect(takeover.status).toBe('claimed');
    // der alte Eigentümer kann die neue Sperre nicht mehr freigeben
    await mongoWebhookEventStore.release(id, (second as { token: string }).token);
    expect((await mongoWebhookEventStore.claim(id, 'invoice.paid')).status).toBe('busy');
  });

  it('behandelt Altbestände ohne Status als erledigt', async () => {
    const id = `evt_${run}_3`;
    await collection('donation_webhook_events').insertOne({ _id: id, type: 'invoice.paid', processedAt: new Date() });
    expect((await mongoWebhookEventStore.claim(id, 'invoice.paid')).status).toBe('done');
  });
});
