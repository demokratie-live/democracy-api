import { afterEach, describe, it, expect, vi } from 'vitest';
import type Stripe from 'stripe';
import { buildDeps, readJson, startServer } from './helpers';

const IDEMPOTENCY_KEY = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

const fakeStripe = ({
  customers = [] as { id: string; metadata: Record<string, string> }[],
  createIntent = vi.fn(async (params: Record<string, unknown>) => ({
    id: 'pi_123',
    client_secret: 'pi_123_secret_abc',
    amount: params.amount,
  })),
} = {}) => {
  const stripe = {
    customers: {
      list: vi.fn(async () => ({ data: customers })),
      create: vi.fn(async () => ({ id: 'cus_new' })),
    },
    paymentIntents: { create: createIntent },
  };
  return stripe;
};

const start = async (stripe: ReturnType<typeof fakeStripe>) => {
  const server = await startServer(buildDeps({ stripe: stripe as unknown as Stripe }));
  close = server.close;
  return (body: Record<string, unknown>, headers: Record<string, string> = { 'Idempotency-Key': IDEMPOTENCY_KEY }) =>
    fetch(`${server.url}/one-time`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
};

const body = {
  amountCents: 1000,
  coverFees: true,
  email: 'spender@example.org',
  paymentMethodId: 'pm_123',
  platform: 'ios',
  appVersion: '1.6.0',
};

describe('POST /donations/v1/one-time', () => {
  it('legt den PaymentIntent mit Profil, Gebührenübernahme und Metadaten an', async () => {
    const stripe = fakeStripe({
      customers: [
        { id: 'cus_donorbox', metadata: {} },
        { id: 'cus_own', metadata: { source: 'democracy-app' } },
      ],
    });
    const post = await start(stripe);

    const response = await post(body);
    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({
      clientSecret: 'pi_123_secret_abc',
      paymentIntentId: 'pi_123',
      chargedAmountCents: 1041,
    });

    expect(stripe.customers.create).not.toHaveBeenCalled();
    expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
      {
        amount: 1041,
        currency: 'eur',
        customer: 'cus_own',
        payment_method: 'pm_123',
        payment_method_configuration: 'pmc_test',
        automatic_payment_methods: { enabled: true },
        description: 'Spende an DEMOCRACY Deutschland e.V.',
        statement_descriptor_suffix: 'SPENDE',
        metadata: {
          source: 'democracy-app',
          interval: 'one_time',
          base_amount: '1000',
          cover_fees: 'true',
          platform: 'ios',
          app_version: '1.6.0',
        },
      },
      { idempotencyKey: `${IDEMPOTENCY_KEY}:payment_intent` },
    );
  });

  it('legt eine neue Spender:in an, wenn es nur fremde Customers mit der E-Mail gibt', async () => {
    const stripe = fakeStripe({ customers: [{ id: 'cus_donorbox', metadata: {} }] });
    const post = await start(stripe);

    expect((await post(body)).status).toBe(200);
    expect(stripe.customers.create).toHaveBeenCalledWith(
      { email: 'spender@example.org', preferred_locales: ['de'], metadata: { source: 'democracy-app' } },
      { idempotencyKey: `${IDEMPOTENCY_KEY}:customer` },
    );
    expect(stripe.paymentIntents.create.mock.calls[0][0]).toMatchObject({ customer: 'cus_new' });
  });

  it('kommt ohne E-Mail-Adresse ohne Customer aus', async () => {
    const stripe = fakeStripe();
    const post = await start(stripe);

    expect((await post({ ...body, email: undefined, coverFees: false })).status).toBe(200);
    expect(stripe.customers.list).not.toHaveBeenCalled();
    expect(stripe.paymentIntents.create.mock.calls[0][0]).toMatchObject({ customer: undefined, amount: 1000 });
  });

  it('prüft Betrag und Idempotency-Key, bevor Stripe aufgerufen wird', async () => {
    const stripe = fakeStripe();
    const post = await start(stripe);

    const tooSmall = await post({ ...body, amountCents: 300 });
    expect(tooSmall.status).toBe(400);
    expect((await readJson(tooSmall)).error.code).toBe('amount_out_of_range');

    const noKey = await post(body, {});
    expect(noKey.status).toBe(400);
    expect((await readJson(noKey)).error.code).toBe('invalid_idempotency_key');

    expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
  });

  it.each([
    [{ type: 'StripeIdempotencyError' }, 409, 'idempotency_conflict'],
    [
      { type: 'StripeInvalidRequestError', param: 'payment_method', code: 'parameter_invalid' },
      400,
      'payment_method_not_allowed',
    ],
    [
      { type: 'StripeInvalidRequestError', code: 'payment_intent_incompatible_payment_method' },
      400,
      'payment_method_not_allowed',
    ],
    [
      { type: 'StripeInvalidRequestError', code: 'resource_missing', param: 'payment_method' },
      400,
      'invalid_payment_method',
    ],
    [{ type: 'StripeConnectionError' }, 502, 'stripe_error'],
  ])('übersetzt Stripe-Fehler %o in %i %s', async (stripeError, status, code) => {
    const stripe = fakeStripe({
      createIntent: vi.fn(async () => {
        throw stripeError;
      }),
    });
    const post = await start(stripe);

    const response = await post(body);
    expect(response.status).toBe(status);
    const json = await readJson(response);
    expect(json.error.code).toBe(code);
    expect(json.error.message).toBeTruthy();
  });
});
