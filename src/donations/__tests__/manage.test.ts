import crypto from 'crypto';
import { afterEach, describe, it, expect, vi } from 'vitest';
import type Stripe from 'stripe';
import type { DonationSubscriber } from '../models/DonationSubscriber';
import { buildDeps, createMemorySubscriberStore, readJson, startServer, testEnv } from './helpers';

const DONOR_KEY = Buffer.alloc(32, 5);
const AUTH = `DonorKey ${DONOR_KEY.toString('base64url')}`;
const KEY_HASH = crypto.createHash('sha256').update(Uint8Array.from(DONOR_KEY)).digest('hex');
const IDEMPOTENCY_KEY = '9b2c7e1a-3f4d-4c5b-8a6e-0d1f2e3a4b5c';
const PERIOD_END = 1_798_761_600; // 2027-01-01T00:00:00Z

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

const subscription = (overrides: Record<string, unknown> = {}) => ({
  id: 'sub_1',
  status: 'active',
  customer: 'cus_1',
  cancel_at_period_end: false,
  cancel_at: null,
  metadata: { source: 'democracy-app', interval: 'monthly', base_amount: '500', cover_fees: 'true' },
  items: { data: [{ id: 'si_1', current_period_end: PERIOD_END, price: { unit_amount: 539, product: 'prod_test' } }] },
  default_payment_method: { type: 'sepa_debit', sepa_debit: { last4: '3000' } },
  latest_invoice: { id: 'in_1', status: 'paid', billing_reason: 'subscription_create', created: 1_796_083_200 },
  ...overrides,
});

const fakeStripe = (current: Record<string, unknown> = subscription(), lastPaymentError: unknown = null) => ({
  subscriptions: {
    retrieve: vi.fn(async () => current),
    update: vi.fn(async (_id: string, params: Record<string, unknown>) => ({
      ...current,
      ...(params.cancel_at_period_end ? { cancel_at_period_end: true } : {}),
      ...(params.items
        ? {
            items: { data: [{ id: 'si_1', current_period_end: PERIOD_END, price: { unit_amount: 1000 } }] },
            metadata: { ...(current.metadata as object), ...(params.metadata as object) },
          }
        : {}),
    })),
    cancel: vi.fn(async () => ({ ...current, status: 'canceled' })),
  },
  invoicePayments: {
    list: vi.fn(async () => ({ data: [{ payment: { payment_intent: { last_payment_error: lastPaymentError } } }] })),
  },
  billingPortal: { sessions: { create: vi.fn(async () => ({ url: 'https://billing.stripe.com/p/session/test_1' })) } },
});

const entry: DonationSubscriber = {
  id: 'e1',
  keyHash: KEY_HASH,
  stripeCustomerId: 'cus_1',
  stripeSubscriptionId: 'sub_1',
  endedAt: null,
};

