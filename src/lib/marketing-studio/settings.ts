/**
 * Setting = 场景环境(注入 scene + 每镜图 prompt)。复刻 Higgsfield 的 Setting 资产层。
 */
export interface AdSetting {
  id: string;
  label: string;
  en: string;
  zh?: string; // 中文场景名
  recipe: string; // 英文场景描述(空=让 LLM 自选)
}

export const AD_SETTINGS: AdSetting[] = [
  { id: 'none', label: 'Auto', en: 'Auto', zh: '智能自选', recipe: '' },
  { id: 'office', label: 'Office', en: 'Office', zh: '办公室', recipe: 'a bright modern office or cubicle, desk with monitor, soft daylight from window' },
  { id: 'livingroom', label: 'Living Room', en: 'Living Room', zh: '客厅', recipe: 'a cozy home living room, sofa and warm lamp light, lived-in and relatable' },
  { id: 'kitchen', label: 'Kitchen', en: 'Kitchen', zh: '厨房', recipe: 'a home kitchen with warm ceiling light, countertop and utensils, everyday cooking vibe' },
  { id: 'bedroom', label: 'Bedroom', en: 'Bedroom', zh: '卧室', recipe: 'a soft cozy bedroom with warm bedside lighting, intimate private feel' },
  { id: 'bathroom', label: 'Bathroom / Vanity', en: 'Bathroom / Vanity', zh: '浴室 / 梳妆台', recipe: 'a clean bright bathroom vanity with mirror, skincare/beauty context' },
  { id: 'street', label: 'City Street', en: 'City Street', zh: '城市街头', recipe: 'a lively city street in daylight, urban background slightly blurred, on-the-go feel' },
  { id: 'outdoor', label: 'Outdoor', en: 'Outdoor', zh: '户外', recipe: 'a bright outdoor natural setting (park / court / nature), open sky, natural sunlight' },
  { id: 'studio', label: 'Live Studio', en: 'Live Studio', zh: '直播间', recipe: 'a live-selling studio corner with ring light and shelf of products behind, streamer setup' },
  { id: 'car', label: 'In Car', en: 'In Car', zh: '车内', recipe: 'inside a car at the wheel or passenger seat, compact framing, dashboard visible' },
  { id: 'cafe', label: 'Cafe', en: 'Cafe', zh: '咖啡馆', recipe: 'a warm aesthetic cafe table, coffee and soft ambient light, lifestyle vibe' },
  { id: 'seamless', label: 'Studio Seamless', en: 'Studio Seamless', zh: '纯色影棚', recipe: 'a clean seamless studio backdrop with premium commercial lighting, no clutter' },
];

export function getSetting(id: string): AdSetting {
  return AD_SETTINGS.find((s) => s.id === id) || AD_SETTINGS[0];
}
