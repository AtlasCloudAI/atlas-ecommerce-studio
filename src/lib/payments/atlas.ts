import { prisma } from '@/lib/prisma';
import { grantCredits } from '@/lib/credits';
import { cdkeyLogs, kubedlConfigured } from '@/lib/kubedl';
import type { PaymentProvider } from './types';

// Credits granted per valid redeem code. Until per-code face value is
// wired from Atlas, this is the configured flat amount.
const REDEEM_CREDITS = parseInt(process.env.ATLAS_REDEEM_CREDITS || '0', 10);

// "Atlas credits" flow: no Stripe. End-users redeem a code (issued via the
// Atlas/KubeDL admin console) for in-app credits.
export const atlasProvider: PaymentProvider = {
  id: 'atlas',
  mode: 'redeem',
  async redeem(userId, rawCode) {
    const code = rawCode.trim();
    if (!code) throw new Error('EMPTY_CODE');

    const used = await prisma.redeemedCode.findUnique({ where: { code } });
    if (used) throw new Error('CODE_ALREADY_USED');

    if (kubedlConfigured()) {
      const logs = await cdkeyLogs(code);
      if (logs === null) throw new Error('INVALID_CODE');
      // TODO: derive per-code face value from Atlas instead of the flat amount.
    } else if (REDEEM_CREDITS <= 0) {
      throw new Error('REDEEM_NOT_CONFIGURED');
    }

    if (REDEEM_CREDITS <= 0) throw new Error('REDEEM_NOT_CONFIGURED');

    // Record first (code is @id, so this is the dedupe guard under races).
    await prisma.redeemedCode.create({ data: { code, userId, amount: REDEEM_CREDITS } });
    await grantCredits(userId, REDEEM_CREDITS, 'redeem', code);
    return { amount: REDEEM_CREDITS };
  },
};
