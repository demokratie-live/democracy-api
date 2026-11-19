import { describe, it, expect, vi } from 'vitest';
import type Stripe from 'stripe';
import { loadDonationConfig } from '../config';
import { createOneTimeHandlers } from '../handlers/oneTime';
import { testEnv } from './helpers';

const config = loadDonationConfig(testEnv);

const intent = (overrides: Record<string, unknown> = {}) => ({
  id: 'pi_1',
  object: 'payment_intent',
  amount: 1041,
  amount_received: 1041,
  created: 1763550000,
  customer: 'cus_1',
  payment_method: 'pm_1',
  metadata: { source: 'democracy-app', interval: 'one_time', base_amount: '1000', cover_fees: 'true' },
  last_payment_error: null,
  ...overrides,
});

const event = (type: string, object: Record<string, unknown>) =>
  ({ id: 'evt_1', type, created: 1763550000, data: { object } }) as unknown as Stripe.Event;

const setup = ({
  customerEmail = 'spender@example.org' as string | null,
  paymentMethod = {
    type: 'card',
    card: { wallet: { type: 'apple_pay' }, last4: '4242' },
    billing_details: {},
  } as Record<string, unknown>,
} = {}) => {
  const stripe = {
    customers: { retrieve: vi.fn(async () => ({ id: 'cus_1', email: customerEmail })) },
    paymentMethods: { retrieve: vi.fn(async () => paymentMethod) },
  };
  const mailer = { send: vi.fn(async (_mail: { to: string; subject: string; text: string }) => undefined) };
  const handlers = createOneTimeHandlers({ stripe: stripe as unknown as Stripe, mailer, config });
  return { stripe, mailer, handlers };
};

describe('Webhook-Handler Einzelspende', () => {
  it('schickt nach erfolgreicher Zahlung eine Bestätigung an die E-Mail der Spender:in', async () => {
    const { handlers, mailer } = setup();
    await handlers['payment_intent.succeeded']!(event('payment_intent.succeeded', intent()));

    expect(mailer.send).toHaveBeenCalledTimes(1);
    const mail = mailer.send.mock.calls[0][0] as { to: string; subject: string; text: string };
    expect(mail.to).toBe('spender@example.org');
    expect(mail.subject).toBe('Danke für Deine Spende an DEMOCRACY');
    expect(mail.text).toMatch(/Betrag:\s+10,41\s€ \(inklusive 0,41\s€ freiwillig übernommener Zahlungsgebühren\)/);
    expect(mail.text).toContain('Zahlungsart: Apple Pay');
    expect(mail.text).toContain('nicht um einen Mitgliedsbeitrag');
    expect(mail.text).toContain(config.legal.simplifiedReceiptUrl);
  });

  it('nutzt die E-Mail der Zahlungsmethode, wenn kein Customer existiert (z. B. SEPA ohne App-E-Mail)', async () => {
    const { handlers, mailer, stripe } = setup({
      paymentMethod: {
        type: 'sepa_debit',
        sepa_debit: { last4: '3000' },
        billing_details: { email: 'sepa@example.org' },
      },
    });
    await handlers['payment_intent.succeeded']!(event('payment_intent.succeeded', intent({ customer: null })));

    expect(stripe.customers.retrieve).not.toHaveBeenCalled();
    const mail = mailer.send.mock.calls[0][0] as { to: string; text: string };
    expect(mail.to).toBe('sepa@example.org');
    expect(mail.text).toContain('SEPA-Lastschrift (•••• 3000)');
  });

  it('verschickt nichts, wenn keine E-Mail-Adresse bekannt ist', async () => {
    const { handlers, mailer } = setup({ customerEmail: null });
    await handlers['payment_intent.succeeded']!(event('payment_intent.succeeded', intent()));
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('ignoriert Zahlungen von Dauerspenden (die laufen über invoice.paid)', async () => {
    const { handlers, mailer, stripe } = setup();
    await handlers['payment_intent.succeeded']!(
      event('payment_intent.succeeded', intent({ metadata: { source: 'democracy-app', interval: 'monthly' } })),
    );
    expect(stripe.paymentMethods.retrieve).not.toHaveBeenCalled();
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('meldet nur gescheiterte Lastschriften per Mail, keine abgelehnten Karten', async () => {
    const card = setup();
    await card.handlers['payment_intent.payment_failed']!(
      event(
        'payment_intent.payment_failed',
        intent({ last_payment_error: { payment_method: { type: 'card', billing_details: {} } } }),
      ),
    );
    expect(card.mailer.send).not.toHaveBeenCalled();

    const sepa = setup();
    await sepa.handlers['payment_intent.payment_failed']!(
      event(
        'payment_intent.payment_failed',
        intent({ last_payment_error: { payment_method: { type: 'sepa_debit', billing_details: {} } } }),
      ),
    );
    const mail = sepa.mailer.send.mock.calls[0][0] as { to: string; subject: string; text: string };
    expect(mail.subject).toBe('Deine Spende an DEMOCRACY konnte nicht eingezogen werden');
    expect(mail.text).toContain(config.bankTransfer.iban);
  });
});
