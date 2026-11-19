import { afterEach, describe, it, expect, vi } from 'vitest';
import { createStripeClient } from '../stripe';
import type { WebhookHandlers } from '../webhook';
import { buildDeps, createMemoryEventStore, startServer, TEST_WEBHOOK_SECRET, readJson } from './helpers';

const stripe = createStripeClient('rk_test_dummy');

let close: (() => Promise<void>) | undefined;

afterEach(async () => {
  await close?.();
  close = undefined;
});

const event = (id: string, type: string, object: Record<string, unknown>) => ({
  id,
  object: 'event',
  type,
  api_version: '2026-10-28.endive',
  created: 1763540000,
  data: { object },
});

const ownPaymentIntent = { id: 'pi_1', object: 'payment_intent', metadata: { source: 'democracy-app' } };

const setup = async (handlers: WebhookHandlers) => {
  const eventStore = createMemoryEventStore();
  const server = await startServer(buildDeps({ webhookHandlers: handlers, eventStore }));
  close = server.close;

  const post = (
    payload: unknown,
    { secret = TEST_WEBHOOK_SECRET, signature }: { secret?: string; signature?: string } = {},
  ) => {
    const body = JSON.stringify(payload);
    const header = signature ?? stripe.webhooks.generateTestHeaderString({ payload: body, secret });
    return fetch(`${server.url}/stripe-webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'stripe-signature': header },
      body,
    });
  };
  return { post, eventStore };
};

describe('POST /donations/v1/stripe-webhook', () => {
  it('verarbeitet ein eigenes Event mit gültiger Signatur genau einmal', async () => {
    const handler = vi.fn(async () => undefined);
    const { post, eventStore } = await setup({ 'payment_intent.succeeded': handler });

    const first = await post(event('evt_1', 'payment_intent.succeeded', ownPaymentIntent));
    expect(first.status).toBe(200);
    expect(await readJson(first)).toEqual({ received: true });

    const duplicate = await post(event('evt_1', 'payment_intent.succeeded', ownPaymentIntent));
    expect(duplicate.status).toBe(200);
    expect(await readJson(duplicate)).toEqual({ received: true, duplicate: true });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(eventStore.claimed.has('evt_1')).toBe(true);
  });

  it('lehnt Events in einer anderen API-Version ab, statt sie still zu ignorieren', async () => {
    const handler = vi.fn(async () => undefined);
    const { post, eventStore } = await setup({ 'payment_intent.succeeded': handler });

    const response = await post({
      ...event('evt_old', 'payment_intent.succeeded', ownPaymentIntent),
      api_version: '2020-03-02',
    });
    expect(response.status).toBe(400);
    expect(handler).not.toHaveBeenCalled();
    expect(eventStore.claimed.has('evt_old')).toBe(false);
  });

  it('antwortet bei paralleler Verarbeitung mit 409, damit Stripe später erneut zustellt', async () => {
    let finish: () => void = () => undefined;
    const handler = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const { post, eventStore } = await setup({ 'payment_intent.succeeded': handler });

    const first = post(event('evt_busy', 'payment_intent.succeeded', ownPaymentIntent));
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1));
    const parallel = await post(event('evt_busy', 'payment_intent.succeeded', ownPaymentIntent));
    expect(parallel.status).toBe(409);

    finish();
    expect((await first).status).toBe(200);
    expect(eventStore.done.has('evt_busy')).toBe(true);
    const later = await post(event('evt_busy', 'payment_intent.succeeded', ownPaymentIntent));
    expect(await readJson(later)).toEqual({ received: true, duplicate: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('antwortet 200 und verarbeitet nicht erneut, wenn nur das Markieren als erledigt scheitert', async () => {
    const handler = vi.fn(async () => undefined);
    const { post, eventStore } = await setup({ 'payment_intent.succeeded': handler });
    eventStore.complete = vi.fn(async () => {
      throw Object.assign(new Error('primary stepped down'), { code: 'NotWritablePrimary' });
    });

    const response = await post(event('evt_complete', 'payment_intent.succeeded', ownPaymentIntent));
    expect(response.status).toBe(200);
    // Nicht freigegeben: eine Wiederholung gilt bis Fristablauf als „busy", die Mail geht nicht doppelt raus.
    expect(eventStore.claimed.has('evt_complete')).toBe(true);
    expect((await post(event('evt_complete', 'payment_intent.succeeded', ownPaymentIntent))).status).toBe(409);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('lehnt ungültige Signaturen mit 400 ab', async () => {
    const handler = vi.fn(async () => undefined);
    const { post } = await setup({ 'payment_intent.succeeded': handler });

    const wrongSecret = await post(event('evt_2', 'payment_intent.succeeded', ownPaymentIntent), {
      secret: 'whsec_wrong',
    });
    expect(wrongSecret.status).toBe(400);
    expect((await readJson(wrongSecret)).error.code).toBe('invalid_signature');

    const garbage = await post(event('evt_3', 'payment_intent.succeeded', ownPaymentIntent), { signature: 'nope' });
    expect(garbage.status).toBe(400);
    expect(handler).not.toHaveBeenCalled();
  });

  it('ignoriert fremde Objekte, z. B. DonorBox-Zahlungen im selben Stripe-Konto', async () => {
    const handler = vi.fn(async () => undefined);
    const { post, eventStore } = await setup({ 'payment_intent.succeeded': handler });

    const response = await post(
      event('evt_4', 'payment_intent.succeeded', { id: 'pi_2', object: 'payment_intent', metadata: {} }),
    );
    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({ received: true, ignored: true });
    expect(handler).not.toHaveBeenCalled();
    expect(eventStore.claimed.size).toBe(0);
  });

  it('erkennt eigene Rechnungen über die Subscription-Metadaten', async () => {
    const handler = vi.fn(async () => undefined);
    const { post } = await setup({ 'invoice.paid': handler });

    await post(
      event('evt_5', 'invoice.paid', {
        id: 'in_1',
        object: 'invoice',
        metadata: {},
        parent: { subscription_details: { metadata: { source: 'democracy-app' }, subscription: 'sub_1' } },
      }),
    );
    await post(
      event('evt_6', 'invoice.paid', {
        id: 'in_2',
        object: 'invoice',
        metadata: {},
        parent: { subscription_details: { metadata: {}, subscription: 'sub_2' } },
      }),
    );
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('verarbeitet konto-weite Alarme (Rückbuchung) ohne Herkunftsfilter', async () => {
    const handler = vi.fn(async () => undefined);
    const { post } = await setup({ 'charge.dispute.created': handler });

    const response = await post(event('evt_7', 'charge.dispute.created', { id: 'dp_1', object: 'dispute' }));
    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('ignoriert Events ohne Handler', async () => {
    const { post, eventStore } = await setup({});
    const response = await post(event('evt_8', 'customer.created', { id: 'cus_1', object: 'customer' }));
    expect(await readJson(response)).toEqual({ received: true, ignored: true });
    expect(eventStore.claimed.size).toBe(0);
  });

  it('gibt das Event bei einem Handler-Fehler frei, damit Stripes Wiederholung es erneut verarbeitet', async () => {
    const handler = vi
      .fn<(...args: unknown[]) => Promise<void>>()
      .mockRejectedValueOnce(Object.assign(new Error('smtp down'), { code: 'ECONNREFUSED' }))
      .mockResolvedValueOnce(undefined);
    const { post, eventStore } = await setup({ 'payment_intent.succeeded': handler });

    const failed = await post(event('evt_9', 'payment_intent.succeeded', ownPaymentIntent));
    expect(failed.status).toBe(500);
    expect(eventStore.claimed.has('evt_9')).toBe(false);

    const retried = await post(event('evt_9', 'payment_intent.succeeded', ownPaymentIntent));
    expect(retried.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(2);
    expect(eventStore.claimed.has('evt_9')).toBe(true);
  });
});
