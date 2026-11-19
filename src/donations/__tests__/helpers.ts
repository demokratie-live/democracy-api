import express from 'express';
import type { AddressInfo } from 'net';
import { vi } from 'vitest';
import { loadDonationConfig } from '../config';
import { createDonationsRouter, type DonationsDeps } from '../index';
import type { DonationSubscriber, SubscriberStore } from '../models/DonationSubscriber';
import type { WebhookEventStore } from '../models/DonationWebhookEvent';
import { createStripeClient } from '../stripe';

export const TEST_WEBHOOK_SECRET = 'whsec_test_secret';

export const testEnv = {
  DONATIONS_ENABLED: 'true',
  STRIPE_SECRET_KEY: 'rk_test_dummy',
  STRIPE_PUBLISHABLE_KEY: 'pk_test_dummy',
  STRIPE_WEBHOOK_SECRET: TEST_WEBHOOK_SECRET,
  STRIPE_DONATION_PRODUCT_ID: 'prod_test',
  STRIPE_PAYMENT_METHOD_CONFIGURATION_ID: 'pmc_test',
  STRIPE_PORTAL_LOGIN_URL: 'https://billing.stripe.com/p/login/test_abc',
};

export const createMemoryEventStore = () => {
  const claimed = new Set<string>();
  const store: WebhookEventStore & { claimed: Set<string> } = {
    claimed,
    async claim(eventId) {
      if (claimed.has(eventId)) return false;
      claimed.add(eventId);
      return true;
    },
    async release(eventId) {
      claimed.delete(eventId);
    },
  };
  return store;
};

/** In-Memory-Variante von `mongoSubscriberStore` mit derselben Semantik. */
export const createMemorySubscriberStore = (initial: DonationSubscriber[] = []) => {
  const entries = new Map(initial.map((entry) => [entry.keyHash, { ...entry }]));
  let nextId = initial.length + 1;
  const store: SubscriberStore & { entries: typeof entries } = {
    entries,
    async findByKeyHash(keyHash) {
      const entry = entries.get(keyHash);
      return entry ? { ...entry } : null;
    },
    async upsert(keyHash, stripeCustomerId) {
      const existing = entries.get(keyHash);
      const entry: DonationSubscriber = existing
        ? { ...existing, stripeCustomerId, endedAt: null }
        : { id: `sub-entry-${nextId++}`, keyHash, stripeCustomerId, stripeSubscriptionId: null, endedAt: null };
      entries.set(keyHash, entry);
      return { ...entry };
    },
    async setSubscription(id, stripeSubscriptionId) {
      for (const entry of entries.values()) {
        if (entry.id === id) Object.assign(entry, { stripeSubscriptionId, endedAt: null });
      }
    },
    async markEnded(stripeSubscriptionId, endedAt) {
      for (const entry of entries.values()) {
        if (entry.stripeSubscriptionId === stripeSubscriptionId && entry.endedAt === null) {
          entry.endedAt = endedAt;
          return true;
        }
      }
      return false;
    },
  };
  return store;
};

export const buildDeps = (overrides: Partial<DonationsDeps> = {}, env: Record<string, string> = testEnv) => {
  const config = loadDonationConfig(env);
  return {
    config,
    stripe: config.stripe.secretKey ? createStripeClient(config.stripe.secretKey) : null,
    eventStore: createMemoryEventStore(),
    subscribers: createMemorySubscriberStore(),
    mailer: { send: vi.fn(async () => undefined) },
    webhookHandlers: {},
    ...overrides,
  } satisfies DonationsDeps;
};

/** Startet eine Express-App mit dem Spendenmodul unter /donations/v1 auf einem freien Port. */
export const startServer = async (deps: DonationsDeps) => {
  const app = express();
  app.use('/donations/v1', createDonationsRouter(deps));
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const listening = app.listen(0, () => resolve(listening));
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/donations/v1`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
};

/** `Response.json()` ist in den Node-Typen `unknown`; Tests lesen die Contract-Antworten untypisiert. */
export const readJson = async (response: Response): Promise<any> => response.json();
