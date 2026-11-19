import { describe, it, expect } from 'vitest';
import { chargedAmountCents } from '../fees';
import type { DonationFeeConfig } from '../config';

const fees: DonationFeeConfig = { cardPct: 1.5, cardFixedCents: 25, sepaFixedCents: 35, billingPct: 0.7 };

describe('chargedAmountCents', () => {
  it('lässt den Betrag ohne Gebührenübernahme unverändert', () => {
    expect(chargedAmountCents(500, { coverFees: false, interval: 'monthly' }, fees)).toBe(500);
    expect(chargedAmountCents(1000, { coverFees: false, interval: 'one_time' }, fees)).toBe(1000);
  });

  it('rechnet 5 € monatlich auf 5,39 € hoch (SEPA + Billing ist teurer als Karte)', () => {
    expect(chargedAmountCents(500, { coverFees: true, interval: 'monthly' }, fees)).toBe(539);
  });

  it('rechnet 10 € einmalig auf 10,41 € hoch (Karte ist teurer als SEPA)', () => {
    expect(chargedAmountCents(1000, { coverFees: true, interval: 'one_time' }, fees)).toBe(1041);
  });

  it('ist der kleinste Betrag, der die Gebühr beider Zahlungsarten vollständig deckt', () => {
    for (const interval of ['one_time', 'monthly'] as const) {
      const billing = interval === 'monthly' ? fees.billingPct / 100 : 0;
      // Netto beim Verein (in Cent, ohne Rundung) für einen belasteten Betrag
      const netCard = (total: number) => total - total * (fees.cardPct / 100 + billing) - fees.cardFixedCents;
      const netSepa = (total: number) => total - total * billing - fees.sepaFixedCents;
      const covers = (total: number, base: number) => netCard(total) >= base - 1e-9 && netSepa(total) >= base - 1e-9;

      for (let base = 500; base <= 100000; base += 37) {
        const total = chargedAmountCents(base, { coverFees: true, interval }, fees);
        expect(covers(total, base)).toBe(true);
        expect(covers(total - 1, base)).toBe(false);
      }
    }
  });

  it('weist ungültige Beträge zurück', () => {
    expect(() => chargedAmountCents(0, { coverFees: true, interval: 'one_time' }, fees)).toThrow(RangeError);
    expect(() => chargedAmountCents(9.5, { coverFees: true, interval: 'one_time' }, fees)).toThrow(RangeError);
  });

  it('weist Gebührensätze von 100 % oder mehr zurück', () => {
    expect(() =>
      chargedAmountCents(500, { coverFees: true, interval: 'monthly' }, { ...fees, cardPct: 99.5, billingPct: 0.5 }),
    ).toThrow(RangeError);
  });
});
