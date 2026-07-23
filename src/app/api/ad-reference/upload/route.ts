import { withAtlas } from '@/lib/request-context';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { AD_REF_MAX_VIDEO_BYTES, AD_REF_MAX_IMAGE_BYTES } from '@/lib/ad-reference';
import {
  MediaStorageNotConfiguredError,
  putMedia,
} from '@/lib/media-storage';

export const maxDuration = 60;

const EXT: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}

function sniffContentType(buffer: ArrayBuffer, declared: string): string {
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 12) {
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
    if (bytes[0] === 0x89 && ascii(bytes, 1, 4) === 'PNG') return 'image/png';
    if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return 'image/webp';
    if (ascii(bytes, 4, 8) === 'ftyp') {
      const brand = ascii(bytes, 8, 12);
      return brand === 'qt  ' ? 'video/quicktime' : 'video/mp4';
    }
  }
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return 'video/webm';
  }
  return declared;
}

// 无登录直连:参考视频/产品图/人像直接进自己的 R2(Atlas uploadMedia 对视频几 MB 就 413,不能走它)。
// 返回同源 media url(公网可达、带 Range,Atlas 后端可直接抓取)。
async function __byokPOST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'invalid_form' }, { status: 400 });
  }
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'file_required' }, { status: 400 });
  const buffer = await file.arrayBuffer();
  const ct = sniffContentType(buffer, file.type || 'application/octet-stream');
  const ext = EXT[ct];
  if (!ext) return NextResponse.json({ error: 'unsupported_type', detail: ct }, { status: 400 });
  const isVideo = ct.startsWith('video/');
  const max = isVideo ? AD_REF_MAX_VIDEO_BYTES : AD_REF_MAX_IMAGE_BYTES;
  if (buffer.byteLength > max) return NextResponse.json({ error: 'file_too_large', maxBytes: max }, { status: 400 });

  try {
    const key = `adref-${crypto.randomUUID()}.${ext}`;
    return NextResponse.json({ url: await putMedia(key, buffer, ct) });
  } catch (e) {
    if (e instanceof MediaStorageNotConfiguredError) {
      return NextResponse.json(
        { error: 'media_storage_not_configured' },
        { status: 500 },
      );
    }
    return NextResponse.json({ error: 'upload_failed', detail: String(e) }, { status: 502 });
  }
}

export const POST = withAtlas(__byokPOST);
