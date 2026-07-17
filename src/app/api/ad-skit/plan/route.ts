import { withAtlas } from '@/lib/request-context';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { deductCredits, grantCredits } from '@/lib/credits';
import { planSkit, isValidPlanModel, DEFAULT_PLAN_MODEL, AD_SKIT_COSTS, AD_SKIT_TEMPLATE_ID } from '@/lib/ad-skit';

export const maxDuration = 60;

async function __byokPOST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const product = typeof body.product === 'string' ? body.product.trim().slice(0, 600) : '';
  const languageCode = typeof body.languageCode === 'string' ? body.languageCode.slice(0, 8) : 'zh';
  const styleKey = typeof body.styleKey === 'string' ? body.styleKey.slice(0, 20) : 'funny';
  const llmModel = isValidPlanModel(body.llmModel) ? body.llmModel : DEFAULT_PLAN_MODEL;
  if (product.length < 2) return NextResponse.json({ error: 'product_required' }, { status: 400 });

  try {
    await deductCredits(session.user.id, AD_SKIT_COSTS.plan, 'generate', AD_SKIT_TEMPLATE_ID + ':plan');
  } catch {
    return NextResponse.json({ error: 'insufficient_credits' }, { status: 402 });
  }
  try {
    const plan = await planSkit({ product, languageCode, styleKey, llmModel });
    return NextResponse.json({ plan });
  } catch (e) {
    await grantCredits(session.user.id, AD_SKIT_COSTS.plan, 'refund', AD_SKIT_TEMPLATE_ID + ':plan');
    return NextResponse.json({ error: 'plan_failed', detail: String(e) }, { status: 502 });
  }
}

export const POST = withAtlas(__byokPOST);
