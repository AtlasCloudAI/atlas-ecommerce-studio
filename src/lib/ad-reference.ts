import { submitRawGen } from '@/lib/atlas';

/**
 * 爆款广告复刻(Ad Reference):上传一条参考广告视频,把里面的 人/产品/声音/台词 换成你的。
 * 核心 = google/gemini-omni-flash/video-edit 一步同时换出镜人+产品(编辑原片、保运镜/节奏/原生音频),
 * 可选 elevenlabs 新配音 + veed/lipsync 对口型(换声音和台词)。
 * 2026-07-16:Wan-2.2/animate-mix 换人效果差且不复刻原片动作(会重编运镜/构图/服装),回归纯 omni——
 * 一次 video-edit 换人+换产品(实测 scratchpad/e2e-swap 碾压 seedance 重生成);
 * omni 换人偶发异步失败(1010002)由前端 submit+poll 自动重试兜底。
 */

export const AD_REF_EDIT_MODEL = 'google/gemini-omni-flash/video-edit';
// 换人已并入 edit(同一次 omni video-edit 换人+换产品)。此常量仅兼容旧 /character 接口,同样走 omni。
export const AD_REF_CHARACTER_MODEL = 'google/gemini-omni-flash/video-edit';
export const AD_REF_TTS_MODEL = 'elevenlabs/v3/text-to-speech';
export const AD_REF_LIPSYNC_MODEL = 'veed/lipsync';
// 兜底换人:omni 换真人撞 deepfake(1010002)时改用 kling 动作迁移——出镜人图 + 原视频当动作源,
// 让你的人做原片动作(驱动你自己的图、不篡改原视频真人,不触发 1010002)。kling 输入 image/video ≤10MB。
export const AD_REF_MOTION_MODEL = 'kwaivgi/kling-v2.6-pro/motion-control';

// in-app 积分成本:按 Atlas 实时成本的大致比例 + SaaS 毛利定价。
export const AD_REF_EDIT_COST = 15;
export const AD_REF_CHARACTER_COST = 15;
export const AD_REF_VOICE_COST = 10;
export const AD_REF_LIPSYNC_COST = 2;
export const AD_REF_MOTION_COST = 15;

// gemini-omni video-edit 输入限制:≤100MB / ≤30s;上传给自己 R2 的兜底上限
export const AD_REF_MAX_VIDEO_BYTES = 60_000_000;
export const AD_REF_MAX_IMAGE_BYTES = 10_000_000;

// elevenlabs v3 多语言音色白名单(id 来自模型 schema enum)
export const AD_REF_VOICES = [
  { id: 'hpp4J3VqNfWAUOO0d1Us', label: '女声 · 清亮' },
  { id: 'EXAVITQu4vr4xnSDxMaL', label: '女声 · 温柔 (Bella)' },
  { id: 'CwhRBWXzGAHq8TQ4Fs17', label: '男声 · 松弛' },
] as const;
export function isValidVoice(v: unknown): v is string {
  return typeof v === 'string' && AD_REF_VOICES.some((x) => x.id === v);
}

export function cleanRefText(v: unknown, fallback = '', max = 1200): string {
  return typeof v === 'string' ? v.trim().slice(0, max) || fallback : fallback;
}

/**
 * 由结构化输入组装 video-edit 编辑指令(英文,已实测的模板):
 * 参考图动态编号:先人像后产品,prompt 里用 "reference image N" 指回。
 */
export function buildEditRequest({
  videoUrl,
  avatarUrl,
  productUrl,
  productNote,
  extraNote,
}: {
  videoUrl: string;
  avatarUrl?: string;
  productUrl?: string;
  productNote?: string;
  extraNote?: string;
}) {
  const images: string[] = [];
  const parts: string[] = [
    'Keep the SAME scene, background, lighting, camera framing, camera motion, cuts, pacing and overall energy of the source video.',
  ];
  if (avatarUrl) {
    images.push(avatarUrl);
    parts.push(
      `Replace the presenter/person in the video with the person shown in reference image ${images.length} — use their exact face, hair and identity, keep the same head and hand motion, gestures and expressiveness. If the original person is talking, the new person talks the same way.`,
    );
  }
  if (productUrl) {
    images.push(productUrl);
    parts.push(
      `Replace only the product held/shown in the video with the exact product shown in reference image ${images.length}. Keep its exact shape, colors, materials, cap/lid, packaging, label layout, logos, visible text, typography, color blocks and small details${productNote ? ` (${productNote})` : ''}. If the product has a printed label or brand text, keep that label front-facing and legible whenever the original product faces camera. Do not simplify it into a generic product, do not remove or blur the label, and do not change the presenter/person, hand pose, scene, lighting, camera motion or pacing.`,
    );
  }
  if (extraNote) parts.push(extraNote);
  parts.push('Photorealistic, natural, no added on-screen text, no watermark.');
  return {
    prompt: parts.join(' '),
    images,
  };
}

/** 出片:gemini-omni-flash 直接编辑原视频(原生音频)。 */
export async function submitAdRefEdit(videoUrl: string, prompt: string, images: string[]) {
  return submitRawGen('generateVideo', {
    model: AD_REF_EDIT_MODEL,
    video: videoUrl,
    prompt,
    ...(images.length ? { images: images.slice(0, 3) } : {}),
    resolution: '720p',
    thinking_level: 'high',
    seed: -1,
  });
}

/** 换出镜人(兼容旧 /character 接口):omni video-edit 只换人,保留场景/产品/运镜/原声。 */
export async function submitAdRefCharacter(videoUrl: string, imageUrl: string) {
  const prompt = [
    'Keep the SAME scene, background, product, outfit, lighting, camera framing, camera motion, cuts, pacing and overall energy of the source video.',
    'Replace ONLY the presenter/person with the person shown in reference image 1 — use their exact face, hair and identity, and keep the same head and hand motion, gestures, expressions and the way they talk. Do not change the product, the scene or the camera work.',
    'Photorealistic, natural, no added on-screen text, no watermark.',
  ].join(' ');
  return submitRawGen('generateVideo', {
    model: AD_REF_CHARACTER_MODEL,
    video: videoUrl,
    prompt,
    images: [imageUrl],
    resolution: '720p',
    thinking_level: 'high',
    seed: -1,
  });
}

/** 兜底换人:kling 动作迁移——出镜人图(image)+ 原视频(动作源 video)→ 你的人做原片动作(真人不撞 1010002)。 */
export async function submitAdRefMotion(imageUrl: string, videoUrl: string) {
  return submitRawGen('generateVideo', {
    model: AD_REF_MOTION_MODEL,
    image: imageUrl,
    video: videoUrl,
    character_orientation: 'video',
    keep_original_sound: false,
  });
}

/** 新配音(换声音+换台词)。 */
export async function submitAdRefVoice(text: string, voice: string) {
  return submitRawGen('generateAudio', {
    model: AD_REF_TTS_MODEL,
    text,
    voice,
    stability: 0.4,
  });
}

/** 把新配音对到成片嘴上(覆盖原声)。 */
export async function submitAdRefLipsync(videoUrl: string, audioUrl: string) {
  return submitRawGen('generateVideo', {
    model: AD_REF_LIPSYNC_MODEL,
    video_url: videoUrl,
    audio_url: audioUrl,
  });
}
