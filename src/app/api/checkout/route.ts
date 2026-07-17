import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { paymentProvider } from '@/lib/payments';
import { getPack } from '@/config/pricing';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { packId } = await req.json().catch(() => ({}));
  const pack = getPack(packId);
  if (!pack) return NextResponse.json({ error: 'unknown_pack' }, { status: 400 });

  const provider = paymentProvider();
  if (provider.mode !== 'checkout' || !provider.createCheckout)
    return NextResponse.json({ error: 'checkout_not_enabled' }, { status: 400 });

  const origin = req.headers.get('origin') || process.env.NEXTAUTH_URL || '';
  try {
    const { url } = await provider.createCheckout({
      userId: session.user.id,
      email: session.user.email,
      pack,
      origin,
    });
    return NextResponse.json({ url });
  } catch (e) {
    return NextResponse.json({ error: 'checkout_failed', detail: String(e) }, { status: 502 });
  }
}
