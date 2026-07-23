import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { handleClientUploadRequest } from '@/lib/media-storage';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  return handleClientUploadRequest(request, async () => {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) throw new Error('unauthorized');
    return session.user.id;
  });
}
