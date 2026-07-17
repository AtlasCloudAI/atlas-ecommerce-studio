import { withAtlas } from '@/lib/request-context';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { buildEditRequest, submitAdRefEdit, cleanRefText, AD_REF_EDIT_MODEL } from '@/lib/ad-reference';
import { chargeAndSubmit, chargeErrorResponse } from '@/lib/marketing-studio/gen-task';
import { videoCredits } from '@/lib/video-pricing';
import { NonPublicMediaUrlError, toAtlasMediaUrl } from '@/lib/public-media-url';
import { uploadInputMediaToAtlas, ADREF_VIDEO_UPLOAD_LIMIT, ADREF_IMAGE_UPLOAD_LIMIT } from '@/lib/ad-reference-media';

export const maxDuration = 60;

// gemini-omni-flash/video-edit 一步同时换人+换产品(纯 omni,2026-07-16 起换人也走这里)。
// 换人偶发异步失败(1010002)由前端 submit+poll 自动重试兜底。
async function __byokPOST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const uid = session.user.id;

  const body = await req.json().catch(() => ({}));
  let videoUrl = '';
  let avatarUrl = '';
  let productUrl = '';
  try {
    videoUrl = toAtlasMediaUrl(body.videoUrl, req);
    avatarUrl = toAtlasMediaUrl(body.avatarUrl, req);
    productUrl = toAtlasMediaUrl(body.productUrl, req);
  } catch (e) {
    if (e instanceof NonPublicMediaUrlError) {
      return NextResponse.json({ error: 'media_url_not_public', detail: e.value }, { status: 400 });
    }
    throw e;
  }
  if (!videoUrl) return NextResponse.json({ error: 'video_url_required' }, { status: 400 });
  // 纯 omni:一次 video-edit 同时换人+换产品,avatar / product 至少一个。
  if (!avatarUrl && !productUrl) return NextResponse.json({ error: 'avatar_or_product_required' }, { status: 400 });

  // omni video-edit 按参考视频秒数计费;前端上传时读出时长随 body.videoSeconds 传来,缺省保守用 30s。
  const videoSeconds = Number(body.videoSeconds) > 0 ? Number(body.videoSeconds) : 30;

  const { prompt } = buildEditRequest({
    videoUrl,
    avatarUrl: avatarUrl || undefined,
    productUrl: productUrl || undefined,
    productNote: cleanRefText(body.productNote, '', 300),
    extraNote: cleanRefText(body.extraNote, '', 500),
  });

  try {
    const submit = await chargeAndSubmit({
      uid,
      cost: videoCredits(AD_REF_EDIT_MODEL, undefined, videoSeconds),
      ref: 'ad-reference:edit',
      templateId: 'adref:edit',
      model: AD_REF_EDIT_MODEL,
      prompt,
      submit: async () => {
        // 同源 R2 媒体不能让 Atlas 走 Worker 自抓(会 404→"参数无效");先 bucket 直读上传 Atlas 临时 URL 再提交。
        // images 顺序须与 buildEditRequest 的 "reference image N" 一致:先人像(avatar)后产品(product)。
        const atlasVideo = await uploadInputMediaToAtlas(body.videoUrl, videoUrl, req, 'adref-edit-video', ADREF_VIDEO_UPLOAD_LIMIT);
        const atlasImages: string[] = [];
        if (avatarUrl) atlasImages.push(await uploadInputMediaToAtlas(body.avatarUrl, avatarUrl, req, 'adref-edit-avatar', ADREF_IMAGE_UPLOAD_LIMIT));
        if (productUrl) atlasImages.push(await uploadInputMediaToAtlas(body.productUrl, productUrl, req, 'adref-edit-product', ADREF_IMAGE_UPLOAD_LIMIT));
        return submitAdRefEdit(atlasVideo, prompt, atlasImages);
      },
    });
    return NextResponse.json({ id: submit.id, getUrl: submit.getUrl, prompt });
  } catch (e) {
    return chargeErrorResponse(e, 'ad-reference/edit');
  }
}

export const POST = withAtlas(__byokPOST);
