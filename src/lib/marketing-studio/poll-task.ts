import { pollOnce } from '@/lib/atlas';
import {
  claimTaskCompletion,
  completedTaskOutputs,
  markTaskCompleted,
  refundFailedTask,
  releaseTaskCompletionClaim,
} from '@/lib/marketing-studio/gen-task';
import { persistToR2 } from '@/lib/marketing-studio/r2';

export type MarketingTaskPollResult = {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  outputs: string[];
  error?: string;
  transient?: boolean;
  cached?: boolean;
  persisted?: boolean;
};

/**
 * Atlas 最终任务的单次“查询 + 持久化 + 落库”。
 * 生成页和作品页共用同一实现，因此即使生成页关闭，作品页也能把 Atlas 已完成结果自动回收到作品卡片。
 */
export async function pollMarketingTask(getUrl: string): Promise<MarketingTaskPollResult> {
  try {
    const cachedOutputs = await completedTaskOutputs(getUrl);
    if (cachedOutputs) {
      return {
        status: 'completed',
        outputs: cachedOutputs,
        cached: true,
        persisted: true,
      };
    }
  } catch (error) {
    console.warn('[marketing/poll] completed output cache lookup failed:', String(error));
  }

  let result: Awaited<ReturnType<typeof pollOnce>>;
  try {
    result = await pollOnce(getUrl);
  } catch (error) {
    const message = String(error);
    if (/\b50[234]\b|timeout|timed ?out|ETIMEDOUT|ECONNRESET|socket|network|fetch failed/i.test(message)) {
      return { status: 'processing', outputs: [], transient: true };
    }
    throw error;
  }

  let completionClaimed = false;
  try {
    if (result.status === 'completed' && result.outputs?.length) {
      const claim = await claimTaskCompletion(getUrl);
      if (claim.kind === 'completed') {
        return {
          status: 'completed',
          outputs: claim.outputs,
          cached: true,
          persisted: true,
        };
      }
      if (claim.kind === 'failed') {
        return { status: 'failed', outputs: [], error: 'refunded' };
      }
      if (claim.kind === 'waiting') {
        return { status: 'processing', outputs: [], transient: true };
      }
      completionClaimed = claim.kind === 'claimed';
      const outputs = await Promise.all(result.outputs.map((url) => persistToR2(url)));
      const delivered = await markTaskCompleted(getUrl, outputs);
      if (!delivered) return { status: 'failed', outputs: [], error: 'refunded' };
      return { status: 'completed', outputs, persisted: true };
    }
    if (result.status === 'failed' || (result.status === 'completed' && !result.outputs?.length)) {
      const error = result.error || (result.status === 'completed' ? 'completed_no_output' : 'no_output');
      console.error('[marketing/poll] atlas task failed/empty:', result.status, error);
      await refundFailedTask(getUrl, error);
      return { status: 'failed', outputs: [], error };
    }
    return {
      status: result.status,
      outputs: result.outputs || [],
      error: result.error,
    };
  } catch (error) {
    if (completionClaimed) {
      try {
        await releaseTaskCompletionClaim(getUrl);
      } catch (releaseError) {
        console.error('[marketing/poll] completion claim release failed:', String(releaseError));
      }
    }
    console.error('[marketing/poll] post-process error:', String(error));
    if (result.status === 'completed' && result.outputs?.length) {
      return {
        status: 'completed',
        outputs: result.outputs,
        error: 'persist_failed',
        persisted: false,
      };
    }
    return {
      status: result.status,
      outputs: result.outputs || [],
      error: result.error,
    };
  }
}
