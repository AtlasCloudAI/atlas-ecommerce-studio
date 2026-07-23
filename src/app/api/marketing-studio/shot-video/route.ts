import { withAtlas } from '@/lib/request-context';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  cleanText,
  normalizeVideoDuration,
  normalizeVideoRatio,
  normalizeVideoResolution,
  submitShotVideo,
  submitShotRefVideo,
  SHOT_VIDEO_MODEL,
  SHOT_REF_VIDEO_MODEL,
  REPLICA_VIDEO_MODEL,
} from '@/lib/marketing-studio/workflow';
import {
  chargeAndSubmit,
  chargeErrorResponse,
  linkMarketingCreationTask,
} from '@/lib/marketing-studio/gen-task';
import { videoCredits } from '@/lib/video-pricing';

export const maxDuration = 60;

// 逐镜出视频(Seedance 2.0 i2v):需登录 + 扣 MK_VIDEO_COST;提交失败退款、异步失败由 poll 退款,Atlas 报错透传。
async function __byokPOST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const uid = session.user.id;

  const body = await req.json().catch(() => ({}));
  const prompt = cleanText(body.prompt, '', 3000);
  const ratio = normalizeVideoRatio(body.ratio);
  const resolution = normalizeVideoResolution(body.resolution);
  const duration = normalizeVideoDuration(body.duration);
  const creationId = typeof body.creationId === 'string' ? body.creationId.trim() : '';
  if (!prompt) return NextResponse.json({ error: 'prompt_required' }, { status: 400 });

  // 本站相对路径(/api/marketing-studio/media/...)补成公网绝对 URL,否则 Atlas 拉不到。
  const toAbs = (u: unknown): string => {
    const s = typeof u === 'string' ? u.trim() : '';
    if (s.startsWith('/api/marketing-studio/media/')) return new URL(s, req.url).toString();
    return /^https?:\/\//.test(s) ? s : '';
  };

  // drama 逐镜:传了 referenceImages[] 就走 reference-to-video(产品图+角色定妆图+场景图 直接出视频);
  // 否则 marketing 单首帧 i2v(imageUrl)。
  const referenceImages = (Array.isArray(body.referenceImages) ? body.referenceImages : []).map(toAbs).filter(Boolean);

  try {
    if (referenceImages.length) {
      const submit = await chargeAndSubmit({
        uid,
        cost: videoCredits(SHOT_REF_VIDEO_MODEL, resolution, duration),
        ref: 'drama:ref-video',
        templateId: 'mk-shot',
        model: SHOT_REF_VIDEO_MODEL,
        prompt,
        submit: () => submitShotRefVideo(referenceImages, prompt, { ratio, resolution, duration }),
      });
      return NextResponse.json({ id: submit.id, getUrl: submit.getUrl });
    }

    const imageUrl = toAbs(body.imageUrl);
    if (!/^https?:\/\//.test(imageUrl)) return NextResponse.json({ error: 'image_url_required' }, { status: 400 });
    // 复刻模式:前端可指定 veo3.1-fast(带台词对口型说话);白名单校验,不接受任意模型。
    const model = body.model === REPLICA_VIDEO_MODEL ? REPLICA_VIDEO_MODEL : SHOT_VIDEO_MODEL;
    const submit = await chargeAndSubmit({
      uid,
      cost: videoCredits(model, resolution, duration),
      ref: 'marketing:shot-video',
      templateId: 'mk-shot',
      model,
      prompt,
      submit: () => submitShotVideo(imageUrl, prompt, { ratio, resolution, duration, model }),
    });
    const parentLinked = await linkMarketingCreationTask({
      uid,
      creationId,
      taskId: submit.id,
      getUrl: submit.getUrl,
      model,
    });
    return NextResponse.json({ id: submit.id, getUrl: submit.getUrl, parentLinked });
  } catch (e) {
    return chargeErrorResponse(e, 'marketing/shot-video');
  }
}

export const POST = withAtlas(__byokPOST);