const start = async (
  stripe: ReturnType<typeof fakeStripe>,
  entries: DonationSubscriber[] = [entry],
  env: Record<string, string> = testEnv,
) => {
  const server = await startServer(
    buildDeps({ stripe: stripe as unknown as Stripe, subscribers: createMemorySubscriberStore(entries) }, env),
  );
  close = server.close;
  return (
    method: string,
    path = '/monthly',
    body?: unknown,
    headers: Record<string, string> = { Authorization: AUTH },
  ) =>
    fetch(`${server.url}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
};

describe('GET /donations/v1/monthly (T048)', () => {
  it('liefert Status, Beträge, nächste Abbuchung und Zahlungsart', async () => {
    const request = await start(fakeStripe());
    const response = await request('GET');
    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({
      status: 'active',
      cancelAtPeriodEnd: false,
      amountCents: 539,
      baseAmountCents: 500,
      coverFees: true,
      currentPeriodEnd: '2027-01-01T00:00:00.000Z',
      paymentMethod: { type: 'sepa_debit', label: 'SEPA-Lastschrift (•••• 3000)' },
      firstPaymentPending: false,
      lastPaymentError: null,
    });
  });

  it('meldet eine noch laufende erste Lastschrift', async () => {
    const request = await start(
      fakeStripe(
        subscription({ latest_invoice: { id: 'in_1', status: 'open', billing_reason: 'subscription_create' } }),
      ),
    );
    expect((await readJson(await request('GET'))).firstPaymentPending).toBe(true);
  });

  it('nennt bei überfälliger Dauerspende den Grund auf Deutsch', async () => {
    const stripe = fakeStripe(
      subscription({
        status: 'past_due',
        latest_invoice: { id: 'in_2', status: 'open', billing_reason: 'subscription_cycle', created: 1_796_083_200 },
      }),
      { code: 'card_declined', decline_code: 'expired_card', message: 'Your card has expired.' },
    );
    const request = await start(stripe);
    const body = await readJson(await request('GET'));
    expect(body.status).toBe('past_due');
    expect(body.lastPaymentError).toEqual({ message: 'Die Karte ist abgelaufen.', at: '2026-12-01T00:00:00.000Z' });
  });

  it('antwortet ohne Zuordnung mit 404 und mit ungültigem Schlüssel mit 401', async () => {
    const request = await start(fakeStripe(), []);
    const missing = await request('GET');
    expect(missing.status).toBe(404);
    expect((await readJson(missing)).error.code).toBe('not_found');

    const invalid = await request('GET', '/monthly', undefined, { Authorization: 'DonorKey abc' });
    expect(invalid.status).toBe(401);
  });

  it('bleibt auch bei abgeschaltetem Spendenmodul erreichbar (Kündigen muss immer gehen)', async () => {
    const request = await start(fakeStripe(), [entry], { ...testEnv, DONATIONS_ENABLED: 'false' });
    expect((await request('GET')).status).toBe(200);
    expect((await request('DELETE')).status).toBe(200);
  });
});

describe('PATCH /donations/v1/monthly (T049)', () => {
  const headers = { Authorization: AUTH, 'Idempotency-Key': IDEMPOTENCY_KEY };

  it('ändert den Betrag ab der nächsten Abbuchung ohne anteilige Verrechnung', async () => {
    const stripe = fakeStripe();
    const request = await start(stripe);
    const response = await request('PATCH', '/monthly', { amountCents: 1000, coverFees: false }, headers);
    expect(response.status).toBe(200);
    expect((await readJson(response)).amountCents).toBe(1000);
    expect(stripe.subscriptions.update).toHaveBeenCalledWith(
      'sub_1',
      {
        items: [
          {
            id: 'si_1',
            price_data: { currency: 'eur', product: 'prod_test', unit_amount: 1000, recurring: { interval: 'month' } },
          },
        ],
        proration_behavior: 'none',
        metadata: { base_amount: '1000', cover_fees: 'false' },
        expand: ['default_payment_method', 'latest_invoice'],
      },
      { idempotencyKey: `${IDEMPOTENCY_KEY}:update` },
    );
  });

  it.each([
    ['überfällig', { status: 'past_due' }],
    ['bereits gekündigt', { cancel_at_period_end: true }],
  ])('lehnt Änderungen ab, wenn die Dauerspende %s ist (409 not_active)', async (_name, overrides) => {
    const stripe = fakeStripe(subscription(overrides));
    const request = await start(stripe);
    const response = await request('PATCH', '/monthly', { amountCents: 1000, coverFees: false }, headers);
    expect(response.status).toBe(409);
    expect((await readJson(response)).error.code).toBe('not_active');
    expect(stripe.subscriptions.update).not.toHaveBeenCalled();
  });

  it('prüft Betrag und Idempotency-Key', async () => {
    const request = await start(fakeStripe());
    const tooLow = await request('PATCH', '/monthly', { amountCents: 100, coverFees: false }, headers);
    expect((await readJson(tooLow)).error.code).toBe('amount_out_of_range');
    const noKey = await request('PATCH', '/monthly', { amountCents: 1000, coverFees: false });
    expect((await readJson(noKey)).error.code).toBe('invalid_idempotency_key');
  });
});

describe('DELETE /donations/v1/monthly (T050)', () => {
  it('kündigt eine aktive Dauerspende zum Ende des bezahlten Monats', async () => {
    const stripe = fakeStripe();
    const request = await start(stripe);
    const response = await request('DELETE');
    expect(response.status).toBe(200);
    expect((await readJson(response)).cancelAtPeriodEnd).toBe(true);
    expect(stripe.subscriptions.update).toHaveBeenCalledWith('sub_1', {
      cancel_at_period_end: true,
      expand: ['default_payment_method', 'latest_invoice'],
    });
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
  });

  it.each(['past_due', 'incomplete'])('beendet eine %s-Dauerspende sofort', async (status) => {
    const stripe = fakeStripe(subscription({ status, latest_invoice: null }));
    const request = await start(stripe);
    const response = await request('DELETE');
    expect((await readJson(response)).status).toBe('canceled');
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith('sub_1', {
      expand: ['default_payment_method', 'latest_invoice'],
    });
  });

  it('ist idempotent, wenn die Kündigung schon vorgemerkt ist', async () => {
    const stripe = fakeStripe(subscription({ cancel_at_period_end: true }));
    const request = await start(stripe);
    expect((await request('DELETE')).status).toBe(200);
    expect(stripe.subscriptions.update).not.toHaveBeenCalled();
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
  });
});

describe('POST /donations/v1/monthly/portal-session (T051)', () => {
  it('erzeugt eine Portal-Session mit eigener Konfiguration und Rücksprung in die App', async () => {
    const stripe = fakeStripe();
    const request = await start(stripe, [entry], { ...testEnv, STRIPE_PORTAL_CONFIGURATION_ID: 'bpc_test' });
    const response = await request('POST', '/monthly/portal-session');
    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({ url: 'https://billing.stripe.com/p/session/test_1' });
    expect(stripe.billingPortal.sessions.create).toHaveBeenCalledWith({
      customer: 'cus_1',
      configuration: 'bpc_test',
      return_url: 'democracy://donate/manage',
      locale: 'de',
    });
  });
});
