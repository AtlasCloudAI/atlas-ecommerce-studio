import { withAtlas } from '@/lib/request-context';
import { NextResponse } from 'next/server';
import { pollMarketingTask } from '@/lib/marketing-studio/poll-task';

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
  try {
    return NextResponse.json(await pollMarketingTask(getUrl));
  } catch (error) {
    const detail = String(error);
    console.error('[marketing/poll] poll error:', detail);
    return NextResponse.json({ error: 'poll_failed', detail }, { status: 502 });
  }
}

export const POST = withAtlas(__byokPOST);
