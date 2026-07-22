import { byokHeaders } from '@/lib/byok';

// 通用异步任务轮询(marketing / drama / ad-reference 共用同一个 /poll 后端)。
//
// 旧实现有三个坑,合起来就是线上偶发 "poll_gateway_unstable" 的根因:
//   1) 用 setInterval(3s) 且不等上一次 await 完成 —— Atlas 状态查询一慢(视频任务常见),
//      前端就会堆叠出一批并发 poll,反过来加剧网关抖动,transient 迅速累积。
//   2) transient(网关 504 / 瞬断)只容忍 8 次 ≈ 24 秒 —— 视频生成动辄几分钟,
//      Atlas 偶发几十秒 504 完全正常,却被当成"彻底失败"弹给用户。
//   3) 没有退避,失败时还是 3s 死磕。
//
// 新实现:
//   - 递归 setTimeout(严格串行,上一次没回来绝不发下一次)。
//   - transient 容忍 40 次,且指数退避(3s → 最长 20s),给 Atlas 充足恢复窗口。
//   - 用时间兜底(默认 10 分钟)而不是次数(退避后次数已不等价时长)。
export function pollGen(
  getUrl: string,
  opts: { endpoint?: string; timeoutMs?: number; maxTransient?: number } = {},
): Promise<string> {
  const endpoint = opts.endpoint ?? '/api/marketing-studio/poll';
  const timeoutMs = opts.timeoutMs ?? 600_000;
  const maxTransient = opts.maxTransient ?? 40;
  const t0 = Date.now();
  let transient = 0;
  let lastError = '';
  let delay = 3000;

  return new Promise<string>((resolve, reject) => {
    const schedule = () => setTimeout(tick, delay);
    const backoff = () => {
      delay = Math.min(Math.round(delay * 1.4), 20_000);
    };
    async function tick() {
      if (Date.now() - t0 > timeoutMs) return reject(new Error(lastError || 'timeout'));
      try {
        const r = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...byokHeaders() },
          body: JSON.stringify({ getUrl }),
        });
        const c = (await r.json().catch(() => ({}))) as {
          transient?: boolean; status?: string; outputs?: unknown; error?: string; detail?: string;
        };
        // transient 由后端标记(网关 504/瞬断,任务多半还在跑),HTTP 是 200 —— 当"处理中"退避续查。
        if (c.transient) {
          transient += 1;
          if (transient >= maxTransient) return reject(new Error('poll_gateway_unstable'));
          backoff();
          return schedule();
        }
        if (!r.ok) throw new Error(c.detail ? `${c.error || 'error'}: ${c.detail}` : c.error || 'failed');

        transient = 0;
        delay = 3000; // 正常响应:重置退避
        if (c.status === 'completed') {
          const out = (Array.isArray(c.outputs) ? c.outputs : [])[0];
          return typeof out === 'string' && out ? resolve(out) : reject(new Error('empty_output'));
        }
        if (c.status === 'failed') return reject(new Error(String(c.error || 'failed').slice(0, 200)));
        schedule(); // pending / processing:继续
      } catch (e) {
        transient += 1;
        lastError = String((e as Error)?.message || e).slice(0, 240);
        if (transient >= maxTransient) return reject(new Error(lastError || 'poll_failed'));
        backoff();
        schedule();
      }
    }
    schedule();
  });
}
