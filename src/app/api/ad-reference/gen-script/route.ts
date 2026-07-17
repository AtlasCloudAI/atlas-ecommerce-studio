import { withAtlas } from '@/lib/request-context';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { atlasChat } from '@/lib/atlas';
import { mediaToDataUri } from '@/lib/marketing-studio/r2';

export const maxDuration = 60;

// 用户勾了换声音但没填脚本时,自动生成一段 UGC 口播台词。多模态看产品图 → 台词贴合真实产品;语言跟随描述。
const MODEL = process.env.MK_EXPAND_MODEL || 'google/gemini-2.5-flash';
type Part = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };

async function __byokPOST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const productNote = typeof body.productNote === 'string' ? body.productNote.trim().slice(0, 500) : '';
  const extraNote = typeof body.extraNote === 'string' ? body.extraNote.trim().slice(0, 500) : '';
  const productImg = typeof body.productUrl === 'string' ? await mediaToDataUri(body.productUrl) : '';
  const avatarImg = typeof body.avatarUrl === 'string' ? await mediaToDataUri(body.avatarUrl) : '';

  const brief = [productNote && `产品:${productNote}`, extraNote && `补充:${extraNote}`].filter(Boolean).join(' / ') || '(请看图判断产品)';
  const sys = [
    '你是爆款短视频广告编剧。为一条 UGC 口播广告写一段第一人称、对着镜头说的台词。',
    '仔细看提供的产品图:识别真实产品(护肤/饮料/数码/日用等)、看清外观/包装/卖点线索,抓住这个产品最打动人的 1-2 个卖点和最真实的使用场景来写。',
    '要求:口语自然、开头 3 秒强钩子、中间讲清卖点+使用场景、结尾一句有力安利或行动号召;12-22 秒能说完(约 70-110 字中文 / 45-75 词英文),拆成 2-3 个短句,像真人激动分享不像硬广。',
    '语言:自动识别产品描述/补充说明所用的语言,台词就用该语言(中文→中文、英文→英文、日文→日文等任意语种);都为空则默认中文。',
    '只输出台词本身,不要加引号、不要旁白说明、不要 markdown。',
  ].join('\n');

  const parts: Part[] = [{ type: 'text', text: brief }];
  if (productImg) parts.push({ type: 'image_url', image_url: { url: productImg } });
  if (avatarImg) parts.push({ type: 'image_url', image_url: { url: avatarImg } });

  try {
    const raw = await atlasChat([{ role: 'system', content: sys }, { role: 'user', content: parts }], MODEL, 800, 55000);
    const script = (raw || '').trim().replace(/^```[a-z]*\n?|\n?```$/g, '').replace(/^["“”']|["“”']$/g, '').trim();
    if (!script) return NextResponse.json({ error: 'empty_output' }, { status: 502 });
    return NextResponse.json({ script });
  } catch (e) {
    return NextResponse.json({ error: 'gen_script_failed', detail: String((e as Error).message || e).slice(0, 300) }, { status: 502 });
  }
}

export const POST = withAtlas(__byokPOST);
