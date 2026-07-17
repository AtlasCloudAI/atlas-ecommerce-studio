import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const TYPES = new Set(['marketing-studio', 'drama-studio', 'ad-reference']);

// 点"生成"时创建一条"作品占位"(status=processing),让「我的作品」页立刻能看到"生成中"这条作品,
// 不再是"点了半天作品页还是空的"。完成时由 save-reel / ad-reference/save 用返回的 id 更新为成片;
// 中断/失败时由 /api/creations/[id] 的 POST 标记 failed。
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const type = TYPES.has(body.type) ? body.type : 'marketing-studio';
  const title = (typeof body.title === 'string' && body.title.trim() ? body.title.trim() : '生成中的作品').slice(0, 500);
  // drama 传结构化资产骨架(kind/characters/scenes)建"作品文件夹";其它类型不传,assets 保持 null 走原逻辑。
  const assets = body.assets && typeof body.assets === 'object' && !Array.isArray(body.assets) ? body.assets : undefined;
  const creation = await prisma.creation.create({
    data: {
      userId: session.user.id,
      templateId: type,
      model: type,
      prompt: title,
      status: 'processing',
      outputs: [],
      ...(assets ? { assets } : {}),
    },
  });
  return NextResponse.json({ id: creation.id });
}
