import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // 只返回"可交付成片":排除逐镜/中间任务(templateId 含 ':' 如 adref:edit、sku:asset,或以 '-shot' 结尾如 mk-shot/drama-shot)。
  // 中间任务量大,若不在服务端排除,take 限额会被它们占满,导致真正的成片被挤出、在作品页静默丢失。
  const creations = await prisma.creation.findMany({
    where: {
      userId: session.user.id,
      NOT: [{ templateId: { contains: ':' } }, { templateId: { endsWith: '-shot' } }],
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  // creations 已含"生成中/失败的占位"(status=processing/failed):点生成即写占位,作品页据此展示"生成中/失败/成片"三态。
  return NextResponse.json({ creations });
}
