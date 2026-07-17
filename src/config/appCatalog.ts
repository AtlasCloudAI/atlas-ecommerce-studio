// App 状态分类(依据《功能审查.md》),供 AppSidebar 与首页共用,保证一致。
export type AppCat = 'production' | 'nocreative' | 'incomplete';

// ✅ 可投入生产:有真实壁垒 / 多步 pipeline。精简后仓库只保留 4 个精品应用。
export const PRODUCTION_ROUTES = new Set<string>([
  '/marketing-studio', '/ad-reference', '/drama-studio', '/ad-skit',
]);

// ⭐ 精品:重点打磨、可对外主推的旗舰应用
// 精简首发:首页只主推这 4 个打磨完善的应用(产品口播广告 / 爆款广告复刻 / AI 短剧广告 / 搞笑带货小剧场)。
// 命名注:Reference to Ad 与 AI Drama Ad 两个名字是 Lark 需求文档定的,不要改;另两个按实际功能命名。
// 其余应用页面仍在,只是不在首页精品区展示。
export const FEATURED_ROUTES = new Set<string>(['/marketing-studio', '/ad-reference', '/drama-studio', '/ad-skit']);
export function isFeatured(href: string): boolean {
  return FEATURED_ROUTES.has(href);
}

// 🔴 未完善:纯前端空壳 / 只出 LLM 文案 / 名不副实。精简后无此类应用。
export const INCOMPLETE_ROUTES = new Set<string>([]);

// 其余 = 🟡 能跑但没壁垒(单步通用模型,GPT / 豆包一步可替代)
export function catOf(href: string): AppCat {
  return PRODUCTION_ROUTES.has(href) ? 'production' : INCOMPLETE_ROUTES.has(href) ? 'incomplete' : 'nocreative';
}

export const CAT_META: { key: AppCat; label: string; desc: string; dot: string; ring: string }[] = [
  { key: 'production', label: '✅ 可投入生产', desc: '有真实壁垒 / 多步 pipeline', dot: 'bg-green-500', ring: 'ring-green-300' },
  { key: 'nocreative', label: '🟡 能跑但没壁垒', desc: '单步通用模型,一步可替代', dot: 'bg-amber-500', ring: 'ring-amber-300' },
  { key: 'incomplete', label: '🔴 未完善', desc: '空壳 / 只出文案 / 名不副实', dot: 'bg-red-500', ring: 'ring-red-300' },
];

// 4 个精品应用的自定义标题/描述(部分无 i18n key,单独给)
type Bi = { en: string; zh: string };
const CUSTOM_TITLES: Record<string, Bi> = {
  'marketing-studio': { en: 'UGC Product Ad', zh: '产品口播广告' },
  'ad-reference': { en: 'Reference to Ad', zh: '爆款广告复刻' },
  'drama-studio': { en: 'AI Drama Ad', zh: 'AI 短剧广告' },
  'ad-skit': { en: 'Ad Skit', zh: '搞笑带货小剧场' },
};
const CUSTOM_DESCS: Record<string, Bi> = {
  'marketing-studio': { en: 'Product + presenter photos → AI expands the prompt from your images → lip-synced UGC ad; one-click viral formats', zh: '产品图+人物图 → AI 看图扩写提示词 → 合成首帧 → 对口型真人口播广告;爆款玩法一键复刻' },
  'ad-reference': { en: 'Upload a viral reference video + your product/presenter (script auto-written) → remake it as your own ad', zh: '上传爆款参考视频 + 你的产品图/人物图(脚本可自动生成)→ 复刻成你自己的同款广告' },
  'drama-studio': { en: 'One topic → comedy script → cast/scene/product reference images lock consistency → shot-by-shot drama ad', zh: '一句主题 → AI 写反差喜剧剧本 → 角色/场景/产品定妆图锁一致 → 逐镜出片拼成短剧' },
  'ad-skit': { en: 'One-line product (+photos) → two-hander comedy script → 15s skit with audio (multilingual)', zh: '一行产品卖点(可配产品图)→ AI 写双人搞笑剧本 → 渲染 15 秒带声短剧(多语言)' },
};
export function appTitle(id: string, fallbackTitle: string, locale: string = 'en'): string {
  const c = CUSTOM_TITLES[id];
  return c ? c[locale === 'zh' ? 'zh' : 'en'] : fallbackTitle;
}
export function appDesc(id: string, fallbackDesc: string, locale: string = 'en'): string {
  const c = CUSTOM_DESCS[id];
  return c ? c[locale === 'zh' ? 'zh' : 'en'] : fallbackDesc;
}
