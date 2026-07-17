import { withAtlas } from '@/lib/request-context';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { draftMarketingPlan, buildFallbackMarketingPlan, type PlanInput } from '@/lib/marketing-studio/prompt';
import { cleanText, normalizeRatio, normalizeShotCount, MK_PLAN_COST } from '@/lib/marketing-studio/workflow';
import { getFormat } from '@/lib/marketing-studio/formats';
import { chargeSync, refundSync, chargeErrorResponse } from '@/lib/marketing-studio/gen-task';

export const maxDuration = 60;

// 出方案(LLM):需登录 + 扣 MK_PLAN_COST;LLM 失败退款并返回兜底方案(带 fallback 标记 + detail 供前端提示),Atlas 报错记日志。
async function __byokPOST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const uid = session.user.id;

  const body = await req.json().catch(() => ({}));
  const product = cleanText(body.product, '', 2000);
  const character = cleanText(body.character, '', 600);
  const formatId = getFormat(cleanText(body.formatId, 'ugc', 40)).id;
  const hookId = cleanText(body.hookId, 'none', 40);
  const settingId = cleanText(body.settingId, 'none', 40);
  const avatarId = cleanText(body.avatarId, 'none', 40);
  const nShots = normalizeShotCount(body.nShots);
  const lang = cleanText(body.lang, '英文', 20);
  const ratio = normalizeRatio(body.ratio);
  if (!product) return NextResponse.json({ error: 'product_required' }, { status: 400 });

  try {
    await chargeSync(uid, MK_PLAN_COST, 'marketing:plan');
  } catch (e) {
    return chargeErrorResponse(e, 'marketing/plan');
  }

  const input: PlanInput = { product, character, formatId, hookId, settingId, avatarId, nShots, lang, ratio };
  try {
    const plan = await draftMarketingPlan(input);
    return NextResponse.json({ plan });
  } catch (e) {
    // AI 出方案失败:退回积分,给兜底方案,Atlas 原文记日志 + 返回 detail 供前端提示。
    await refundSync(uid, MK_PLAN_COST, 'marketing:plan');
    console.error('[marketing/plan] atlas error:', String(e));
    return NextResponse.json({ plan: buildFallbackMarketingPlan(input), fallback: true, detail: String(e) });
  }
}

export const POST = withAtlas(__byokPOST);
