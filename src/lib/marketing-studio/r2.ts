import { putMedia, readMedia } from '@/lib/media-storage';

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
    // 后端 fetch 不受浏览器 CORS/force-download 限制;不带 Referer 绕过 OSS 防盗链。
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45_000);
    let buf: ArrayBuffer;
    let declaredType: string;
    try {
      const res = await fetch(sourceUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!res.ok) return sourceUrl;
      declaredType =
        res.headers.get('content-type') || 'application/octet-stream';
      buf = await res.arrayBuffer();
    } finally {
      clearTimeout(timer);
    }
    const media = sniffMedia(buf, declaredType);
    const key = `${crypto.randomUUID()}.${media.extension}`;
    return await putMedia(key, buf, media.contentType);
  } catch {
    return sourceUrl;
  }
}

// 从 R2 读一张媒体图转成 base64 data URI:给多模态 LLM 内联用。
// 直接内联而不是把 /media/ URL 丢给 LLM,是因为海外 LLM(gemini)拉 workers.dev 图常超时(实测扩写卡死即此因)。
export async function mediaToDataUri(url: string): Promise<string> {
  try {
    const media = await readMedia(url);
    if (!media) return '';
    const bytes = new Uint8Array(media.buffer);
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
    return `data:${media.contentType};base64,${btoa(bin)}`;
  } catch {
    return '';
  }
}
