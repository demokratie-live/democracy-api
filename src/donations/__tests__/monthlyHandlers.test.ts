import { describe, it, expect, vi } from 'vitest';
import type Stripe from 'stripe';
import { loadDonationConfig } from '../config';
import { createMonthlyHandlers } from '../handlers/monthly';
import { createMemorySubscriberStore, testEnv } from './helpers';

const config = loadDonationConfig(testEnv);
const PAID_AT = 1_763_550_000; // 19.11.2025
const PERIOD_END = 1_766_228_400; // 20.12.2025

type Mail = { to: string; subject: string; text: string };

const invoice = (overrides: Record<string, unknown> = {}) => ({
  id: 'in_1',
  object: 'invoice',
  billing_reason: 'subscription_create',
  amount_paid: 539,
  customer: 'cus_1',
  customer_email: 'pate@example.org',
  status_transitions: { paid_at: PAID_AT },
  lines: { data: [{ period: { start: PAID_AT, end: PERIOD_END } }] },
  parent: {
    subscription_details: {
      subscription: 'sub_1',
      metadata: { source: 'democracy-app', interval: 'monthly', base_amount: '500', cover_fees: 'true' },
    },
  },
  ...overrides,
});

const subscription = (overrides: Record<string, unknown> = {}) => ({
  id: 'sub_1',
  object: 'subscription',
  status: 'canceled',
  customer: 'cus_1',
  metadata: { source: 'democracy-app', interval: 'monthly' },
  cancellation_details: { reason: 'cancellation_requested' },
  ...overrides,
});

const event = (type: string, object: Record<string, unknown>) =>
  ({ id: 'evt_1', type, created: PAID_AT, data: { object } }) as unknown as Stripe.Event;

const setup = ({ paidInvoices = 1 } = {}) => {
  const stripe = {
    customers: { retrieve: vi.fn(async () => ({ id: 'cus_1', email: 'pate@example.org' })) },
    subscriptions: {
      retrieve: vi.fn(async () => ({
        id: 'sub_1',
        default_payment_method: { type: 'sepa_debit', sepa_debit: { last4: '3000' }, billing_details: {} },
      })),
    },
    invoices: { list: vi.fn(async () => ({ data: Array.from({ length: paidInvoices }, () => ({ id: 'in_x' })) })) },
  };
  const mailer = { send: vi.fn(async (_mail: Mail) => undefined) };
  const subscribers = createMemorySubscriberStore([
    { id: 'e1', keyHash: 'a'.repeat(64), stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1', endedAt: null },
  ]);
  const handlers = createMonthlyHandlers({ stripe: stripe as unknown as Stripe, mailer, config, subscribers });
  const sentMail = () => mailer.send.mock.calls[0][0] as Mail;
  return { stripe, mailer, subscribers, handlers, sentMail };
};

describe('Webhook-Handler Dauerspende (T041/T042)', () => {
  it('begrüßt nach der ersten Abbuchung mit Bestätigung, nächstem Termin und Verwaltungslink', async () => {
    const { handlers, mailer, sentMail } = setup();
    await handlers['invoice.paid']!(event('invoice.paid', invoice()));

    expect(mailer.send).toHaveBeenCalledTimes(1);
    const mail = sentMail();
    expect(mail.to).toBe('pate@example.org');
    expect(mail.subject).toBe('Willkommen als Pat:in – danke für Deine monatliche Spende');
    expect(mail.text).toMatch(/Betrag:\s+5,39\s€ \(inklusive 0,39\s€ freiwillig übernommener Zahlungsgebühren\)/);
    expect(mail.text).toContain('Rhythmus:    monatlich');
    expect(mail.text).toContain('Nächste Abbuchung: 20. Dezember 2025');
    expect(mail.text).toContain('Zahlungsart: SEPA-Lastschrift');
    expect(mail.text).toContain(testEnv.STRIPE_PORTAL_LOGIN_URL);
    expect(mail.text).toContain('nicht um einen Mitgliedsbeitrag');
  });

  it('bestätigt Folgeabbuchungen ohne Willkommenstext', async () => {
    const { handlers, sentMail } = setup();
    await handlers['invoice.paid']!(event('invoice.paid', invoice({ billing_reason: 'subscription_cycle' })));

    expect(sentMail().subject).toBe('Danke für Deine monatliche Spende an DEMOCRACY');
    expect(sentMail().text).not.toContain('Willkommen');
  });

  it('ignoriert Rechnungen, die nicht zu einer Dauerspende aus der App gehören', async () => {
    const { handlers, mailer } = setup();
    await handlers['invoice.paid']!(event('invoice.paid', invoice({ parent: null })));
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('markiert eine gekündigte Dauerspende als beendet und informiert die Spender:in', async () => {
    const { handlers, sentMail, subscribers } = setup();
    await handlers['customer.subscription.deleted']!(event('customer.subscription.deleted', subscription()));

    expect(subscribers.entries.get('a'.repeat(64))?.endedAt).toBeInstanceOf(Date);
    expect(sentMail().subject).toBe('Deine Dauerspende an DEMOCRACY ist beendet');
    expect(sentMail().text).toContain('wie gewünscht beendet');
  });

  it('nennt fehlgeschlagene Abbuchungen als Grund, wenn Stripe deshalb beendet hat', async () => {
    const { handlers, sentMail } = setup();
    await handlers['customer.subscription.deleted']!(
      event('customer.subscription.deleted', subscription({ cancellation_details: { reason: 'payment_failed' } })),
    );
    expect(sentMail().text).toContain('Abbuchungen sind leider fehlgeschlagen');
  });

  it('schickt keine Mail, wenn nie etwas abgebucht wurde (ersetzte Erstzahlung)', async () => {
    const { handlers, mailer, subscribers } = setup({ paidInvoices: 0 });
    await handlers['customer.subscription.deleted']!(event('customer.subscription.deleted', subscription()));

    expect(subscribers.entries.get('a'.repeat(64))?.endedAt).toBeInstanceOf(Date);
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('beendet incomplete_expired ohne Mail', async () => {
    const { handlers, mailer, subscribers } = setup();
    await handlers['customer.subscription.updated']!(
      event('customer.subscription.updated', subscription({ status: 'incomplete_expired' })),
    );
    expect(subscribers.entries.get('a'.repeat(64))?.endedAt).toBeInstanceOf(Date);
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('lässt andere Subscription-Updates unverändert', async () => {
    const { handlers, mailer, subscribers } = setup();
    await handlers['customer.subscription.updated']!(
      event('customer.subscription.updated', subscription({ status: 'active' })),
    );
    expect(subscribers.entries.get('a'.repeat(64))?.endedAt).toBeNull();
    expect(mailer.send).not.toHaveBeenCalled();
  });
});
