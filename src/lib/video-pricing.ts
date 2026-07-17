/**
 * 媒体动态计费:视频/编辑/对口型按「秒 × 分辨率」的真实成本算积分(不再用固定 COST)。
 * 每秒单价来自生产 Grafana `kubedl.model.price`(2026-07-16 核实)。
 * 图/文/音的固定 COST 不改(它们本就不亏);本模块只处理按时长/分辨率浮动的视频类。
 *
 * 积分 = ⌈ 每秒单价[分辨率] × 秒数 × ACCOUNT_MARKUP × MARGIN / CREDIT_USD ⌉
 */

// Atlas 每秒单价(USD,未含账户 markup),来自 Grafana kubedl.model.price 的 sku+formula
const PER_SEC_USD: Record<string, Partial<Record<string, number>>> = {
  // seedance:按分辨率×秒;'*' 不会命中,列全分辨率
  'bytedance/seedance-2.0/reference-to-video': { '480p': 0.112, '720p': 0.242, '1080p': 0.544, '4k': 1.24, '720p-SR': 0.202, '1080p-SR': 0.435, '1440p-SR': 0.774 },
  'bytedance/seedance-2.0/image-to-video':     { '480p': 0.112, '720p': 0.242, '1080p': 0.544, '4k': 1.24 },
  'bytedance/seedance-2.0-fast/reference-to-video': { '480p': 0.112, '720p': 0.242, '1080p': 0.544 },
  'google/gemini-omni-flash/video-edit':  { '*': 0.14 },   // 按参考视频秒数(3–30s)
  'kwaivgi/kling-v2.6-pro/motion-control': { '*': 0.112 }, // 按驱动视频秒数
  'google/veo3.1/reference-to-video':      { '720p': 0.4, '1080p': 0.4, '4k': 0.6 }, // 已含音频 0.2/s
  'veed/lipsync':                          { '*': 0.0132 }, // 按音频/输出时长
};

export const ACCOUNT_MARKUP = 1.2; // 我们账户被 Atlas 加价 20%(model_discount,生产 96.6% 账户为此档)
export const MARGIN = 1.5;         // 目标毛利:售价 = 真实成本 × 1.5(≈50% 毛利)
export const CREDIT_USD = 0.065;   // Pro 档 1 积分 ≈ $0.065 售价
const MIN_VIDEO_CREDITS = 2;

function rateForModel(model: string, resolution?: string): number {
  const table = PER_SEC_USD[model];
  if (!table) return 0.25; // 未知模型的保守每秒兜底
  const nums = Object.values(table).filter((v): v is number => typeof v === 'number');
  return table[resolution || ''] ?? table['*'] ?? Math.max(...nums);
}

/** 视频/编辑/对口型:按秒×分辨率算应扣积分。seconds=时长(如镜头时长/参考视频时长/音频时长)。 */
export function videoCredits(model: string, resolution: string | undefined, seconds: number): number {
  const sec = Math.max(1, Math.ceil(seconds || 0));
  const costUsd = rateForModel(model, resolution) * sec * ACCOUNT_MARKUP;
  return Math.max(MIN_VIDEO_CREDITS, Math.ceil((costUsd * MARGIN) / CREDIT_USD));
}

/** 前端预估同款(展示"预计 X 积分")。 */
export const estimateVideoCredits = videoCredits;
