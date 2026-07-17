import { withAtlas } from '@/lib/request-context';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { uploadMedia } from '@/lib/atlas';

export const maxDuration = 60;

// 上传参考图到 Atlas 拿持久 URL:需登录(防匿名滥用上传额度),不扣费。失败记日志 + 透传 detail。
async function __byokPOST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const dataUrl = typeof body.dataUrl === 'string' ? body.dataUrl : '';
  if (!dataUrl.startsWith('data:image/')) return NextResponse.json({ error: 'invalid_image' }, { status: 400 });
  if (dataUrl.length > 8_000_000) return NextResponse.json({ error: 'image_too_large' }, { status: 400 });

  try {
    const url = await uploadMedia(dataUrl, 'mk-asset');
    if (!/^https?:\/\//.test(url)) throw new Error('upload returned no url');
    return NextResponse.json({ url });
  } catch (e) {
    console.error('[marketing/upload] atlas error:', String(e));
    return NextResponse.json({ error: 'upload_failed', detail: String(e) }, { status: 502 });
  }
}

export const POST = withAtlas(__byokPOST);
