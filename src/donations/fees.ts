import type { DonationFeeConfig, DonationInterval } from './config';

/**
 * Gebührenübernahme (FR-001b, research.md R4).
 *
 * Der belastete Betrag T wird so hochgerechnet, dass nach Abzug der Gebühr mindestens der gewählte
 * Betrag A beim Verein ankommt – auf Basis des teureren aus Standard-EWR-Karte und SEPA, bei
 * monatlichen Spenden zuzüglich Stripe-Billing:
 *
 *   T = max( (A + fixCard) / (1 − pctCard − b), (A + fixSepa) / (1 − b) ),  b = billingPct nur monatlich
 *
 * Gerechnet wird in Cent und Basispunkten (1 % = 100 bp) mit Ganzzahlen, aufgerundet auf volle Cent,
 * damit keine Gleitkomma-Artefakte (z. B. 1040.9999…) entstehen. Die App verwendet dieselbe Formel
 * nur zur Anzeige; verbindlich ist das Ergebnis dieses Moduls.
 */

const BASIS_POINTS = 10_000;

const toBasisPoints = (percent: number): number => Math.round(percent * 100);

/** Ganzzahlige Division mit Aufrunden für positive Werte. */
const ceilDiv = (numerator: number, denominator: number): number =>
  Math.floor((numerator + denominator - 1) / denominator);

const grossUp = (amountCents: number, fixedCents: number, percentBp: number): number => {
  const denominator = BASIS_POINTS - percentBp;
  if (denominator <= 0) {
    throw new RangeError('Gebührensätze ergeben 100 % oder mehr');
  }
  return ceilDiv((amountCents + fixedCents) * BASIS_POINTS, denominator);
};

export const chargedAmountCents = (
  baseAmountCents: number,
  options: { coverFees: boolean; interval: DonationInterval },
  fees: DonationFeeConfig,
): number => {
  if (!Number.isInteger(baseAmountCents) || baseAmountCents <= 0) {
    throw new RangeError('Betrag muss eine positive ganze Zahl in Cent sein');
  }
  if (!options.coverFees) {
    return baseAmountCents;
  }
  const billingBp = options.interval === 'monthly' ? toBasisPoints(fees.billingPct) : 0;
  const viaCard = grossUp(baseAmountCents, fees.cardFixedCents, toBasisPoints(fees.cardPct) + billingBp);
  const viaSepa = grossUp(baseAmountCents, fees.sepaFixedCents, billingBp);
  return Math.max(viaCard, viaSepa);
};
