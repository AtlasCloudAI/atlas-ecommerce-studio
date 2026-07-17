import { withAtlas } from '@/lib/request-context';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { deductCredits, grantCredits } from '@/lib/credits';
import { submitSkitVideo, VIDEO_MODEL, AD_SKIT_TEMPLATE_ID } from '@/lib/ad-skit';
import { videoCredits } from '@/lib/video-pricing';

export const maxDuration = 60;

// seedance ref-to-video 固定 720p / 15s:按秒×分辨率动态计费(不再固定 AD_SKIT_COSTS.video)。
const AD_SKIT_VIDEO_COST = videoCredits(VIDEO_MODEL, '720p', 15);

async function __byokPOST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const productUrls: string[] = Array.isArray(body.productUrls)
    ? body.productUrls.filter((u: unknown) => typeof u === 'string' && u.startsWith('http')).slice(0, 4)
    : typeof body.productUrl === 'string' && body.productUrl.startsWith('http')
      ? [body.productUrl]
      : [];
  const videoPrompt = typeof body.videoPrompt === 'string' ? body.videoPrompt.slice(0, 700) : '';
  const duration = Math.max(5, Math.min(15, Number(body.duration) || 15));
  if (!productUrls.length) return NextResponse.json({ error: 'product_url_required' }, { status: 400 });
  if (videoPrompt.length < 5) return NextResponse.json({ error: 'prompt_required' }, { status: 400 });

  try {
    await deductCredits(session.user.id, AD_SKIT_VIDEO_COST, 'generate', AD_SKIT_TEMPLATE_ID + ':video');
  } catch {
    return NextResponse.json({ error: 'insufficient_credits' }, { status: 402 });
  }
  let res;
  try {
    res = await submitSkitVideo(productUrls, videoPrompt, duration);
  } catch (e) {
    await grantCredits(session.user.id, AD_SKIT_VIDEO_COST, 'refund', AD_SKIT_TEMPLATE_ID + ':video');
    return NextResponse.json({ error: 'submit_failed', detail: String(e) }, { status: 502 });
  }
  // templateId 用正式 'ad-skit'(不带 ':')→ 成片进「我的作品」;prompt 存友好标题(前端传 plan.idea)。
  const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 200) : videoPrompt.slice(0, 120);
  const creation = await prisma.creation.create({
    data: { userId: session.user.id, templateId: AD_SKIT_TEMPLATE_ID, model: VIDEO_MODEL, prompt: title, status: 'processing', taskId: res.id, getUrl: res.getUrl, cost: AD_SKIT_VIDEO_COST },
  });
  return NextResponse.json({ id: creation.id, status: 'processing' });
}

export const POST = withAtlas(__byokPOST);
