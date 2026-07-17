import { submitRawGen } from '@/lib/atlas';
import type { MarketingPlan, AdShot } from './schema';

/** in-app 积分成本 */
export const MK_PLAN_COST = 3;
export const MK_IMAGE_COST = 5; // 每镜出图,按 nano-banana-2 当前约 $0.08 定价
export const MK_VIDEO_COST = 12; // 每镜 Seedance 2.0 i2v,按当前约 $0.09 + SaaS 毛利定价

export const SHOT_IMAGE_MODEL = process.env.MK_SHOT_IMAGE_MODEL || 'google/nano-banana-2/text-to-image';
// ⚠️ 用老版 nano-banana/edit,不用 nano-banana-2/edit:实测后者服务端间歇性 400
// "Request parameters are invalid"(6 次里挂 4 次,~50-75%),drama 首帧每镜几乎必挂;老版实测无 400、~15s 出图、质量够 UGC/短剧。
export const SHOT_IMAGE_EDIT_MODEL = process.env.MK_SHOT_IMAGE_EDIT_MODEL || 'google/nano-banana/edit';
export const SHOT_VIDEO_MODEL = process.env.MK_SHOT_VIDEO_MODEL || 'bytedance/seedance-2.0/image-to-video';
// 复刻/生成的视频模型:seedance-2.0/image-to-video —— prompt 里带台词 + generate_audio 即可对口型说话,
// 单步、最便宜(比 veo3.1 省),且吃用户选的时长。实测靠 prompt 台词就能出带音轨的口播,无需 TTS/reference_audios。
export const REPLICA_VIDEO_MODEL = process.env.MK_REPLICA_VIDEO_MODEL || 'bytedance/seedance-2.0/image-to-video';
// drama 逐镜:把 产品图 + 角色定妆图 + 场景图 一次性喂给 reference-to-video 直接出视频,
// prompt 里 @image1.. 按 reference_images 顺序绑定;比"edit 合成首帧→i2v"少一步损耗,一致性由多参考锁定。
export const SHOT_REF_VIDEO_MODEL = process.env.MK_SHOT_REF_VIDEO_MODEL || 'bytedance/seedance-2.0/reference-to-video';

