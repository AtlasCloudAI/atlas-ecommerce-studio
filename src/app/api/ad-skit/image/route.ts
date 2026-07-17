import { withAtlas } from '@/lib/request-context';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { deductCredits, grantCredits } from '@/lib/credits';
import { uploadMedia } from '@/lib/atlas';
import { submitProductImage, IMAGE_MODEL, AD_SKIT_COSTS, AD_SKIT_TEMPLATE_ID } from '@/lib/ad-skit';

export const maxDuration = 60;

async function __byokPOST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const uploads: string[] = Array.isArray(body.uploadedImages)
    ? body.uploadedImages.filter((x: unknown) => typeof x === 'string')
    : typeof body.uploadedImage === 'string' && body.uploadedImage
      ? [body.uploadedImage]
      : [];
  const imagePrompt = typeof body.imagePrompt === 'string' ? body.imagePrompt.slice(0, 500) : '';

  // 有上传的多张产品图:各自传到 Atlas 拿 URL,同步返回(上传不算生成,不扣费)
  if (uploads.length) {
    const valid = uploads.slice(0, 4);
    if (valid.some((u) => u.length > 8_000_000)) return NextResponse.json({ error: 'image_too_large' }, { status: 400 });
    try {
      const productUrls = await Promise.all(
        valid.map((u) => (u.startsWith('data:') ? uploadMedia(u, 'ad-skit-product') : Promise.resolve(u))),
      );
      return NextResponse.json({ productUrls: productUrls.filter((u) => typeof u === 'string' && u.startsWith('http')) });
    } catch (e) {
      return NextResponse.json({ error: 'upload_failed', detail: String(e) }, { status: 502 });
    }
  }

  // 无上传:按描述文生图(异步,前端轮询 /api/creations/[id])
  if (imagePrompt.length < 3) return NextResponse.json({ error: 'prompt_or_image_required' }, { status: 400 });
  try {
    await deductCredits(session.user.id, AD_SKIT_COSTS.image, 'generate', AD_SKIT_TEMPLATE_ID + ':image');
  } catch {
    return NextResponse.json({ error: 'insufficient_credits' }, { status: 402 });
  }
  let res;
  try {
    res = await submitProductImage(imagePrompt);
  } catch (e) {
    await grantCredits(session.user.id, AD_SKIT_COSTS.image, 'refund', AD_SKIT_TEMPLATE_ID + ':image');
    return NextResponse.json({ error: 'submit_failed', detail: String(e) }, { status: 502 });
  }
  const creation = await prisma.creation.create({
    data: { userId: session.user.id, templateId: AD_SKIT_TEMPLATE_ID + ':image', model: IMAGE_MODEL, prompt: imagePrompt, status: 'processing', taskId: res.id, getUrl: res.getUrl, cost: AD_SKIT_COSTS.image },
  });
  return NextResponse.json({ id: creation.id, status: 'processing' });
}

export const POST = withAtlas(__byokPOST);
