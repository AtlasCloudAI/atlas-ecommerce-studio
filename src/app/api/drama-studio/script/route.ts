import { withAtlas } from '@/lib/request-context';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { DRAMA_SCRIPT_MODEL, draftScript } from '@/lib/drama/prompt';
import { chargeSync, refundSync, chargeErrorResponse } from '@/lib/marketing-studio/gen-task';

export const maxDuration = 120;

// 剧本长文本比单张出方案贵些,单独定价。
const DRAMA_SCRIPT_COST = 5;

// 剧情长剧本:需登录 + 扣 DRAMA_SCRIPT_COST;只返回真实 AI 剧本。
// LLM 失败时退款并返回错误,避免把本地兜底剧本误当作 AI 产物继续出片。
async function __byokPOST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const uid = session.user.id;

  const body = await req.json().catch(() => ({}));
  const topic = typeof body.topic === 'string' ? body.topic.trim().slice(0, 2000) : '';
  const style = typeof body.style === 'string' ? body.style : 'epic';
  const lang = typeof body.lang === 'string' ? body.lang : '中文';
  // 分镜数量默认交给 AI 按剧情节奏决定(4-6 段);前端显式传 segments 时作为"精确段数"要求。
  const targetSegments = body.segments ? Math.max(2, Math.min(8, Number(body.segments))) : undefined;
  if (!topic) return NextResponse.json({ error: 'topic_required' }, { status: 400 });

  try {
    await chargeSync(uid, DRAMA_SCRIPT_COST, 'drama:script');
  } catch (e) {
    return chargeErrorResponse(e, 'drama/script');
  }

  const input = { topic, style, lang, targetSegments };
  try {
    const script = await draftScript(input);
    return NextResponse.json({ script, model: DRAMA_SCRIPT_MODEL });
  } catch (e) {
    await refundSync(uid, DRAMA_SCRIPT_COST, 'drama:script');
    console.error('[drama/script] atlas error:', String(e));
    const detail = String(e);
    const status = detail.includes('timed out') ? 504 : 502;
    return NextResponse.json({ error: status === 504 ? 'script_timeout_refunded' : 'script_failed_refunded', refunded: true, detail }, { status });
  }
}

export const POST = withAtlas(__byokPOST);
