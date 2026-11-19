import { describe, it, expect } from 'vitest';
import { loadDonationConfig } from '../config';
import { DonationError } from '../errors';
import {
  normalizeEmail,
  validateAmountCents,
  validateDonationRequest,
  validateIdempotencyKey,
  validatePaymentMethodId,
  validatePlatform,
} from '../validation';

const config = loadDonationConfig({});

const expectCode = (fn: () => unknown, code: string) => {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(DonationError);
    expect((error as DonationError).code).toBe(code);
    return;
  }
  throw new Error(`erwarteter Fehler ${code} wurde nicht geworfen`);
};

const validBody = {
  amountCents: 1000,
  coverFees: true,
  email: '  spender@example.org ',
  paymentMethodId: 'pm_123abc',
  platform: 'ios',
  appVersion: '1.6.0',
};

describe('validateAmountCents', () => {
  it('akzeptiert Beträge zwischen Mindest- und Höchstbetrag', () => {
    expect(validateAmountCents(500, config)).toBe(500);
    expect(validateAmountCents(100000, config)).toBe(100000);
  });

  it.each([499, 100001, 10.5, '1000', null, undefined, Number.NaN])('lehnt %s ab', (value) => {
    expectCode(() => validateAmountCents(value, config), 'amount_out_of_range');
  });
});

describe('normalizeEmail', () => {
  it('trimmt gültige Adressen und behandelt leere Werte als nicht angegeben', () => {
    expect(normalizeEmail(' a@b.de ')).toBe('a@b.de');
    expect(normalizeEmail('')).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
  });

  it.each(['kein-at', 'a@b', 'a b@c.de', 42, `${'x'.repeat(250)}@b.de`])('lehnt %s ab', (value) => {
    expectCode(() => normalizeEmail(value), 'invalid_email');
  });
});

describe('Einzelfelder', () => {
  it('prüft die Plattform', () => {
    expect(validatePlatform('android')).toBe('android');
    expectCode(() => validatePlatform('web'), 'invalid_platform');
  });

  it('prüft die PaymentMethod-ID', () => {
    expect(validatePaymentMethodId('pm_1Abc')).toBe('pm_1Abc');
    expectCode(() => validatePaymentMethodId('tok_123'), 'invalid_payment_method');
    expectCode(() => validatePaymentMethodId('pm_'), 'invalid_payment_method');
  });

  it('verlangt einen UUID-v4-Idempotency-Key', () => {
    expect(validateIdempotencyKey('3F2504E0-4F89-41D3-9A0C-0305E82C3301')).toBe('3f2504e0-4f89-41d3-9a0c-0305e82c3301');
    expectCode(() => validateIdempotencyKey('3f2504e0-4f89-11d3-9a0c-0305e82c3301'), 'invalid_idempotency_key');
    expectCode(() => validateIdempotencyKey(undefined), 'invalid_idempotency_key');
  });
});

describe('validateDonationRequest', () => {
  it('normalisiert einen gültigen Request', () => {
    expect(validateDonationRequest(validBody, 'one_time', config)).toEqual({
      amountCents: 1000,
      coverFees: true,
      email: 'spender@example.org',
      paymentMethodId: 'pm_123abc',
      platform: 'ios',
      appVersion: '1.6.0',
      expectedChargedAmountCents: null,
    });
  });

  it('erlaubt einmalige Spenden ohne E-Mail und ohne Gebührenübernahme', () => {
    const { email, coverFees } = validateDonationRequest(
      { ...validBody, email: undefined, coverFees: undefined },
      'one_time',
      config,
    );
    expect(email).toBeNull();
    expect(coverFees).toBe(false);
  });

  it('verlangt bei monatlichen Spenden eine E-Mail', () => {
    expectCode(() => validateDonationRequest({ ...validBody, email: '' }, 'monthly', config), 'email_required');
  });

  it('verwirft ungültige appVersion stillschweigend', () => {
    expect(validateDonationRequest({ ...validBody, appVersion: '<script>' }, 'one_time', config).appVersion).toBeNull();
  });

  it.each([null, [], 'text', { ...validBody, coverFees: 'ja' }])('lehnt ungültige Bodies ab: %s', (body) => {
    expectCode(() => validateDonationRequest(body, 'one_time', config), 'invalid_request');
  });
});
