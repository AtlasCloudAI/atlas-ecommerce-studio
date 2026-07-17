import { withAtlas } from '@/lib/request-context';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  AD_REF_CHARACTER_MODEL,
  submitAdRefCharacter,
} from '@/lib/ad-reference';
import { uploadBlobToAtlas, uploadRemoteMediaToAtlas } from '@/lib/atlas';
import { chargeAndSubmit, chargeErrorResponse } from '@/lib/marketing-studio/gen-task';
import { videoCredits } from '@/lib/video-pricing';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { NonPublicMediaUrlError, sameOriginMediaPath, toAtlasMediaUrl } from '@/lib/public-media-url';

export const maxDuration = 60;

const WAN_IMAGE_LIMIT = 5_000_000;
const WAN_VIDEO_LIMIT = 200_000_000;
const MEDIA_PATH_PREFIX = '/api/marketing-studio/media/';

function extensionForContentType(contentType: string): string {
  const ct = contentType.toLowerCase();
  if (ct.includes('jpeg') || ct.includes('jpg')) return 'jpg';
  if (ct.includes('png')) return 'png';
  if (ct.includes('webp')) return 'webp';
  if (ct.includes('bmp')) return 'bmp';
  if (ct.includes('mp4')) return 'mp4';
  if (ct.includes('quicktime')) return 'mov';
  if (ct.includes('avi')) return 'avi';
  return 'bin';
}

async function uploadSameOriginMediaToAtlas(path: string, filenamePrefix: string, maxBytes: number): Promise<string> {
  const key = decodeURIComponent(path.slice(MEDIA_PATH_PREFIX.length).split('?')[0] || '');
  if (!key) throw new Error('media_key_required');
  const { env } = getCloudflareContext();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bucket = (env as any).MEDIA_BUCKET;
  if (!bucket) throw new Error('bucket_not_bound');
  const obj = await bucket.get(key);
  if (!obj) throw new Error(`media_not_found:${key}`);
  const buffer = await obj.arrayBuffer();
  if (buffer.byteLength > maxBytes) throw new Error(`media_too_large:${buffer.byteLength}`);
  const contentType = obj.httpMetadata?.contentType || 'application/octet-stream';
  return uploadBlobToAtlas(
    new Blob([buffer], { type: contentType }),
    `${filenamePrefix}.${extensionForContentType(contentType)}`,
  );
}

async function uploadInputMediaToAtlas(
  rawValue: unknown,
  publicUrl: string,
  req: Request,
  filenamePrefix: string,
  maxBytes: number,
): Promise<string> {
  const path = sameOriginMediaPath(rawValue, req);
  if (path) return uploadSameOriginMediaToAtlas(path, filenamePrefix, maxBytes);
  return uploadRemoteMediaToAtlas(publicUrl, filenamePrefix, maxBytes);
}

// Wan-2.2 Character Swap 不稳定接受 Workers/R2 URL,所以先上传到 Atlas 临时媒体 URL 再提交。
async function __byokPOST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const uid = session.user.id;

  const body = await req.json().catch(() => ({}));
  let videoUrl = '';
  let avatarUrl = '';
  try {
    videoUrl = toAtlasMediaUrl(body.videoUrl, req);
    avatarUrl = toAtlasMediaUrl(body.avatarUrl, req);
  } catch (e) {
    if (e instanceof NonPublicMediaUrlError) {
      return NextResponse.json({ error: 'media_url_not_public', detail: e.value }, { status: 400 });
    }
    throw e;
  }
  if (!videoUrl) return NextResponse.json({ error: 'video_url_required' }, { status: 400 });
  if (!avatarUrl) return NextResponse.json({ error: 'avatar_url_required' }, { status: 400 });

  // omni video-edit 按参考视频秒数计费(同 /edit);前端随 body.videoSeconds 传时长,缺省保守用 30s。
  const videoSeconds = Number(body.videoSeconds) > 0 ? Number(body.videoSeconds) : 30;

  try {
    const submit = await chargeAndSubmit({
      uid,
      cost: videoCredits(AD_REF_CHARACTER_MODEL, undefined, videoSeconds),
      ref: 'ad-reference:character',
      templateId: 'adref:character',
      model: AD_REF_CHARACTER_MODEL,
      prompt: 'Replace the presenter/person with the uploaded talent reference while preserving the video motion.',
      submit: async () => {
        const [atlasVideoUrl, atlasAvatarUrl] = await Promise.all([
          uploadInputMediaToAtlas(body.videoUrl, videoUrl, req, 'adref-character-video', WAN_VIDEO_LIMIT),
          uploadInputMediaToAtlas(body.avatarUrl, avatarUrl, req, 'adref-character-avatar', WAN_IMAGE_LIMIT),
        ]);
        return submitAdRefCharacter(atlasVideoUrl, atlasAvatarUrl);
      },
    });
    return NextResponse.json({ id: submit.id, getUrl: submit.getUrl });
  } catch (e) {
    return chargeErrorResponse(e, 'ad-reference/character');
  }
}

export const POST = withAtlas(__byokPOST);
