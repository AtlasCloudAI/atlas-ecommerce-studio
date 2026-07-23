import { withAtlas } from '@/lib/request-context';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { pollOnce } from '@/lib/atlas';
import { grantCredits } from '@/lib/credits';
import { pollMarketingTask } from '@/lib/marketing-studio/poll-task';

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

  // Marketing Studio 的最终视频任务由服务端直接挂到作品占位。作品页也能独立查询、转存并
  // 回写成片，不再依赖生成页保持打开后执行最后一次 save-reel。
  if (
    c.templateId === 'marketing-studio'
    && c.getUrl
    && (c.status === 'processing' || c.status === 'persisting')
  ) {
    try {
      const task = await pollMarketingTask(c.getUrl);
      if (task.status === 'completed' && task.outputs.length && task.persisted !== false) {
        const update = await prisma.creation.update({
          where: { id: c.id },
          data: {
            status: 'completed',
            outputs: task.outputs,
            error: null,
          },
        });
        return NextResponse.json({
          id: update.id,
          status: update.status,
          outputs: update.outputs,
        });
      }
      if (task.status === 'failed') {
        const update = await prisma.creation.updateMany({
          where: { id: c.id, status: { in: ['processing', 'persisting'] } },
          data: { status: 'failed', error: task.error || 'generation failed' },
        });
        return NextResponse.json({
          id: c.id,
          status: update.count === 1 ? 'failed' : c.status,
          error: task.error,
        });
      }
      return NextResponse.json({ id: c.id, status: 'processing' });
    } catch (error) {
      console.warn(`[creations/${c.id}] marketing task reconcile failed:`, String(error));
      return NextResponse.json({ id: c.id, status: 'processing' });
    }
  }

  // Terminal states: nothing more to do.(带 assets,drama 详情页要用)
  if (c.status === 'completed' || c.status === 'failed')
    return NextResponse.json({ id: c.id, status: c.status, outputs: c.outputs, error: c.error, assets: c.assets, prompt: c.prompt, templateId: c.templateId, inputImage: c.inputImage, createdAt: c.createdAt });
  // 占位记录(无 getUrl):前端在完成/失败时更新它;若已停在 processing 超过超时时间,视为前端中断,
  // 自动判失败,避免作品页永远转圈。占位不扣费,无需退款。
  if (!c.getUrl) {
    // drama 作品文件夹是分步手动生成、可能拖很久,豁免 15 分钟超时(否则文件夹还没生成完就被误标失败)。
    const isDramaFolder = !!c.assets && typeof c.assets === 'object' && (c.assets as { kind?: string }).kind === 'drama';
    // Marketing Studio 的首帧和视频是串行任务，给足与前端总轮询一致的 90 分钟；
    // 旧 15 分钟会在 Atlas 仍正常生成时把作品误判失败。
    const placeholderTimeoutMs = c.templateId === 'marketing-studio' ? 90 * 60_000 : 15 * 60_000;
    if (!isDramaFolder && Date.now() - new Date(c.createdAt).getTime() > placeholderTimeoutMs) {
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
