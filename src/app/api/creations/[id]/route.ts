import { withAtlas } from '@/lib/request-context';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { pollOnce } from '@/lib/atlas';
import { grantCredits } from '@/lib/credits';

// 前端生成中断/失败时,把自己的、仍在 processing 的占位作品标记为 failed(作品页显示"失败"而非永远转圈)。
async function __byokPOST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (body.status !== 'failed') return NextResponse.json({ error: 'bad_status' }, { status: 400 });
  await prisma.creation.updateMany({
    where: { id: params.id, userId: session.user.id, status: 'processing' },
    data: { status: 'failed', error: (typeof body.error === 'string' ? body.error : 'canceled').slice(0, 500) },
  });
  return NextResponse.json({ ok: true });
}

// Polled by the client. Each call advances the task status at most once.
async function __byokGET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const c = await prisma.creation.findUnique({ where: { id: params.id } });
  if (!c || c.userId !== session.user.id)
    return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // Terminal states: nothing more to do.(带 assets,drama 详情页要用)
  if (c.status === 'completed' || c.status === 'failed')
    return NextResponse.json({ id: c.id, status: c.status, outputs: c.outputs, error: c.error, assets: c.assets, prompt: c.prompt, templateId: c.templateId, inputImage: c.inputImage, createdAt: c.createdAt });
  // 占位记录(无 getUrl):前端在完成/失败时更新它;若已停在 processing 超过 15 分钟,视为前端中断,
  // 自动判失败,避免作品页永远转圈。占位不扣费,无需退款。
  if (!c.getUrl) {
    // drama 作品文件夹是分步手动生成、可能拖很久,豁免 15 分钟超时(否则文件夹还没生成完就被误标失败)。
    const isDramaFolder = !!c.assets && typeof c.assets === 'object' && (c.assets as { kind?: string }).kind === 'drama';
    if (!isDramaFolder && Date.now() - new Date(c.createdAt).getTime() > 15 * 60_000) {
      await prisma.creation.updateMany({ where: { id: c.id, status: 'processing' }, data: { status: 'failed', error: 'timeout' } });
      return NextResponse.json({ id: c.id, status: 'failed', error: 'timeout' });
    }
    return NextResponse.json({ id: c.id, status: c.status, outputs: c.outputs, error: c.error, assets: c.assets, prompt: c.prompt, templateId: c.templateId, inputImage: c.inputImage, createdAt: c.createdAt });
  }

  try {
    const p = await pollOnce(c.getUrl);
    if (p.status === 'completed') {
      const u = await prisma.creation.update({
        where: { id: c.id },
        data: { status: 'completed', outputs: p.outputs },
      });
      return NextResponse.json({ id: u.id, status: u.status, outputs: u.outputs });
    }
    if (p.status === 'failed') {
      const update = await prisma.creation.updateMany({
        where: { id: c.id, status: 'processing' },
        data: { status: 'failed', error: p.error || 'generation failed' },
      });
      if (update.count === 1 && c.cost > 0) {
        await grantCredits(c.userId, c.cost, 'refund', c.id); // refund a failed job
      }
      return NextResponse.json({ id: c.id, status: 'failed', error: p.error });
    }
    return NextResponse.json({ id: c.id, status: 'processing' });
  } catch {
    // Transient poll error — keep the client polling.
    return NextResponse.json({ id: c.id, status: 'processing' });
  }
}

export const POST = withAtlas(__byokPOST);
export const GET = withAtlas(__byokGET);
