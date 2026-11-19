import type Stripe from 'stripe';

/** Gemeinsame Hilfen der Webhook-Handler (Einzel- und Dauerspenden). */

export const idOf = (value: string | { id: string } | null | undefined): string | null =>
  typeof value === 'string' ? value : (value?.id ?? null);

export const paymentMethodLabel = (method: Stripe.PaymentMethod | null): string => {
  if (!method) return 'unbekannt';
  switch (method.type) {
    case 'card': {
      const wallet = method.card?.wallet?.type;
      if (wallet === 'apple_pay') return 'Apple Pay';
      if (wallet === 'google_pay') return 'Google Pay';
      return method.card?.last4 ? `Karte (•••• ${method.card.last4})` : 'Karte';
    }
    case 'sepa_debit':
      return method.sepa_debit?.last4 ? `SEPA-Lastschrift (•••• ${method.sepa_debit.last4})` : 'SEPA-Lastschrift';
    case 'paypal':
      return 'PayPal';
    default:
      return method.type;
  }
};

export const customerEmail = async (stripe: Stripe, customerId: string | null): Promise<string | null> => {
  if (!customerId) return null;
  const customer = await stripe.customers.retrieve(customerId);
  if ('deleted' in customer && customer.deleted) return null;
  return (customer as Stripe.Customer).email ?? null;
};

export const retrievePaymentMethod = async (stripe: Stripe, id: string | null): Promise<Stripe.PaymentMethod | null> =>
  id ? stripe.paymentMethods.retrieve(id) : null;
