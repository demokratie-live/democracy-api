import { describe, it, expect } from 'vitest';
import { DonationConfigError, loadDonationConfig } from '../config';

const stripeTestEnv = {
  DONATIONS_ENABLED: 'true',
  STRIPE_SECRET_KEY: 'rk_test_abc',
  STRIPE_PUBLISHABLE_KEY: 'pk_test_abc',
  STRIPE_WEBHOOK_SECRET: 'whsec_abc',
  STRIPE_DONATION_PRODUCT_ID: 'prod_abc',
  STRIPE_PAYMENT_METHOD_CONFIGURATION_ID: 'pmc_abc',
};

const problemsOf = (env: Record<string, string>) => {
  try {
    loadDonationConfig(env);
  } catch (error) {
    expect(error).toBeInstanceOf(DonationConfigError);
    return (error as DonationConfigError).problems;
  }
  return [];
};

describe('loadDonationConfig', () => {
  it('ist ohne Umgebungsvariablen deaktiviert und nutzt die Standardwerte aus data-model.md', () => {
    const config = loadDonationConfig({});
    expect(config.enabled).toBe(false);
    expect(config.minAmountCents).toBe(500);
    expect(config.maxAmountCents).toBe(100000);
    expect(config.defaultInterval).toBe('monthly');
    expect(config.presets.monthly).toEqual([500, 1000, 1500, 2500, 5000]);
    expect(config.stripe.paymentMethodConfigurationId).toBeNull();
    expect(config.fees).toEqual({ cardPct: 1.5, cardFixedCents: 25, sepaFixedCents: 35, billingPct: 0.7 });
    expect(config.bankTransfer.iban).toBe('DE83 2605 0001 0056 1290 91');
  });

  it('lädt eine vollständige Testmodus-Konfiguration', () => {
    const config = loadDonationConfig({
      ...stripeTestEnv,
      DONATION_PRESETS_ONE_TIME: '500, 2000',
    });
    expect(config.enabled).toBe(true);
    expect(config.stripe.paymentMethodConfigurationId).toBe('pmc_abc');
    expect(config.presets.one_time).toEqual([500, 2000]);
  });

  it('verlangt bei aktiviertem Modul alle Stripe-Werte', () => {
    const problems = problemsOf({ DONATIONS_ENABLED: 'true' });
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining('STRIPE_SECRET_KEY'),
        expect.stringContaining('STRIPE_PUBLISHABLE_KEY'),
        expect.stringContaining('STRIPE_WEBHOOK_SECRET'),
        expect.stringContaining('STRIPE_DONATION_PRODUCT_ID'),
        expect.stringContaining('STRIPE_PAYMENT_METHOD_CONFIGURATION_ID'),
      ]),
    );
  });

  it('erkennt gemischte Test-/Live-Schlüssel', () => {
    expect(problemsOf({ ...stripeTestEnv, STRIPE_PUBLISHABLE_KEY: 'pk_live_abc' })).toEqual([
      expect.stringContaining('unterschiedlichen Modi'),
    ]);
  });

  it('lehnt einen Publishable Key als Secret Key ab', () => {
    expect(problemsOf({ ...stripeTestEnv, STRIPE_SECRET_KEY: 'pk_test_abc' })).toEqual([
      expect.stringContaining('STRIPE_SECRET_KEY muss mit sk_ oder rk_'),
    ]);
  });

  it.each([
    [{ DONATION_MIN_CENTS: '10' }, 'Stripe-Minimum'],
    [{ DONATION_MIN_CENTS: '2000', DONATION_MAX_CENTS: '1000' }, 'DONATION_MAX_CENTS'],
    [{ DONATION_PRESETS_MONTHLY: '100,500' }, 'außerhalb'],
    [{ STRIPE_PAYMENT_METHOD_CONFIGURATION_ID: 'card,sepa_debit' }, 'pmc_'],
    [{ STRIPE_PORTAL_CONFIGURATION_ID: 'portal' }, 'bpc_'],
    [{ DONATION_DEFAULT_INTERVAL: 'weekly' }, 'DONATION_DEFAULT_INTERVAL'],
    [{ DONATION_MIN_CENTS: '5,00' }, 'ganze Zahl'],
  ])('meldet ungültige Werte (%o)', (env, fragment) => {
    expect(problemsOf(env as Record<string, string>).join(' ')).toContain(fragment);
  });
});
