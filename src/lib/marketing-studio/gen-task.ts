import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { deductCredits, grantCredits } from '@/lib/credits';
import { isByok } from '@/lib/request-context';
import { taskOutputUrls } from '@/lib/marketing-studio/task-outputs';

// 扣费失败的两种区分:余额不足(→402) vs 系统/DB 错误(→500,不能伪装成"积分不足")。
export class InsufficientCreditsError extends Error {
  constructor() {
    super('INSUFFICIENT_CREDITS');
    this.name = 'InsufficientCreditsError';
  }
}
export class ChargeError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = 'ChargeError';
  }
}

/** 同步扣费(用于 plan/script 这类同步返回、失败即退的场景)。区分余额不足与系统错误。 */
export async function chargeSync(uid: string, cost: number, ref: string): Promise<void> {
  try {
    await deductCredits(uid, cost, 'generate', ref);
  } catch (e) {
    if (e instanceof Error && e.message === 'INSUFFICIENT_CREDITS') throw new InsufficientCreditsError();
    throw new ChargeError(String(e));
  }
}

/** 同步退款(用于 plan/script 生成失败回退)。 */
export async function refundSync(uid: string, cost: number, ref: string): Promise<void> {
  await grantCredits(uid, cost, 'refund', ref);
}

/**
 * 异步生成任务的统一流程:扣费 → 提交 Atlas → 落一条 processing Creation(供 poll 异步失败退款)。
 * - 扣费失败:抛 InsufficientCreditsError / ChargeError,由路由分别转 402 / 500。
 * - 提交失败:立即退款并抛出原始 Atlas 错误(供路由透传 detail)。
 * - 落库失败:不影响出片,仅记日志(代价是该任务异步失败时无法自动退款)。
 * templateId 用分镜/中间步骤专用值(mk-shot/drama-shot/adref:*),避免混进「历史记录」面板。
 */
export async function chargeAndSubmit(opts: {
  uid: string;
  cost: number;
  ref: string;
  templateId: string;
  model: string;
  prompt?: string;
  submit: () => Promise<{ id: string; getUrl: string }>;
}): Promise<{ id: string; getUrl: string }> {
  try {
    await deductCredits(opts.uid, opts.cost, 'generate', opts.ref);
  } catch (e) {
    if (e instanceof Error && e.message === 'INSUFFICIENT_CREDITS') throw new InsufficientCreditsError();
    throw new ChargeError(String(e));
  }

  let res: { id: string; getUrl: string };
  try {
    res = await opts.submit();
  } catch (e) {
    await grantCredits(opts.uid, opts.cost, 'refund', opts.ref);
    throw e;
  }

  try {
    await prisma.creation.create({
      data: {
        userId: opts.uid,
        templateId: opts.templateId,
        model: opts.model,
        prompt: (opts.prompt || '').slice(0, 500),
        status: 'processing',
        taskId: res.id,
        getUrl: res.getUrl,
        cost: isByok() ? 0 : opts.cost,
      },
    });
  } catch (e) {
    console.error('[gen-task] creation.create failed (async refund will be unavailable for this task):', String(e));
  }
  return res;
}

/**
 * poll 发现 Atlas 任务失败时退款。用 getUrl 精确定位落库记录(前端原样传回的 getUrl === 落库时存的
 * getUrl,不依赖对 URL 格式的解析,最可靠)。用 processing→failed 的原子转移做幂等:
 * 只有把状态从 processing 成功改成 failed 的那一次(count===1)才退款,前端多次 poll 不会重复退。
 */
export async function refundFailedTask(getUrl: string, atlasError?: string): Promise<void> {
  if (!getUrl) return;
  const c = await prisma.creation.findFirst({ where: { getUrl, status: 'processing' } });
  if (!c) return;
  const upd = await prisma.creation.updateMany({
    where: { id: c.id, status: 'processing' },
    data: { status: 'failed', error: (atlasError || '').slice(0, 500) },
  });
  if (upd.count === 1 && c.cost > 0) {
    try {
      await grantCredits(c.userId, c.cost, 'refund', c.taskId || `creation:${c.id}`);
    } catch (e) {
      // 极低概率:状态已置 failed 但退款事务失败。留痕以便人工补退。
      // 不自动回退状态——回退会让下次 poll 重试退款,与并发 poll 叠加可能双退,宁可留日志人工补。
      console.error(`[gen-task] REFUND FAILED (needs manual comp) uid=${c.userId} cost=${c.cost} task=${c.taskId}:`, String(e));
    }
  }
}

/**
 * 已完成任务的输出是轮询接口的幂等缓存。刷新页面或网络重试时先返回这里的 R2/Blob URL,
 * 避免再次下载同一 Atlas 临时文件并重复写入对象存储。
 */
