'use client';

import { upload } from '@vercel/blob/client';

type DirectUploadKind = 'ad-reference' | 'reel';

type MediaStorageCapabilities = {
  provider: 'r2' | 'vercel-blob';
  configured: boolean;
  directUpload: boolean;
};

let capabilitiesPromise: Promise<MediaStorageCapabilities> | undefined;

async function mediaStorageCapabilities(): Promise<MediaStorageCapabilities> {
  capabilitiesPromise ??= fetch('/api/media-storage/capabilities', {
    cache: 'no-store',
  })
    .then(async (response) => {
      const body = (await response
        .json()
        .catch(() => ({}))) as Partial<MediaStorageCapabilities>;
      if (
        !response.ok ||
        (body.provider !== 'r2' && body.provider !== 'vercel-blob')
      ) {
        throw new Error('media_storage_capabilities_failed');
      }
      return {
        provider: body.provider,
        configured: body.configured === true,
        directUpload: body.directUpload === true,
      };
    })
    .catch((error) => {
      capabilitiesPromise = undefined;
      throw error;
    });
  return capabilitiesPromise;
}

function extensionForUpload(file: Blob, filename: string): string {
  const fromName = /\.([a-z0-9]{1,8})$/i.exec(filename)?.[1]?.toLowerCase();
  if (fromName) return fromName;
  const contentType = file.type.toLowerCase();
  if (contentType === 'image/jpeg') return 'jpg';
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/webp') return 'webp';
  if (contentType === 'video/quicktime') return 'mov';
  if (contentType === 'video/webm') return 'webm';
  return 'mp4';
}

function uploadDescriptor(file: Blob, kind: DirectUploadKind) {
  if (kind === 'reel') {
    return { tokenKind: 'reel', prefix: 'reel-' } as const;
  }
  if (file.type.startsWith('image/')) {
    return {
      tokenKind: 'ad-reference-image',
      prefix: 'adref-image-',
    } as const;
  }
  return {
    tokenKind: 'ad-reference-video',
    prefix: 'adref-video-',
  } as const;
}

// Returns a Blob URL on Vercel, or an empty string on Cloudflare so callers
// keep using the existing R2 API route.
export async function uploadDirectMediaIfSupported(
  file: Blob,
  options: { kind: DirectUploadKind; filename: string },
): Promise<string> {
  const capabilities = await mediaStorageCapabilities();
  if (capabilities.provider !== 'vercel-blob') return '';
  if (!capabilities.configured || !capabilities.directUpload) {
    throw new Error('blob_not_configured');
  }

  const descriptor = uploadDescriptor(file, options.kind);
  const pathname =
    `${descriptor.prefix}${crypto.randomUUID()}.` +
    extensionForUpload(file, options.filename);
  const blob = await upload(pathname, file, {
    access: 'public',
    contentType: file.type || 'application/octet-stream',
    handleUploadUrl: '/api/media-storage/client-upload',
    clientPayload: JSON.stringify({ kind: descriptor.tokenKind }),
    multipart: file.size >= 5_000_000,
  });
  return blob.url;
}
