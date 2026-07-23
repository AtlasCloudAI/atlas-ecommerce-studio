import { withAtlas } from '@/lib/request-context';
import { NextResponse } from 'next/server';
import { pollOnce } from '@/lib/atlas';
import { persistToR2 } from '@/lib/marketing-studio/r2';
import {
  claimTaskCompletion,
  completedTaskOutputs,
  releaseTaskCompletionClaim,
  refundFailedTask,
  markTaskCompleted,
} from '@/lib/marketing-studio/gen-task';

export const maxDuration = 60;

// 无库代理轮询:前端传 Atlas 任务 getUrl,后端用 key 查状态。marketing/drama/ad-reference 共用。
// 完成后把输出从 Atlas 临时 OSS 转存到 R2,返回可内联播放/不过期的同源 url。
// 锁死 Atlas 域名防 SSRF(否则后端会带着 key 去请求任意 url)。
// 轮询本身无成本、需持有 taskId,故不加 session/不扣费;但会按 taskId 更新落库任务状态,
// Atlas 异步失败(审核block/超时等)时按 taskId 幂等退款(processing→failed 原子转移,只退一次)。
async function __byokPOST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const getUrl = typeof body.getUrl === 'string' ? body.getUrl : '';
  if (!/^https:\/\/api\.atlascloud\.ai\//.test(getUrl)) {
    return NextResponse.json({ error: 'invalid_get_url' }, { status: 400 });
  }
  // 同一个完成任务会因刷新/断网恢复而再次查询。优先返回已落库的持久化输出,
  // 避免重复从 Atlas 下载并生成新的 R2/Blob 对象。
  try {
    const cachedOutputs = await completedTaskOutputs(getUrl);
    if (cachedOutputs) {
      return NextResponse.json({ status: 'completed', outputs: cachedOutputs, cached: true });
    }
  } catch (e) {
    // 缓存查询失败不能挡住成片交付;退回 Atlas 状态查询与转存流程。
    console.warn('[marketing/poll] completed output cache lookup failed:', String(e));
  }
  // 只把 Atlas 状态查询(pollOnce)纳入"瞬时错误"判定:它偶发 504/超时时任务多半还在跑,当"处理中"继续轮询。
  // 正则收敛到网关超时类,不含 network/fetch failed/socket —— 那些可能是 D1/转存错误,不能误当"处理中"(否则已完成的任务也拿不到成片、转圈到超时)。
  let r: Awaited<ReturnType<typeof pollOnce>>;
  try {
    r = await pollOnce(getUrl);
  } catch (e) {
    // 这个 catch 只处理"查询状态"(pollOnce=GET prediction)的错误——网关超时 504、以及网络瞬断
    // (fetch failed / network / socket / ECONNRESET)都属于查询瞬时问题(任务多半仍在跑),当"处理中"让前端继续轮询。
    // 之所以能安全放宽含 network/fetch failed:转存/落库(persist/markTaskCompleted 的 D1 错误)已挪到下面单独的 try,不会混进这里。
    const msg = String(e);
    if (/\b50[234]\b|timeout|timed ?out|ETIMEDOUT|ECONNRESET|socket|network|fetch failed/i.test(msg)) {
      return NextResponse.json({ status: 'processing', outputs: [], transient: true });
    }
    console.error('[marketing/poll] poll error:', msg);
    return NextResponse.json({ error: 'poll_failed', detail: msg }, { status: 502 });
  }
  // 查询成功后的转存/落库/退款:出错不当"生成失败";completed 尽量把产出交付,落库失败仅记日志。
  let completionClaimed = false;
  try {
    if (r.status === 'completed' && r.outputs?.length) {
      const claim = await claimTaskCompletion(getUrl);
      if (claim.kind === 'completed') {
        return NextResponse.json({ status: 'completed', outputs: claim.outputs, cached: true });
      }
      if (claim.kind === 'failed') {
        return NextResponse.json({ status: 'failed', outputs: [], error: 'refunded' });
      }
      if (claim.kind === 'waiting') {
        return NextResponse.json({ status: 'processing', outputs: [], transient: true });
      }
      completionClaimed = claim.kind === 'claimed';
      const outputs = await Promise.all(r.outputs.map((u) => persistToR2(u)));
      const delivered = await markTaskCompleted(getUrl, outputs);
      if (!delivered) return NextResponse.json({ status: 'failed', outputs: [], error: 'refunded' });
      return NextResponse.json({ status: r.status, outputs });
    }
    if (r.status === 'failed' || (r.status === 'completed' && !r.outputs?.length)) {
      console.error('[marketing/poll] atlas task failed/empty:', r.status, r.error);
      await refundFailedTask(getUrl, r.error || (r.status === 'completed' ? 'completed_no_output' : undefined));
      return NextResponse.json({ status: 'failed', outputs: [], error: r.error || 'no_output' });
    }
    return NextResponse.json({ status: r.status, outputs: r.outputs, error: r.error });
  } catch (e) {
    if (completionClaimed) {
      try { await releaseTaskCompletionClaim(getUrl); }
      catch (releaseError) { console.error('[marketing/poll] completion claim release failed:', String(releaseError)); }
    }
    console.error('[marketing/poll] post-process error:', String(e));
    if (r.status === 'completed' && r.outputs?.length) return NextResponse.json({ status: 'completed', outputs: r.outputs });
    return NextResponse.json({ status: r.status, outputs: r.outputs || [], error: r.error });
  }
}

export const POST = withAtlas(__byokPOST);
