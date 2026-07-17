import { getCloudflareContext } from '@opennextjs/cloudflare';

export const dynamic = 'force-dynamic';

// 从 R2 读转存好的媒体,加 CORS + 可内联播放头(去掉 Atlas OSS 的 force-download)。
// 关键:支持 HTTP Range(206) —— <video> 元素播放必须靠 range 分段,否则加载不出来。
type R2HeadLike = {
  size: number;
  httpMetadata?: { contentType?: string };
};
type R2ObjectLike = {
  body: ReadableStream;
};
type R2BucketLike = {
  head(key: string): Promise<R2HeadLike | null>;
  get(key: string, opts?: { range?: { offset: number; length: number } }): Promise<R2ObjectLike | null>;
};

function getBucket() {
  const { env } = getCloudflareContext();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (env as any).MEDIA_BUCKET as R2BucketLike | undefined;
}

function baseHeaders(meta: R2HeadLike) {
  return {
    'Content-Type': meta.httpMetadata?.contentType || 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Content-Disposition': 'inline',
    Vary: 'Range',
  };
}

function parseRange(value: string | null, size: number) {
  const match = value ? /^bytes=(\d+)-(\d*)$/.exec(value) : null;
  if (!match) return null;
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= size || end < start) {
    return 'invalid' as const;
  }
  return { start, end: Math.min(end, size - 1) };
}

async function serveMedia(req: Request, key: string, includeBody: boolean) {
  const bucket = getBucket();
  if (!bucket) return new Response('bucket not bound', { status: 500 });

  const meta = await bucket.head(key);
  if (!meta) return new Response('not found', { status: 404 });
  const size = meta.size;
  const base = baseHeaders(meta);

  const range = parseRange(req.headers.get('range'), size);
  if (range === 'invalid') {
    return new Response('range not satisfiable', {
      status: 416,
      headers: { ...base, 'Content-Range': `bytes */${size}` },
    });
  }
  if (range) {
    const { start, end } = range;
    const length = end - start + 1;
    if (!includeBody) {
      return new Response(null, {
        status: 206,
        headers: { ...base, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(length) },
      });
    }
    const obj = await bucket.get(key, { range: { offset: start, length } });
    if (!obj) return new Response('not found', { status: 404 });
    return new Response(obj.body as unknown as BodyInit, {
      status: 206,
      headers: { ...base, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(length) },
    });
  }

  if (!includeBody) {
    return new Response(null, { headers: { ...base, 'Content-Length': String(size) } });
  }
  const obj = await bucket.get(key);
  if (!obj) return new Response('not found', { status: 404 });
  return new Response(obj.body as unknown as BodyInit, { headers: { ...base, 'Content-Length': String(size) } });
}

export async function GET(req: Request, { params }: { params: { key: string } }) {
  return serveMedia(req, params.key, true);
}

export async function HEAD(req: Request, { params }: { params: { key: string } }) {
  return serveMedia(req, params.key, false);
}
