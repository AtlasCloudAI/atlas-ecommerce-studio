import { uploadBlobToAtlas, uploadRemoteMediaToAtlas } from '@/lib/atlas';
import { readMedia } from '@/lib/media-storage';
import { sameOriginMediaPath } from '@/lib/public-media-url';

// 同源 R2 媒体(/api/marketing-studio/media/<key>)不能让 Atlas 走公网 URL 自抓——
// Worker 自抓自己的 R2 路由在 CF 环境里会 404,Atlas 侧再抓就变成 1042 / "参数无效"。
// 这里统一:同源媒体走 bucket.get(key) 直读后 uploadBlobToAtlas;外部 URL 才走 uploadRemoteMediaToAtlas。
// ad-reference 的 character / edit 接口共用,避免各写一份。
const MEDIA_PATH_PREFIX = '/api/marketing-studio/media/';

export const ADREF_VIDEO_UPLOAD_LIMIT = 200_000_000;
export const ADREF_IMAGE_UPLOAD_LIMIT = 10_000_000;

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
  const media = await readMedia(path);
  if (!media) throw new Error(`media_not_found:${key}`);
  if (media.buffer.byteLength > maxBytes) {
    throw new Error(`media_too_large:${media.buffer.byteLength}`);
  }
  return uploadBlobToAtlas(
    new Blob([media.buffer], { type: media.contentType }),
    `${filenamePrefix}.${extensionForContentType(media.contentType)}`,
  );
}

// 把一个输入媒体(可能是同源 R2 路径,也可能是外部公网 URL)上传到 Atlas 临时媒体,返回 Atlas 可稳定抓取的 URL。
export async function uploadInputMediaToAtlas(
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
