const LARGE_MEDIA_EXTENSIONS = new Set([
  'aac',
  'avi',
  'fbx',
  'glb',
  'gltf',
  'm4a',
  'mkv',
  'mov',
  'mp3',
  'mp4',
  'obj',
  'stl',
  'usdz',
  'wav',
  'webm',
  'zip',
]);

export function proxiedMediaUrl(url: string): string {
  return `/api/download?proxy=1&url=${encodeURIComponent(url)}`;
}

export function mediaDownloadUrl(url: string): string {
  return url;
}

function extensionOf(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    return pathname.split('.').pop()?.toLowerCase() || '';
  } catch {
    return '';
  }
}

function isLikelySmallImage(url: string): boolean {
  return /^(png|jpe?g|webp|gif|avif)$/i.test(extensionOf(url));
}

export async function fetchMediaBytes(url: string): Promise<Uint8Array> {
  try {
    const direct = await fetch(url, { mode: 'cors' });
    if (direct.ok) return new Uint8Array(await direct.arrayBuffer());
  } catch {
    /* try the guarded proxy for small image assets only */
  }

  const ext = extensionOf(url);
  if (LARGE_MEDIA_EXTENSIONS.has(ext) || !isLikelySmallImage(url)) {
    throw new Error('media_direct_fetch_failed');
  }

  const proxied = await fetch(proxiedMediaUrl(url));
  if (!proxied.ok) throw new Error(`media_proxy_fetch_failed_${proxied.status}`);
  return new Uint8Array(await proxied.arrayBuffer());
}
