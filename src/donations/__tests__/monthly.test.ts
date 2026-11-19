import crypto from 'crypto';
import { afterEach, describe, it, expect, vi } from 'vitest';
import type Stripe from 'stripe';
import type { DonationSubscriber } from '../models/DonationSubscriber';
import { buildDeps, createMemorySubscriberStore, readJson, startServer } from './helpers';

const IDEMPOTENCY_KEY = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const DONOR_KEY = Buffer.alloc(32, 9);
const DONOR_HEADER = `DonorKey ${DONOR_KEY.toString('base64url')}`;
const KEY_HASH = crypto.createHash('sha256').update(Uint8Array.from(DONOR_KEY)).digest('hex');
const PERIOD_END = 1_798_761_600; // 2027-01-01T00:00:00Z

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

const fakeStripe = ({ existingStatus = null as Stripe.Subscription.Status | null } = {}) => ({
  customers: {
    list: vi.fn(async () => ({ data: [] })),
    create: vi.fn(async () => ({ id: 'cus_new' })),
  },
  subscriptions: {
    retrieve: vi.fn(async (id: string) => ({ id, status: existingStatus })),
    cancel: vi.fn(async (id: string) => ({ id, status: 'incomplete_expired' })),
    create: vi.fn(async (params: { items: { price_data: { unit_amount: number } }[] }) => ({
      id: 'sub_new',
      status: 'incomplete',
      items: {
        data: [{ current_period_end: PERIOD_END, price: { unit_amount: params.items[0].price_data.unit_amount } }],
      },
      latest_invoice: {
        id: 'in_1',
        confirmation_secret: { client_secret: 'pi_inv_secret_xyz', type: 'payment_intent' },
      },
    })),
  },
});

const start = async (stripe: ReturnType<typeof fakeStripe>, existing: DonationSubscriber[] = []) => {
  const subscribers = createMemorySubscriberStore(existing);
  const server = await startServer(buildDeps({ stripe: stripe as unknown as Stripe, subscribers }));
  close = server.close;
  const post = (
    body: Record<string, unknown>,
    headers: Record<string, string> = { 'Idempotency-Key': IDEMPOTENCY_KEY, Authorization: DONOR_HEADER },
  ) =>
    fetch(`${server.url}/monthly`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  return { post, subscribers };
};

const body = {
  amountCents: 500,
  coverFees: true,
  email: 'pate@example.org',
  paymentMethodId: 'pm_123',
  platform: 'android',
  appVersion: '1.6.0',
};

const existingEntry = (stripeSubscriptionId: string): DonationSubscriber => ({
  id: 'sub-entry-1',
  keyHash: KEY_HASH,
  stripeCustomerId: 'cus_old',
  stripeSubscriptionId,
  endedAt: null,
});

describe('POST /donations/v1/monthly (T037)', () => {
  it('legt die Subscription mit Inline-Preis an und verknüpft sie mit dem Schlüssel-Hash', async () => {
    const stripe = fakeStripe();
    const { post, subscribers } = await start(stripe);

    const response = await post(body);
    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({
      clientSecret: 'pi_inv_secret_xyz',
      subscriptionId: 'sub_new',
      chargedAmountCents: 539,
      currentPeriodEnd: '2027-01-01T00:00:00.000Z',
    });

    expect(stripe.subscriptions.create).toHaveBeenCalledWith(
      {
        customer: 'cus_new',
        items: [
          {
            price_data: { currency: 'eur', product: 'prod_test', unit_amount: 539, recurring: { interval: 'month' } },
          },
        ],
        payment_behavior: 'default_incomplete',
        payment_settings: { save_default_payment_method: 'on_subscription' },
        description: 'Monatliche Spende an DEMOCRACY Deutschland e.V.',
        metadata: {
          source: 'democracy-app',
          interval: 'monthly',
          base_amount: '500',
          cover_fees: 'true',
          platform: 'android',
          app_version: '1.6.0',
          subscriber_id: 'sub-entry-1',
        },
        expand: ['latest_invoice.confirmation_secret'],
      },
      { idempotencyKey: `${IDEMPOTENCY_KEY}:subscription` },
    );

    const stored = subscribers.entries.get(KEY_HASH);
    expect(stored).toMatchObject({ stripeCustomerId: 'cus_new', stripeSubscriptionId: 'sub_new', endedAt: null });
    // Es wird nur der Hash gespeichert, nie der Schlüssel selbst.
    expect(JSON.stringify([...subscribers.entries.values()])).not.toContain(DONOR_KEY.toString('base64url'));
  });

  it('verlangt eine E-Mail-Adresse (400 email_required)', async () => {
    const stripe = fakeStripe();
    const { post } = await start(stripe);

    const response = await post({ ...body, email: '' });
    expect(response.status).toBe(400);
    expect((await readJson(response)).error.code).toBe('email_required');
    expect(stripe.subscriptions.create).not.toHaveBeenCalled();
  });

  it('lehnt fehlenden oder ungültigen Spender-Schlüssel mit 401 ab', async () => {
    const stripe = fakeStripe();
    const { post } = await start(stripe);

    for (const authorization of [undefined, 'DonorKey kurz']) {
      const headers: Record<string, string> = { 'Idempotency-Key': IDEMPOTENCY_KEY };
      if (authorization) headers.Authorization = authorization;
      const response = await post(body, headers);
      expect(response.status).toBe(401);
      expect((await readJson(response)).error.code).toBe('invalid_donor_key');
    }
    expect(stripe.subscriptions.create).not.toHaveBeenCalled();
  });

  it.each(['active', 'past_due'] as const)(
    'sperrt eine zweite Dauerspende, solange die bestehende %s ist (409 subscription_exists)',
    async (status) => {
      const stripe = fakeStripe({ existingStatus: status });
      const { post } = await start(stripe, [existingEntry('sub_old')]);

      const response = await post(body);
      expect(response.status).toBe(409);
      expect((await readJson(response)).error.code).toBe('subscription_exists');
      expect(stripe.subscriptions.create).not.toHaveBeenCalled();
      expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
    },
  );

  it('ersetzt eine unbezahlte (incomplete) Subscription beim erneuten Versuch', async () => {
    const stripe = fakeStripe({ existingStatus: 'incomplete' });
    const { post, subscribers } = await start(stripe, [existingEntry('sub_old')]);

    const response = await post(body);
    expect(response.status).toBe(200);
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith('sub_old');
    expect(subscribers.entries.get(KEY_HASH)?.stripeSubscriptionId).toBe('sub_new');
  });

  it('erlaubt nach beendeter Dauerspende eine neue', async () => {
    const stripe = fakeStripe({ existingStatus: 'canceled' });
    const { post } = await start(stripe, [{ ...existingEntry('sub_old'), endedAt: new Date('2026-10-01') }]);

    const response = await post(body);
    expect(response.status).toBe(200);
    expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled();
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
  });
});
