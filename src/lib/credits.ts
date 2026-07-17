import { prisma } from '@/lib/prisma';
import { isByok } from '@/lib/request-context';

export async function getCredits(userId: string): Promise<number> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { credits: true } });
  return u?.credits ?? 0;
}

export async function grantCredits(
  userId: string,
  amount: number,
  reason: string,
  ref?: string,
): Promise<void> {
  if (isByok()) return; // BYOK: user pays AtlasCloud directly — no credit movement at all.
  if (amount <= 0) return;
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { credits: { increment: amount } } }),
    prisma.creditLedger.create({ data: { userId, delta: amount, reason, ref } }),
  ]);
}

/** Atomically spend credits. Throws INSUFFICIENT_CREDITS if balance too low. */
export async function deductCredits(
  userId: string,
  amount: number,
  reason: string,
  ref?: string,
): Promise<void> {
  if (isByok()) return; // BYOK: user pays AtlasCloud directly — skip billing entirely.
  if (amount <= 0) return;
  // 条件原子扣减:余额不足则影响 0 行,不产生任何副作用。
  const res = await prisma.user.updateMany({
    where: { id: userId, credits: { gte: amount } },
    data: { credits: { decrement: amount } },
  });
  if (res.count === 0) throw new Error('INSUFFICIENT_CREDITS');
  // Cloudflare D1 不支持交互式事务,故用补偿:记账失败则把已扣额度加回,避免"扣钱无流水"。
  try {
    await prisma.creditLedger.create({ data: { userId, delta: -amount, reason, ref } });
  } catch (e) {
    // 记账失败 → 补偿性加回已扣额度。若补偿也失败(两次 DB 故障),留痕告警以便人工对账。
    await prisma.user.update({ where: { id: userId }, data: { credits: { increment: amount } } }).catch((re) => {
      console.error(`[credits] CRITICAL: deduct succeeded but ledger+rollback both failed uid=${userId} amount=${amount} ref=${ref}:`, String(re));
    });
    throw e;
  }
}
