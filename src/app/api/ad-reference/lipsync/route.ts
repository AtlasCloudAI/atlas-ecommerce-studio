import { withAtlas } from '@/lib/request-context';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { submitAdRefLipsync, AD_REF_LIPSYNC_MODEL } from '@/lib/ad-reference';
import { chargeAndSubmit, chargeErrorResponse } from '@/lib/marketing-studio/gen-task';
import { videoCredits } from '@/lib/video-pricing';
import { NonPublicMediaUrlError, toAtlasMediaUrl } from '@/lib/public-media-url';

export const maxDuration = 60;

// veed/lipsync 把新配音对到成片嘴上:需登录 + 扣 AD_REF_LIPSYNC_COST;提交/异步失败均退款,Atlas 报错透传。
async function __byokPOST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const uid = session.user.id;

  const body = await req.json().catch(() => ({}));
  let videoUrl = '';
  let audioUrl = '';
  try {
    videoUrl = toAtlasMediaUrl(body.videoUrl, req);
    audioUrl = toAtlasMediaUrl(body.audioUrl, req);
  } catch (e) {
    if (e instanceof NonPublicMediaUrlError) {
      return NextResponse.json({ error: 'media_url_not_public', detail: e.value }, { status: 400 });
    }
    throw e;
  }
  if (!videoUrl) return NextResponse.json({ error: 'video_url_required' }, { status: 400 });
  if (!audioUrl) return NextResponse.json({ error: 'audio_url_required' }, { status: 400 });

  // veed/lipsync 按音频/输出时长计费;前端按台词字数估算随 body.audioSeconds 传来,缺省保守用 12s。
  const audioSeconds = Number(body.audioSeconds) > 0 ? Number(body.audioSeconds) : 12;

  try {
    const submit = await chargeAndSubmit({
      uid,
      cost: videoCredits(AD_REF_LIPSYNC_MODEL, undefined, audioSeconds),
      ref: 'ad-reference:lipsync',
      templateId: 'adref:lipsync',
      model: AD_REF_LIPSYNC_MODEL,
      submit: () => submitAdRefLipsync(videoUrl, audioUrl),
    });
    return NextResponse.json({ id: submit.id, getUrl: submit.getUrl });
  } catch (e) {
    return chargeErrorResponse(e, 'ad-reference/lipsync');
  }
}

export const POST = withAtlas(__byokPOST);
