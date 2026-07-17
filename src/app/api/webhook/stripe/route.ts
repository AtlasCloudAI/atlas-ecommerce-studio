import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { stripe } from '@/lib/payments/stripe';
import { prisma } from '@/lib/prisma';
import { grantCredits } from '@/lib/credits';

// Stripe requires the raw body to verify the signature.
export async function POST(req: Request) {
  const sig = req.headers.get('stripe-signature');
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) return new Response('webhook not configured', { status: 400 });

  const body = await req.text();
  let event;
  try {
    // Workers 无 Node crypto:必须用 async + SubtleCrypto 验签,否则付款成功但积分不到账。
    event = await stripe.webhooks.constructEventAsync(body, sig, secret, undefined, Stripe.createSubtleCryptoProvider());
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(`Webhook Error: ${msg}`, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const s = event.data.object as { id: string; metadata?: Record<string, string> };
    const userId = s.metadata?.userId;
    const credits = parseInt(s.metadata?.credits || '0', 10);
    // Idempotency: don't double-grant if Stripe retries the webhook.
    const already = await prisma.creditLedger.findFirst({
      where: { ref: s.id, reason: 'purchase' },
    });
    if (!already && userId && credits > 0) {
      await grantCredits(userId, credits, 'purchase', s.id);
    }
  }

  return NextResponse.json({ received: true });
}
