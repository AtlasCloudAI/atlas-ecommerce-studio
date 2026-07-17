import type { PaymentProvider } from './types';
import { stripeProvider } from './stripe';
import { atlasProvider } from './atlas';

export type { PaymentProvider, CheckoutArgs } from './types';

function selected(): string {
  return (process.env.PAYMENT_PROVIDER || 'stripe').toLowerCase();
}

export function paymentProvider(): PaymentProvider {
  return selected() === 'atlas' ? atlasProvider : stripeProvider;
}

export function paymentMode(): 'checkout' | 'redeem' {
  return selected() === 'atlas' ? 'redeem' : 'checkout';
}
