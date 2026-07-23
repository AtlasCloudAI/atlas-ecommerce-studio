import { getMediaStorageCapabilities } from '@/lib/media-storage';

export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json(getMediaStorageCapabilities(), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
