import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { paymentProvider } from '@/lib/payments';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { code } = await req.json().catch(() => ({}));
  if (!code) return NextResponse.json({ error: 'empty_code' }, { status: 400 });

  const provider = paymentProvider();
  if (provider.mode !== 'redeem' || !provider.redeem)
    return NextResponse.json({ error: 'redeem_not_enabled' }, { status: 400 });

  try {
    const { amount } = await provider.redeem(session.user.id, code);
    return NextResponse.json({ amount });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
