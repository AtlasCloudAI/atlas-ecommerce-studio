const MAX_PROXY_BYTES = 25 * 1024 * 1024;
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

function extFromUrl(url: URL): string {
  return url.pathname.split('.').pop()?.toLowerCase() || '';
}

function isLargeMedia(contentType: string, ext: string): boolean {
  return (
    LARGE_MEDIA_EXTENSIONS.has(ext) ||
    contentType.startsWith('audio/') ||
    contentType.startsWith('video/') ||
    contentType.includes('model/') ||
    contentType.includes('zip') ||
    contentType.includes('octet-stream')
  );
}

// Default behavior is a 302 redirect to the original Atlas/OSS URL. Proxying
// large media through a serverless function quickly exhausts Vercel/Workers
// origin-transfer quotas, so only explicit small-file proxy requests are served.
export async function GET(req: Request) {
  const requestUrl = new URL(req.url);
  const url = requestUrl.searchParams.get('url');
  if (!url) return new Response('missing url', { status: 400 });

  let source: URL;
  try {
    source = new URL(url);
  } catch {
    return new Response('bad url', { status: 400 });
  }
  // SSRF guard: only proxy Atlas media hosts.
  if (!/(^|\.)aliyuncs\.com$|(^|\.)atlascloud\.ai$/.test(source.hostname)) {
    return new Response('forbidden', { status: 403 });
  }

  if (requestUrl.searchParams.get('proxy') !== '1') {
    return Response.redirect(source.toString(), 302);
  }

  const head = await fetch(source, { method: 'HEAD', cache: 'no-store' }).catch(() => null);
  if (!head?.ok) return Response.redirect(source.toString(), 302);

  const ct = head.headers.get('content-type') || 'application/octet-stream';
  const contentLength = Number(head.headers.get('content-length') || '0');
  const ext = extFromUrl(source);
  if (isLargeMedia(ct, ext) || contentLength > MAX_PROXY_BYTES) {
    return Response.redirect(source.toString(), 302);
  }

  const r = await fetch(source, { cache: 'no-store' });
  if (!r.ok || !r.body) return new Response('upstream error', { status: 502 });

  const safeExt = ext && /^[a-z0-9]{2,5}$/.test(ext)
    ? ext
    : ct.includes('png')
      ? 'png'
      : ct.includes('webp')
        ? 'webp'
        : 'jpg';

  return new Response(r.body, {
    headers: {
      'Content-Type': ct,
      'Content-Disposition': `attachment; filename="atlas-creation.${safeExt}"`,
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
