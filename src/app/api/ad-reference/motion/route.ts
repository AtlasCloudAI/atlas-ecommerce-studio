import { withAtlas } from '@/lib/request-context';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { submitAdRefMotion, AD_REF_MOTION_MODEL } from '@/lib/ad-reference';
import { chargeAndSubmit, chargeErrorResponse } from '@/lib/marketing-studio/gen-task';
import { videoCredits } from '@/lib/video-pricing';
import { NonPublicMediaUrlError, toAtlasMediaUrl } from '@/lib/public-media-url';
import { uploadInputMediaToAtlas } from '@/lib/ad-reference-media';

export const maxDuration = 60;

// kling motion-control 兜底换人:出镜人图(image)+ 原参考视频(动作源 video)→ 让你的人做原片动作。
// 用于 omni 换真人撞 1010002(deepfake)时的降级。kling 输入 image/video 均 ≤10MB;
// 同源 R2 媒体先 bucket 直读上传 Atlas 临时 URL(绕 Worker 自抓 → 否则 Atlas 抓不到报参数无效)。
const KLING_MEDIA_LIMIT = 10_000_000;

async function __byokPOST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const uid = session.user.id;

  const body = await req.json().catch(() => ({}));
  let videoUrl = '';
  let avatarUrl = '';
  try {
    videoUrl = toAtlasMediaUrl(body.videoUrl, req);
    avatarUrl = toAtlasMediaUrl(body.avatarUrl, req);
  } catch (e) {
    if (e instanceof NonPublicMediaUrlError) {
      return NextResponse.json({ error: 'media_url_not_public', detail: e.value }, { status: 400 });
    }
    throw e;
  }
  if (!videoUrl) return NextResponse.json({ error: 'video_url_required' }, { status: 400 });
  if (!avatarUrl) return NextResponse.json({ error: 'avatar_url_required' }, { status: 400 });

  // kling motion-control 按驱动视频秒数计费;前端随 body.videoSeconds 传参考视频时长,缺省保守用 30s。
  const videoSeconds = Number(body.videoSeconds) > 0 ? Number(body.videoSeconds) : 30;

  try {
    const submit = await chargeAndSubmit({
      uid,
      cost: videoCredits(AD_REF_MOTION_MODEL, undefined, videoSeconds),
      ref: 'ad-reference:motion',
      templateId: 'adref:motion',
      model: AD_REF_MOTION_MODEL,
      prompt: 'Motion transfer: animate the uploaded talent photo with the motion of the reference video.',
      submit: async () => {
        // image=出镜人图,video=原参考视频(动作源);先上传 Atlas(kling ≤10MB,超限会在此抛 media_too_large)
        const [atlasImage, atlasVideo] = await Promise.all([
          uploadInputMediaToAtlas(body.avatarUrl, avatarUrl, req, 'adref-motion-image', KLING_MEDIA_LIMIT),
          uploadInputMediaToAtlas(body.videoUrl, videoUrl, req, 'adref-motion-video', KLING_MEDIA_LIMIT),
        ]);
        return submitAdRefMotion(atlasImage, atlasVideo);
      },
    });
    return NextResponse.json({ id: submit.id, getUrl: submit.getUrl });
  } catch (e) {
    return chargeErrorResponse(e, 'ad-reference/motion');
  }
}

export const POST = withAtlas(__byokPOST);
