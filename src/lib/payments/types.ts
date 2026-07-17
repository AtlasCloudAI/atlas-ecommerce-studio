import type { CreditPack } from '@/config/pricing';

export interface CheckoutArgs {
  userId: string;
  email?: string | null;
  pack: CreditPack;
  origin: string;
}

/**
 * Two payment shapes the starter ships with:
 *  - mode 'checkout': hosted payment page (Stripe). Dev keeps the revenue.
 *  - mode 'redeem':   user enters a code (Atlas credits). No Stripe needed.
 * A provider implements the method matching its mode.
 */
export interface PaymentProvider {
  id: 'stripe' | 'atlas';
  mode: 'checkout' | 'redeem';
  createCheckout?(args: CheckoutArgs): Promise<{ url: string }>;
  redeem?(userId: string, code: string): Promise<{ amount: number }>;
}
