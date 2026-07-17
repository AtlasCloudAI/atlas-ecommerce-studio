import { withAtlas } from '@/lib/request-context';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { marketingPlanSchema } from '@/lib/marketing-studio/schema';
import { buildShotImagePrompt, buildShotImageEditPrompt, normalizeRatio, submitShotImage, MK_IMAGE_COST, SHOT_IMAGE_MODEL, SHOT_IMAGE_EDIT_MODEL } from '@/lib/marketing-studio/workflow';
import { chargeAndSubmit, chargeErrorResponse } from '@/lib/marketing-studio/gen-task';

export const maxDuration = 60;

// 产品图/头像图可能是本站相对路径(/api/marketing-studio/media/...),但 Atlas edit 需要公网绝对 URL。
// 之前用 /^https?:\/\// 直接过滤掉相对路径 → refImages 为空 → 出图退回纯文生图、根本没用上传的产品图
// (用户实测"根本没参考传入的图片"即此因)。这里把本站相对路径按请求来源补成绝对 URL。
function toAbsMedia(v: unknown, base: string): string {
  const s = typeof v === 'string' ? v.trim() : '';
  if (s.startsWith('/api/marketing-studio/media/')) return new URL(s, base).toString();
  return /^https?:\/\//.test(s) ? s : '';
}

// 逐镜出图(nano-banana):需登录 + 扣 MK_IMAGE_COST;提交失败退款、异步失败由 poll 退款,Atlas 报错透传。
async function __byokPOST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const uid = session.user.id;

  const body = await req.json().catch(() => ({}));
  const parsed = marketingPlanSchema.safeParse(body.plan);
  if (!parsed.success) return NextResponse.json({ error: 'invalid_plan' }, { status: 400 });
  const plan = parsed.data;
  const idx = Number(body.shotIndex);
  const shot = Number.isInteger(idx) ? plan.shots[idx] : undefined;
  if (!shot) return NextResponse.json({ error: 'shot_index_out_of_range' }, { status: 400 });

  const ratio = normalizeRatio(plan.ratio);
  // 产品图支持多张(productUrls[]);兼容旧的单 productUrl。avatar 单张。edit 参考图最多 4 张(submitShotImage 会 slice)。
  const rawProducts = Array.isArray(body.productUrls) ? body.productUrls : [body.productUrl];
  const productUrls: string[] = rawProducts.map((u: unknown) => toAbsMedia(u, req.url)).filter(Boolean);
  const avatarUrl = toAbsMedia(body.avatarUrl, req.url);
  // avatar 放最前:多张产品图 + 人像超过 submitShotImage 的 slice(4) 上限时,优先保住人像(否则口播主体丢脸)。
  const refImages = [avatarUrl, ...productUrls].filter(Boolean);
  const useEdit = refImages.length > 0;
  // 复刻模式:前端直传出图 prompt(真人手持该产品的构图),优先于自动构造的 prompt。
  const promptOverride = typeof body.promptOverride === 'string' ? body.promptOverride.trim().slice(0, 3000) : '';
  const base = promptOverride || (useEdit
    ? buildShotImageEditPrompt(plan, shot, productUrls.length > 0, !!avatarUrl)
    : buildShotImagePrompt(plan, shot));
  // 首帧出图硬约束去字幕:promptOverride 常是含台词的口播脚本,edit 会把台词画成对话气泡/字幕,这里强制禁掉。
  const prompt = `${base} ABSOLUTELY NO text of any kind in the image: no speech bubbles, no captions, no subtitles, no dialogue text, no logo, no watermark.`;

  try {
    const submit = await chargeAndSubmit({
      uid,
      cost: MK_IMAGE_COST,
      ref: 'marketing:shot-image',
      templateId: 'mk-shot',
      model: useEdit ? SHOT_IMAGE_EDIT_MODEL : SHOT_IMAGE_MODEL,
      prompt,
      submit: () => submitShotImage(prompt, ratio, refImages),
    });
    return NextResponse.json({ id: submit.id, getUrl: submit.getUrl });
  } catch (e) {
    return chargeErrorResponse(e, 'marketing/shot-image');
  }
}

export const POST = withAtlas(__byokPOST);