const RATIOS = new Set(['9:16', '16:9', '1:1', '4:3', '3:4']);
const VIDEO_RATIOS = new Set(['9:16', '16:9', '1:1', '4:3', '3:4', '21:9', 'adaptive']);
const VIDEO_RESOLUTIONS = new Set(['480p', '720p', '720p-SR', '1080p', '1080p-SR', '1440p-SR', '4k']);
const VIDEO_DURATIONS = new Set([-1, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);

export function normalizeRatio(v: unknown): string {
  return typeof v === 'string' && RATIOS.has(v) ? v : '9:16';
}
export function normalizeVideoRatio(v: unknown): string {
  return typeof v === 'string' && VIDEO_RATIOS.has(v) ? v : '9:16';
}
export function normalizeVideoResolution(v: unknown): string {
  return typeof v === 'string' && VIDEO_RESOLUTIONS.has(v) ? v : '720p';
}
export function normalizeVideoDuration(v: unknown): number {
  const n = Number(v);
  return VIDEO_DURATIONS.has(n) ? n : 15;
}
export function cleanText(v: unknown, fallback = '', max = 2000): string {
  return typeof v === 'string' ? v.trim().slice(0, max) || fallback : fallback;
}
export function normalizeShotCount(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(2, Math.min(6, Math.round(n))) : 4;
}

/** 逐镜出图 prompt(无上传图时):靠文字描述锁产品 */
export function buildShotImagePrompt(plan: MarketingPlan, shot: AdShot): string {
  const text = `${plan.scene} ${shot.shot} ${shot.prompt}`.toLowerCase();
  const sceneOnly = text.includes('no presenter') || text.includes('no human') || text.includes('cinematic product scene');
  return [
    `ENGLISH ${plan.ratio} photo, ultra-photorealistic ${sceneOnly ? 'cinematic product advertising' : 'UGC social-media'} style, natural daylight, no filter.`,
    plan.character ? `Person: ${plan.character}.` : '',
    `Product (must look identical in every shot): ${plan.product}.`,
    plan.scene ? `Scene: ${plan.scene}.` : '',
    `Shot: ${shot.shot || 'medium selfie shot holding the product toward the camera'}.`,
    shot.prompt ? `Action and motion intent: ${shot.prompt}.` : '',
    sceneOnly
      ? 'Photorealistic environment, realistic physics, cinematic lighting, no text no watermark no logo.'
      : 'True-to-life skin tone, handheld selfie feel, upper body, no text no watermark no logo.',
  ]
    .filter(Boolean)
    .join(' ');
}

/** 逐镜出图 prompt(有上传的真图时):用输入图里的真实产品/人物,一致性最强 */
export function buildShotImageEditPrompt(plan: MarketingPlan, shot: AdShot, hasProduct: boolean, hasAvatar: boolean): string {
  const text = `${plan.scene} ${shot.shot} ${shot.prompt}`.toLowerCase();
  const wantsPresenter = hasAvatar || !!plan.character;
  const sceneOnly = text.includes('no presenter') || text.includes('no human') || text.includes('cinematic product scene');
  return [
    `ENGLISH ${plan.ratio} ultra-photorealistic UGC social-media photo, natural daylight, no filter.`,
    hasProduct
      ? 'Use the EXACT product shown in the provided product image — keep its shape, color, materials, logo and text pixel-identical, do not redesign it.'
      : `Product: ${plan.product}.`,
    wantsPresenter
      ? (hasAvatar
        ? 'Use the person shown in the provided avatar image as the presenter — keep the same face and identity.'
        : `Presenter: ${plan.character}.`)
      : '',
    wantsPresenter && !sceneOnly
      ? 'Compose them together: the presenter is holding / showing / using this exact product.'
      : 'Place the exact product naturally inside the requested cinematic scene; no presenter or human unless the request explicitly asks for one.',
    plan.scene ? `Scene: ${plan.scene}.` : '',
    `Shot: ${shot.shot || 'medium selfie shot holding the product toward the camera'}.`,
    shot.prompt ? `Action and motion intent: ${shot.prompt}.` : '',
    sceneOnly && !wantsPresenter
      ? 'Photorealistic environment, realistic physics, cinematic lighting, no added text no watermark no logo.'
      : 'Handheld selfie feel, true-to-life skin, upper body, no added text no watermark no logo.',
  ]
    .filter(Boolean)
    .join(' ');
}

/** nano-banana 出图:有参考图走 edit(吃真图),无则 text-to-image */
export async function submitShotImage(prompt: string, ratio: string, refImages?: string[]) {
  const imgs = (refImages || []).filter((u) => typeof u === 'string' && /^https?:\/\//.test(u)).slice(0, 4);
  if (imgs.length) {
    // ⚠️ nano-banana-2/edit 的比例参数名是 image_size(值如 '9:16'),不是 aspect_ratio。
    // 传 aspect_ratio 或完全不传比例参数,提交都返回 200 但 GET prediction 会 400
    // "Request parameters are invalid"(drama 首帧 edit 必现;marketing 复刻靠 promptOverride 退回 t2i 才侥幸没暴露)。
    // 实测 image_size:'9:16' → completed。
    return submitRawGen('generateImage', {
      model: SHOT_IMAGE_EDIT_MODEL,
      images: imgs,
      prompt,
      image_size: ratio,
    });
  }
  return submitRawGen('generateImage', {
    model: SHOT_IMAGE_MODEL,
    prompt,
    aspect_ratio: ratio,
    resolution: '2k',
  });
}

/** Seedance 2.0 image-to-video:首帧字段用 image,可原生生成对白/音效。 */
export async function submitShotVideo(
  imageUrl: string,
  prompt: string,
  opts: { ratio?: unknown; resolution?: unknown; duration?: unknown; model?: string } = {},
) {
  const model = typeof opts.model === 'string' && opts.model ? opts.model : SHOT_VIDEO_MODEL;
  const payload: Record<string, unknown> = {
    model,
    image: imageUrl,
    prompt,
  };
  if (model.includes('seedance-2.0')) {
    Object.assign(payload, {
      duration: normalizeVideoDuration(opts.duration),
      resolution: normalizeVideoResolution(opts.resolution),
      ratio: normalizeVideoRatio(opts.ratio),
      bitrate_mode: 'standard',
      generate_audio: true,
      watermark: false,
      return_last_frame: false,
    });
  }
  // 其他模型(veo3.1-fast 等):只传 model/image/prompt,原生音频 + 默认时长,不加 seedance 专属字段。
  return submitRawGen('generateVideo', payload);
}

/** Seedance 2.0 reference-to-video:多张参考图(产品图/角色定妆图/场景图)直接出视频。
 *  prompt 里用 @image1、@image2…(按 reference_images 顺序)绑定各参考图,generate_audio 出对白。 */
export async function submitShotRefVideo(
  referenceImages: string[],
  prompt: string,
  opts: { ratio?: unknown; resolution?: unknown; duration?: unknown } = {},
) {
  const imgs = referenceImages.filter((u) => typeof u === 'string' && /^https?:\/\//.test(u)).slice(0, 9);
  return submitRawGen('generateVideo', {
    model: SHOT_REF_VIDEO_MODEL,
    prompt,
    reference_images: imgs,
    duration: normalizeVideoDuration(opts.duration),
    resolution: normalizeVideoResolution(opts.resolution),
    ratio: normalizeVideoRatio(opts.ratio),
    bitrate_mode: 'standard',
    generate_audio: true,
    watermark: false,
    return_last_frame: false,
  });
}
