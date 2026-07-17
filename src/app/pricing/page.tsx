import { CREDIT_PACKS } from '@/config/pricing';
import { paymentMode } from '@/lib/payments';
import PricingClient from './PricingClient';

export default function PricingPage() {
  return <PricingClient packs={CREDIT_PACKS} mode={paymentMode()} />;
}
