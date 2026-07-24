import { withAtlas } from '@/lib/request-context';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { atlasChat } from '@/lib/atlas';
import { mediaToDataUri } from '@/lib/marketing-studio/r2';
import { getFormat } from '@/lib/marketing-studio/formats';

export const maxDuration = 60;

// 多模态 LLM(gemini,能看图)把简短描述 + 上传的产品图/人物图 扩写成完美 UGC 视频 prompt。
// 图片从 R2 读成 base64 内联(不给 LLM 外链 URL,否则海外 LLM 拉 workers.dev 图超时)→ 模型真正"看到"
// 产品是什么(化妆品/水杯/耳机…),扩写才贴合实际产品。台词语言跟随输入语言。
const MODEL = process.env.MK_EXPAND_MODEL || 'google/gemini-2.5-flash';
type Part = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };

async function __byokPOST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const brief = typeof body.brief === 'string' ? body.brief.trim().slice(0, 1200) : '';
  if (!brief) return NextResponse.json({ error: 'brief_required' }, { status: 400 });

  // 从 R2 把图读成 base64 内联(避免让 gemini 拉 workers.dev URL 超时)。产品图支持多张(productUrls[]),兼容旧单 productUrl。
  const productUrls: string[] = Array.isArray(body.productUrls)
    ? body.productUrls.filter((u: unknown): u is string => typeof u === 'string' && !!u)
    : (typeof body.productUrl === 'string' && body.productUrl ? [body.productUrl] : []);
  const productImgs = (await Promise.all(productUrls.slice(0, 4).map((u) => mediaToDataUri(u)))).filter(Boolean);
  const avatarImg = typeof body.avatarUrl === 'string' ? await mediaToDataUri(body.avatarUrl) : '';

  // 玩法(format)注入:让扩写贴合当前选中的玩法(素人口播/情侣共享/开箱 ASMR…)的叙事、节奏、镜头。
  const fmt = getFormat(typeof body.formatId === 'string' ? body.formatId : 'none');
  const fmtLine = fmt && fmt.id !== 'none'
    ? `AD FORMAT — this video uses the "${fmt.label}"${fmt.zh ? ` (${fmt.zh})` : ''} format. Follow this format's narrative & shot recipe exactly: ${fmt.hint} The presenter, pacing, framing and the spoken line must all fit this format.`
    : '';
  const sys = [
    'You are an expert UGC video-ad prompt writer for an image-to-video model.',
    'CRITICAL LANGUAGE RULE: detect the language of the user brief. If the brief is in Chinese, write the ENTIRE prompt — every sentence of scene description AND the spoken dialogue — in natural Chinese. If the brief is in English, write everything in English. Never output English when the brief is Chinese.',
    fmtLine,
    'You may be given ONE OR MORE PRODUCT images and a PRESENTER image. LOOK CAREFULLY at every image and identify what the product ACTUALLY is (e.g. skincare serum, coffee tumbler, wireless earbuds). If several product images are given, they may be the same product from different angles or several products featured in the ad — reference ALL of them and keep each pixel-identical to its image. The expanded prompt MUST match the real product(s) in the images — their exact category, material, size, and the realistic way each is shown/used/demonstrated. Do NOT invent a different product.',
    'START the prompt by concretely describing the product itself — its color, material, shape/size and any visible label or logo — so the product is unmistakable on screen; THEN describe the presenter, scene and how they use it. Do not skip the product description.',
    'Write ONE vivid, COMPLETE, self-contained shooting prompt (about 150-220 words) for a vertical 9:16 video. Cover in order: the product; the presenter and scene/lighting; front-camera selfie style with slight natural hand movement and casual real framing; how the presenter shows/uses THIS specific product. You MUST END with a natural spoken line of dialogue in double quotes said straight to camera. Never cut off mid-sentence and never omit the dialogue.',
    productImgs.length ? 'Refer to the product(s) as "the product shown in the provided product image(s)" (or in Chinese, 提供的产品图里的产品) and keep them identical to the images.' : 'No product image provided — describe the product vividly from the brief.',
    avatarImg ? 'Refer to the presenter as "the person shown in the provided portrait image" (or 提供的人物图里的人物), keep their exact face/identity.' : '',
    'Output ONLY the final prompt text — no preamble, no numbering, no surrounding quotes, no markdown.',
  ].filter(Boolean).join('\n');

  const parts: Part[] = [{ type: 'text', text: brief }];
  for (const img of productImgs) parts.push({ type: 'image_url', image_url: { url: img } });
  if (avatarImg) parts.push({ type: 'image_url', image_url: { url: avatarImg } });

  try {
    const raw = await atlasChat(
      [{ role: 'system', content: sys }, { role: 'user', content: parts }],
      MODEL, null, 55000,
    );
    const prompt = (raw || '').trim().replace(/^```[a-z]*\n?|\n?```$/g, '').trim();
    if (!prompt) return NextResponse.json({ error: 'empty_output' }, { status: 502 });
    return NextResponse.json({ prompt });
  } catch (e) {
    return NextResponse.json({ error: 'expand_failed', detail: String((e as Error).message || e).slice(0, 300) }, { status: 502 });
  }
}

export const POST = withAtlas(__byokPOST);
