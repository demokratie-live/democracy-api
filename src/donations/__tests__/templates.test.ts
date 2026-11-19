import { describe, it, expect } from 'vitest';
import { loadDonationConfig } from '../config';
import { formatDate, formatEuro, oneTimeConfirmationMail } from '../mail/templates';

const base = loadDonationConfig({});

const mail = (overrides: Record<string, string> = {}) =>
  oneTimeConfirmationMail({
    to: 'spender@example.org',
    chargedAmountCents: 1000,
    baseAmountCents: 1000,
    coverFees: false,
    paidAt: 1763550000,
    paymentMethodLabel: 'Karte (•••• 4242)',
    config: loadDonationConfig(overrides),
  });

describe('Mail-Vorlagen', () => {
  it('formatiert Beträge und Datum deutsch', () => {
    expect(formatEuro(1041)).toMatch(/^10,41\s€$/);
    expect(formatDate(1763550000)).toBe('19. November 2025');
  });

  it('enthält alle Angaben für den vereinfachten Zuwendungsnachweis (FR-018)', () => {
    const { text } = mail();
    expect(text).toContain('Empfänger:   DEMOCRACY Deutschland e.V.');
    expect(text).toContain('Steuerbegünstigter Zweck: Förderung des demokratischen Staatswesens');
    expect(text).toContain('Spende (Zuwendung ohne Gegenleistung), nicht um einen Mitgliedsbeitrag');
    expect(text).toContain('Für Spenden bis 300 €');
    expect(text).toContain(base.legal.simplifiedReceiptUrl);
    expect(text).toContain('vollständigen Namen und deine');
    expect(text).not.toContain('inklusive');
  });

  it('verweist ohne Freistellungsdaten auf den Gemeinnützigkeitsnachweis und nutzt sie, sobald gesetzt', () => {
    expect(mail().text).toContain(
      `Freistellung: siehe Nachweis der Gemeinnützigkeit – ${base.legal.nonprofitProofUrl}`,
    );
    const configured = mail({
      DONATION_RECEIPT_EXEMPTION: 'Freistellungsbescheid des Finanzamts Göttingen, StNr. 20/000/00000, vom 01.01.2026',
    });
    expect(configured.text).toContain('Freistellung: Freistellungsbescheid des Finanzamts Göttingen');
  });
});
