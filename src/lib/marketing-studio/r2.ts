import { getCloudflareContext } from '@opennextjs/cloudflare';

// Atlas 生成结果落在带 force-download/防盗链/8天过期/无CORS 的临时 OSS,网页播不了。
// 这里把它转存到我们自己的 R2(marketing-studio-media),返回同源、可内联播放、不过期的 url。
// 转存失败时回退原 url(至少不让生成整个 break)。
function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}

function extensionForContentType(contentType: string): string {
  const ct = contentType.toLowerCase();
  if (ct.includes('mp4')) return 'mp4';
  if (ct.includes('mpeg') || ct.includes('mp3')) return 'mp3';
  if (ct.includes('wav')) return 'wav';
  if (ct.includes('m4a')) return 'm4a';
  if (ct.includes('png')) return 'png';
  if (ct.includes('jpeg') || ct.includes('jpg')) return 'jpg';
  if (ct.includes('webp')) return 'webp';
  return 'bin';
}

function sniffMedia(buffer: ArrayBuffer, declared: string): { contentType: string; extension: string } {
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 12) {
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return { contentType: 'image/jpeg', extension: 'jpg' };
    }
    if (bytes[0] === 0x89 && ascii(bytes, 1, 4) === 'PNG') {
      return { contentType: 'image/png', extension: 'png' };
    }
    if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') {
      return { contentType: 'image/webp', extension: 'webp' };
    }
    if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WAVE') {
      return { contentType: 'audio/wav', extension: 'wav' };
    }
    if (ascii(bytes, 4, 8) === 'ftyp') {
      const brand = ascii(bytes, 8, 12);
      return brand === 'qt  '
        ? { contentType: 'video/quicktime', extension: 'mov' }
        : { contentType: 'video/mp4', extension: 'mp4' };
    }
  }
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return { contentType: 'video/webm', extension: 'webm' };
  }
  if (bytes.length >= 3 && ascii(bytes, 0, 3) === 'ID3') {
    return { contentType: 'audio/mpeg', extension: 'mp3' };
  }
  return {
    contentType: declared || 'application/octet-stream',
    extension: extensionForContentType(declared),
  };
}

export async function persistToR2(sourceUrl: string): Promise<string> {
  if (!/^https?:\/\//.test(sourceUrl)) return sourceUrl;
  try {
    const { env } = getCloudflareContext();
    const bucket = (env as unknown as { MEDIA_BUCKET?: R2BucketLike }).MEDIA_BUCKET;
    if (!bucket) return sourceUrl;
    // 后端 fetch 不受浏览器 CORS/force-download 限制;不带 Referer 绕过 OSS 防盗链。
    // 下载兜底超时:视频可能十几 MB,若 Atlas OSS 偶发慢,别把 /poll 拖过 maxDuration(60s)被平台强杀
    // ——那样前端会收到网关错误、误判成 transient,任务明明已 completed 却一直转圈到 poll_gateway_unstable。
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45_000);
    let buf: ArrayBuffer;
    let declaredType: string;
    try {
      const res = await fetch(sourceUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store', signal: controller.signal });
      if (!res.ok) return sourceUrl;
      declaredType = res.headers.get('content-type') || 'application/octet-stream';
      buf = await res.arrayBuffer();
    } finally {
      clearTimeout(timer);
    }
    const media = sniffMedia(buf, declaredType);
    const key = `${crypto.randomUUID()}.${media.extension}`;
    await bucket.put(key, buf, { httpMetadata: { contentType: media.contentType } });
    return `/api/marketing-studio/media/${key}`;
  } catch {
    return sourceUrl;
  }
}

// 从 R2 读一张媒体图转成 base64 data URI:给多模态 LLM 内联用。
// 直接内联而不是把 /media/ URL 丢给 LLM,是因为海外 LLM(gemini)拉 workers.dev 图常超时(实测扩写卡死即此因)。
export async function mediaToDataUri(url: string): Promise<string> {
  const m = /\/media\/([^/?#]+)/.exec(url || '');
  if (!m) return '';
  try {
    const { env } = getCloudflareContext();
    const bucket = (env as unknown as { MEDIA_BUCKET?: R2BucketLike }).MEDIA_BUCKET;
    if (!bucket) return '';
    const obj = await bucket.get(m[1]);
    if (!obj) return '';
    const buf = await new Response(obj.body).arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
    const ct = obj.httpMetadata?.contentType || 'image/jpeg';
    return `data:${ct};base64,${btoa(bin)}`;
  } catch {
    return '';
  }
}

// 最小 R2 接口(避免依赖 @cloudflare/workers-types)
interface R2BucketLike {
  put(key: string, value: ArrayBuffer, opts?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<R2ObjectLike | null>;
}
export interface R2ObjectLike {
  body: ReadableStream;
  httpMetadata?: { contentType?: string };
}
