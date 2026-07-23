import { put } from '@vercel/blob';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';

const MEDIA_PATH_PREFIX = '/api/marketing-studio/media/';
const BLOB_HOST_SUFFIX = '.public.blob.vercel-storage.com';

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
    super('blob_not_configured');
    this.name = 'MediaStorageNotConfiguredError';
  }
}

type DirectUploadKind =
  | 'ad-reference-image'
  | 'ad-reference-video'
  | 'reel';

type DirectUploadSpec = {
  prefix: string;
  contentTypes: string[];
  maximumSizeInBytes: number;
};

const DIRECT_UPLOAD_SPECS: Record<DirectUploadKind, DirectUploadSpec> = {
  'ad-reference-image': {
    prefix: 'adref-image-',
    contentTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maximumSizeInBytes: 10_000_000,
  },
  'ad-reference-video': {
    prefix: 'adref-video-',
    contentTypes: ['video/mp4', 'video/quicktime', 'video/webm'],
    maximumSizeInBytes: 200_000_000,
  },
  reel: {
    prefix: 'reel-',
    contentTypes: ['video/mp4'],
    maximumSizeInBytes: 200_000_000,
  },
};

function blobToken(): string {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) throw new MediaStorageNotConfiguredError();
  return token;
}

function isVercelBlobUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname.endsWith(BLOB_HOST_SUFFIX)
    );
  } catch {
    return false;
  }
}

function legacyMediaBase(): string {
  const value = process.env.CLOUDFLARE_MEDIA_BASE_URL
    ?.trim()
    .replace(/\/+$/, '');
  if (!value) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.origin
      : '';
  } catch {
    return '';
  }
}

function readableMediaUrl(value: string): string {
  const trimmed = value.trim();
  if (isVercelBlobUrl(trimmed)) return trimmed;

  let path = trimmed;
  if (/^https?:\/\//i.test(path)) {
    try {
      const url = new URL(path);
      path = `${url.pathname}${url.search}`;
    } catch {
      return '';
    }
  }
  if (!path.startsWith(MEDIA_PATH_PREFIX)) return '';
  const legacyBase = legacyMediaBase();
  return legacyBase ? new URL(path, legacyBase).toString() : '';
}

export function getMediaStorageCapabilities(): MediaStorageCapabilities {
  const configured = Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
  return {
    provider: 'vercel-blob',
    configured,
    directUpload: configured,
  };
}

export function isManagedMediaUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return (
    isVercelBlobUrl(value.trim()) ||
    (Boolean(legacyMediaBase()) &&
      value.trim().startsWith(MEDIA_PATH_PREFIX))
  );
}

export async function putMedia(
  key: string,
  value: ArrayBuffer,
  contentType: string,
): Promise<string> {
  const blob = await put(key, value, {
    access: 'public',
    addRandomSuffix: true,
    contentType,
    multipart: value.byteLength >= 5_000_000,
    token: blobToken(),
  });
  return blob.url;
}

export async function readMedia(value: string): Promise<StoredMedia | null> {
  const url = readableMediaUrl(value);
  if (!url) return null;
  const response = await fetch(url, { cache: 'no-store' });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`blob_read_failed:${response.status}`);
  }
  return {
    buffer: await response.arrayBuffer(),
    contentType:
      response.headers.get('content-type') || 'application/octet-stream',
  };
}

export async function serveMedia(
  _request: Request,
  key: string,
  _includeBody: boolean,
): Promise<Response> {
  const legacyBase = legacyMediaBase();
  if (!legacyBase) {
    return new Response(
      'Legacy R2 media is unavailable. Set CLOUDFLARE_MEDIA_BASE_URL or migrate the object to Vercel Blob.',
      { status: 404 },
    );
  }
  const encodedKey = key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return Response.redirect(
    new URL(`${MEDIA_PATH_PREFIX}${encodedKey}`, legacyBase),
    307,
  );
}

function parseClientPayload(clientPayload: string | null): DirectUploadKind {
  let value: unknown;
  try {
    value = JSON.parse(clientPayload || '{}');
  } catch {
    throw new Error('invalid_client_payload');
  }
  const kind =
    value && typeof value === 'object' && 'kind' in value
      ? (value as { kind?: unknown }).kind
      : undefined;
  if (
    kind !== 'ad-reference-image' &&
    kind !== 'ad-reference-video' &&
    kind !== 'reel'
  ) {
    throw new Error('invalid_upload_kind');
  }
  return kind;
}

export async function handleClientUploadRequest(
  request: Request,
  authorize: () => Promise<string>,
): Promise<Response> {
  const body = (await request.json()) as HandleUploadBody;
  try {
    const response = await handleUpload({
      body,
      request,
      token: blobToken(),
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const userId = await authorize();
        const kind = parseClientPayload(clientPayload);
        const spec = DIRECT_UPLOAD_SPECS[kind];
        if (
          !pathname.startsWith(spec.prefix) ||
          pathname.includes('/') ||
          !/^[a-z0-9][a-z0-9._-]+$/i.test(pathname)
        ) {
          throw new Error('invalid_upload_path');
        }
        return {
          addRandomSuffix: true,
          allowedContentTypes: spec.contentTypes,
          maximumSizeInBytes: spec.maximumSizeInBytes,
          cacheControlMaxAge: 31_536_000,
          tokenPayload: JSON.stringify({ userId, kind }),
        };
      },
      onUploadCompleted: async () => {
        // The browser receives the public URL directly.
      },
    });
    return Response.json(response);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