export async function completedTaskOutputs(getUrl: string): Promise<string[] | null> {
  if (!getUrl) return null;
  const creation = await prisma.creation.findFirst({
    where: { getUrl, status: 'completed' },
    select: { outputs: true },
  });
  const outputs = taskOutputUrls(creation?.outputs);
  return outputs.length ? outputs : null;
}

export type CompletionClaim =
  | { kind: 'claimed' }
  | { kind: 'completed'; outputs: string[] }
  | { kind: 'failed' }
  | { kind: 'waiting' }
  | { kind: 'untracked' };

/**
 * 原子认领 completed 结果的转存权。多个标签页可能同时看到 Atlas completed;
 * 只有第一个 processing → persisting 成功的请求可以写对象存储,其它请求等待缓存。
 */
export async function claimTaskCompletion(getUrl: string): Promise<CompletionClaim> {
  if (!getUrl) return { kind: 'untracked' };
  const creation = await prisma.creation.findFirst({ where: { getUrl } });
  if (!creation) return { kind: 'untracked' };

  const existingOutputs = taskOutputUrls(creation.outputs);
  if (creation.status === 'completed' && existingOutputs.length) {
    return { kind: 'completed', outputs: existingOutputs };
  }
  if (creation.status === 'failed') return { kind: 'failed' };

  let claimed = false;
  if (creation.status === 'processing' || creation.status === 'completed') {
    const update = await prisma.creation.updateMany({
      where: { id: creation.id, status: creation.status },
      data: { status: 'persisting' },
    });
    claimed = update.count === 1;
  } else if (
    creation.status === 'persisting'
    && Date.now() - new Date(creation.updatedAt).getTime() > 2 * 60_000
  ) {
    // 上一个转存请求可能被平台强杀。2 分钟租约到期后允许一个请求原子接管。
    const update = await prisma.creation.updateMany({
      where: {
        id: creation.id,
        status: 'persisting',
        updatedAt: { lte: new Date(Date.now() - 2 * 60_000) },
      },
      data: { status: 'persisting' },
    });
    claimed = update.count === 1;
  }
  if (claimed) return { kind: 'claimed' };

  // 另一请求正在转存。短暂等候其写入缓存;仍未完成则让客户端稍后继续轮询。
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 350));
    const current = await prisma.creation.findUnique({ where: { id: creation.id } });
    if (!current) return { kind: 'untracked' };
    const outputs = taskOutputUrls(current.outputs);
    if (current.status === 'completed' && outputs.length) {
      return { kind: 'completed', outputs };
    }
    if (current.status === 'failed') return { kind: 'failed' };
  }
  return { kind: 'waiting' };
}

export async function releaseTaskCompletionClaim(getUrl: string): Promise<void> {
  if (!getUrl) return;
  await prisma.creation.updateMany({
    where: { getUrl, status: 'persisting' },
    data: { status: 'processing' },
  });
}

/**
 * poll 发现任务完成时把 processing 记录标记为 completed(幂等,按 getUrl 定位)并保存可播放输出。
 * 返回是否"可交付":若该任务已是 failed 终态(已退款),返回 false,poll 据此拒绝把成片下发给客户端,
 * 防止"退款 + 出片"并存(纵深防御)。没有落库记录(容错场景)则默认放行。
 */
export async function markTaskCompleted(getUrl: string, outputs?: string[]): Promise<boolean> {
  if (!getUrl) return true;
  const c = await prisma.creation.findFirst({ where: { getUrl } });
  if (!c) return true; // 没有落库记录,无从判断退款,放行
  if (c.status === 'failed') return false; // 已退款,拒绝再交付成片
  await prisma.creation.updateMany({
    where: { id: c.id },
    data: {
      status: 'completed',
      ...(outputs?.length ? { outputs } : {}),
    },
  });
  return true;
}

/** 把扣费/提交阶段的异常统一转成 HTTP 响应:余额不足→402、扣费系统错误→500、Atlas 提交失败→502(透传原文)。 */
export function chargeErrorResponse(e: unknown, tag: string) {
  if (e instanceof InsufficientCreditsError) {
    return NextResponse.json({ error: 'insufficient_credits' }, { status: 402 });
  }
  if (e instanceof ChargeError) {
    console.error(`[${tag}] charge error:`, String(e));
    return NextResponse.json({ error: 'charge_failed', detail: String(e) }, { status: 500 });
  }
  console.error(`[${tag}] atlas error:`, String(e));
  return NextResponse.json({ error: 'atlas_submit_failed', detail: String(e) }, { status: 502 });
}
