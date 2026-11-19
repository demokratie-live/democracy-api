import { afterEach, describe, it, expect, vi } from 'vitest';
import type Stripe from 'stripe';
import { createAccountAlertHandlers } from '../handlers/accountAlerts';
import { donationLog } from '../log';

const event = (type: string, object: Record<string, unknown>) =>
  ({ id: 'evt_1', type, created: 1_763_550_000, data: { object } }) as unknown as Stripe.Event;

const setup = (customerSource: string | null = 'democracy-app') => {
  const stripe = {
    customers: {
      retrieve: vi.fn(async () => ({ id: 'cus_1', metadata: customerSource ? { source: customerSource } : {} })),
    },
    paymentIntents: { retrieve: vi.fn(async () => ({ id: 'pi_1', metadata: {}, customer: 'cus_1' })) },
    paymentMethods: { retrieve: vi.fn(async () => ({ id: 'pm_1', customer: 'cus_1' })) },
  };
  const warn = vi.spyOn(donationLog, 'warn').mockImplementation(() => undefined);
  return { stripe, warn, handlers: createAccountAlertHandlers({ stripe: stripe as unknown as Stripe }) };
};

afterEach(() => vi.restoreAllMocks());

describe('Hinweise für den Kassenwart (T062)', () => {
  it('meldet Erstattungen von Einzelspenden aus der App ohne Customer-Abfrage', async () => {
    const { handlers, warn, stripe } = setup();
    await handlers['charge.refunded']!(
      event('charge.refunded', { id: 'ch_1', metadata: { source: 'democracy-app' }, customer: null }),
    );
    expect(warn).toHaveBeenCalledWith('Zahlung erstattet (app)', { stripeId: 'ch_1', eventId: 'evt_1', code: 'app' });
    expect(stripe.customers.retrieve).not.toHaveBeenCalled();
  });

  it('meldet auch Erstattungen anderer Quellen (z. B. DonorBox)', async () => {
    const { handlers, warn } = setup(null);
    await handlers['charge.refunded']!(event('charge.refunded', { id: 'ch_2', metadata: {}, customer: 'cus_9' }));
    expect(warn).toHaveBeenCalledWith('Zahlung erstattet (andere)', expect.objectContaining({ stripeId: 'ch_2' }));
  });

  it('ordnet Rückbuchungen über PaymentIntent und Customer zu (Dauerspende)', async () => {
    const { handlers, warn, stripe } = setup();
    await handlers['charge.dispute.created']!(
      event('charge.dispute.created', { id: 'dp_1', payment_intent: 'pi_1', reason: 'fraudulent' }),
    );
    expect(stripe.paymentIntents.retrieve).toHaveBeenCalledWith('pi_1');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Rückbuchung/Widerspruch eingegangen (app)'), {
      stripeId: 'dp_1',
      eventId: 'evt_1',
      code: 'app/fraudulent',
    });
  });

  it('meldet nur inaktive SEPA-Mandate', async () => {
    const { handlers, warn } = setup();
    await handlers['mandate.updated']!(
      event('mandate.updated', { id: 'mandate_1', status: 'active', payment_method: 'pm_1' }),
    );
    expect(warn).not.toHaveBeenCalled();

    await handlers['mandate.updated']!(
      event('mandate.updated', { id: 'mandate_2', status: 'inactive', payment_method: 'pm_1' }),
    );
    expect(warn).toHaveBeenCalledWith(
      'SEPA-Mandat nicht mehr gültig (app)',
      expect.objectContaining({ stripeId: 'mandate_2' }),
    );
  });

  it('meldet auch dann, wenn die Herkunft nicht ermittelt werden kann', async () => {
    const { handlers, warn, stripe } = setup();
    stripe.customers.retrieve.mockRejectedValueOnce(new Error('permission'));
    await handlers['charge.refunded']!(event('charge.refunded', { id: 'ch_3', metadata: {}, customer: 'cus_1' }));
    expect(warn).toHaveBeenCalledWith('Zahlung erstattet (unbekannt)', expect.objectContaining({ stripeId: 'ch_3' }));
  });
});
