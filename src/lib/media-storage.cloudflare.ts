import { getCloudflareContext } from '@opennextjs/cloudflare';

const MEDIA_PATH_PREFIX = '/api/marketing-studio/media/';

export type MediaStorageCapabilities = {
  provider: 'r2' | 'vercel-blob';
  configured: boolean;
  directUpload: boolean;
};

export type StoredMedia = {
  buffer: ArrayBuffer;
  contentType: string;
};

export class MediaStorageNotConfiguredError extends Error {
  constructor() {
    super('bucket_not_bound');
    this.name = 'MediaStorageNotConfiguredError';
  }
}

type R2HeadLike = {
  size: number;
  httpMetadata?: { contentType?: string };
};

type R2ObjectLike = {
  body: ReadableStream;
  httpMetadata?: { contentType?: string };
  arrayBuffer?: () => Promise<ArrayBuffer>;
};

type R2BucketLike = {
  put(
    key: string,
    value: ArrayBuffer,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
  head(key: string): Promise<R2HeadLike | null>;
  get(
    key: string,
    options?: { range?: { offset: number; length: number } },
  ): Promise<R2ObjectLike | null>;
};

function getBucket(): R2BucketLike | undefined {
  const { env } = getCloudflareContext();
  return (env as unknown as { MEDIA_BUCKET?: R2BucketLike }).MEDIA_BUCKET;
}

function mediaKey(value: string): string {
  let path = value.trim();
  if (/^https?:\/\//i.test(path)) {
    try {
      path = new URL(path).pathname;
    } catch {
      return '';
    }
  }
  if (!path.startsWith(MEDIA_PATH_PREFIX)) return '';
  const encodedKey =
    path.slice(MEDIA_PATH_PREFIX.length).split(/[?#]/, 1)[0] || '';
  try {
    return decodeURIComponent(encodedKey);
  } catch {
    return '';
  }
}

export function getMediaStorageCapabilities(): MediaStorageCapabilities {
  let configured = false;
  try {
    configured = Boolean(getBucket());
  } catch {
    configured = false;
  }
  return { provider: 'r2', configured, directUpload: false };
}

export function isManagedMediaUrl(value: unknown): boolean {
  return typeof value === 'string' && Boolean(mediaKey(value));
}

export async function putMedia(
  key: string,
  value: ArrayBuffer,
  contentType: string,
): Promise<string> {
  const bucket = getBucket();
  if (!bucket) throw new MediaStorageNotConfiguredError();
  await bucket.put(key, value, { httpMetadata: { contentType } });
  return `${MEDIA_PATH_PREFIX}${encodeURIComponent(key)}`;
}

export async function readMedia(value: string): Promise<StoredMedia | null> {
  const key = mediaKey(value);
  if (!key) return null;
  const bucket = getBucket();
  if (!bucket) throw new MediaStorageNotConfiguredError();
  const object = await bucket.get(key);
  if (!object) return null;
  const buffer = object.arrayBuffer
    ? await object.arrayBuffer()
    : await new Response(object.body).arrayBuffer();
  return {
    buffer,
    contentType:
      object.httpMetadata?.contentType || 'application/octet-stream',
  };
}

function baseHeaders(meta: R2HeadLike) {
  return {
    'Content-Type':
      meta.httpMetadata?.contentType || 'application/octet-stream',
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
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    start >= size ||
    end < start
  ) {
    return 'invalid' as const;
  }
  return { start, end: Math.min(end, size - 1) };
}

export async function serveMedia(
  request: Request,
  key: string,
  includeBody: boolean,
): Promise<Response> {
  const bucket = getBucket();
  if (!bucket) return new Response('bucket not bound', { status: 500 });

  const meta = await bucket.head(key);
  if (!meta) return new Response('not found', { status: 404 });
  const size = meta.size;
  const base = baseHeaders(meta);
  const range = parseRange(request.headers.get('range'), size);

  if (range === 'invalid') {
    return new Response('range not satisfiable', {
      status: 416,
      headers: { ...base, 'Content-Range': `bytes */${size}` },
    });
  }

  if (range) {
    const { start, end } = range;
    const length = end - start + 1;
    const headers = {
      ...base,
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Content-Length': String(length),
    };
    if (!includeBody) return new Response(null, { status: 206, headers });
    const object = await bucket.get(key, {
      range: { offset: start, length },
    });
    if (!object) return new Response('not found', { status: 404 });
    return new Response(object.body as unknown as BodyInit, {
      status: 206,
      headers,
    });
  }

  const headers = { ...base, 'Content-Length': String(size) };
  if (!includeBody) return new Response(null, { headers });
  const object = await bucket.get(key);
  if (!object) return new Response('not found', { status: 404 });
  return new Response(object.body as unknown as BodyInit, { headers });
}

export async function handleClientUploadRequest(
  _request: Request,
  _authorize: () => Promise<string>,
): Promise<Response> {
  return Response.json(
    { error: 'client_upload_not_supported_on_cloudflare' },
    { status: 404 },
  );
}
