import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export const maxDuration = 60;

// 保存成片到历史:成片 blob → R2,元数据 → D1 Creation。需登录(未登录不存历史,成片本地仍可看/下)。
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const body = await req.json().catch(() => ({}));
      const reelUrl = typeof body.url === 'string' && body.url.startsWith('/api/marketing-studio/media/') ? body.url : '';
      if (!reelUrl) return NextResponse.json({ error: 'invalid_url' }, { status: 400 });
      const title = String(body.title || 'Untitled').slice(0, 500);
      const type = String(body.type || 'marketing-studio');
      const thumbnail = String(body.thumbnail || '') || null;
      const creationId = String(body.creationId || '');
      const outputs = [reelUrl];

      if (creationId) {
        const upd = await prisma.creation.updateMany({
          where: { id: creationId, userId: session.user.id },
          data: { status: 'completed', prompt: title, inputImage: thumbnail, outputs },
        });
        if (upd.count === 1) return NextResponse.json({ id: creationId, url: reelUrl });
      }
      const creation = await prisma.creation.create({
        data: {
          userId: session.user.id,
          templateId: type,
          model: type === 'drama-studio' ? 'drama' : 'marketing',
          prompt: title,
          inputImage: thumbnail,
          status: 'completed',
          outputs,
        },
      });
      return NextResponse.json({ id: creation.id, url: reelUrl });
    }

    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof Blob)) return NextResponse.json({ error: 'no_file' }, { status: 400 });
    const buf = await file.arrayBuffer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bucket = (getCloudflareContext().env as any).MEDIA_BUCKET;
    if (!bucket) return NextResponse.json({ error: 'no_bucket' }, { status: 500 });

    const key = `reel-${crypto.randomUUID()}.mp4`;
    await bucket.put(key, buf, { httpMetadata: { contentType: 'video/mp4' } });
    const reelUrl = `/api/marketing-studio/media/${key}`;

    const title = String(form.get('title') || 'Untitled').slice(0, 500);
    const type = String(form.get('type') || 'marketing-studio');
    const thumbnail = String(form.get('thumbnail') || '') || null;
    const creationId = String(form.get('creationId') || '');
    let shots: string[] = [];
    try { shots = JSON.parse(String(form.get('shots') || '[]')); } catch { /* ignore */ }
    const outputs = [reelUrl, ...shots.filter((s) => typeof s === 'string')];

    // 有 creationId → 更新点生成时创建的占位记录(processing → completed);否则新建(兼容)。
    if (creationId) {
      const upd = await prisma.creation.updateMany({
        where: { id: creationId, userId: session.user.id },
        data: { status: 'completed', prompt: title, inputImage: thumbnail, outputs },
      });
      if (upd.count === 1) return NextResponse.json({ id: creationId, url: reelUrl });
    }
    const creation = await prisma.creation.create({
      data: {
        userId: session.user.id,
        templateId: type,
        model: type === 'drama-studio' ? 'drama' : 'marketing',
        prompt: title,
        inputImage: thumbnail,
        status: 'completed',
        outputs,
      },
    });
    return NextResponse.json({ id: creation.id, url: reelUrl });
  } catch (e) {
    return NextResponse.json({ error: 'save_failed', detail: String(e) }, { status: 502 });
  }
}
