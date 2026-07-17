import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// drama 作品文件夹的结构化资产更新。前端持有完整 assets(single source of truth),
// 在关键节点(定妆图全部完成 / 每镜完成 / 成片完成)把最新整份 assets 覆盖写进 Creation。
// 覆盖写而非深合并:drama 是单用户单会话顺序操作,前端 state 完整,覆盖最简单可靠。只允许本人。
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const assets = body.assets;
  if (!assets || typeof assets !== 'object' || Array.isArray(assets)) {
    return NextResponse.json({ error: 'bad_assets' }, { status: 400 });
  }

  const c = await prisma.creation.findUnique({ where: { id: params.id } });
  if (!c || c.userId !== session.user.id) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  await prisma.creation.update({ where: { id: c.id }, data: { assets } });
  return NextResponse.json({ ok: true });
}
