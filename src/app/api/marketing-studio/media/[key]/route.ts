import { serveMedia } from '@/lib/media-storage';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: { key: string } },
) {
  return serveMedia(request, params.key, true);
}

export async function HEAD(
  request: Request,
  { params }: { params: { key: string } },
) {
  return serveMedia(request, params.key, false);
}
