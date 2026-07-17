/**
 * Marketing Studio — 广告 format 配方(format = 数据,不是代码分支)。
 * 复刻 Higgsfield Product Ad Generator 的完整玩法库。新增玩法 = 加一行,零改代码。
 * 玩法枚举实地抓自 higgsfield.ai/marketing-studio/product。
 */
export type AdCategory = 'ugc' | 'commercial' | 'tiktok';

export interface AdFormat {
  id: string;
  label: string; // 英文全名
  zh?: string; // 中文全名
  en: string;
  desc: string; // 一句话卖点(英文)
  descZh?: string; // 一句话卖点(中文)
  category: AdCategory;
  needsPerson: boolean; // 是否需要出镜人物
  defaultShots: number;
  emoji: string;
  /** 注入分镜 LLM 的该 format 叙事/镜头配方 */
  hint: string;
}

export const AD_FORMATS: AdFormat[] = [
  // ── UGC 家族(真人自拍/口播/测评) ──
  {
    id: 'ugc',
    label: 'UGC Testimonial',
    zh: '素人种草口播',
    en: 'UGC',
    desc: 'Real selfie recommendation, like posting to your feed',
    descZh: '真人自拍安利，像发朋友圈一样自然',
    category: 'ugc',
    needsPerson: true,
    defaultShots: 4,
    emoji: '🤳',
    hint: '真实社媒自拍风:手持产品对镜口播,每镜一句自然口语安利,前后连成完整种草(吸引→展示卖点→使用感受→安利)。手持晃动、真实生活感,不摆拍不念稿。',
  },
  {
    id: 'direct-to-camera',
    label: 'Direct-to-Camera',
    zh: '正对镜头口播',
    en: 'Direct-to-Camera',
    desc: 'Creator talks straight to camera, naturally convincing',
    descZh: '博主直视镜头对你说，真诚又有说服力',
    category: 'ugc',
    needsPerson: true,
    defaultShots: 4,
    emoji: '🗣️',
    hint: '主播直视镜头对着"你"说话,亲密感强,像跟朋友聊天。每镜一句直给的推荐,眼神始终看镜头,语气真诚有代入感。',
  },
  {
    id: 'selfie-testimonial',
    label: 'Selfie Testimonial',
    zh: '第一人称自拍测评',
    en: 'Selfie Testimonial',
    desc: 'First-person handheld selfie review',
    descZh: '第一人称手持自拍，现身说法讲真实体验',
    category: 'ugc',
    needsPerson: true,
    defaultShots: 4,
    emoji: '🙋',
    hint: '第一人称手持自拍记录真实使用体验,像本人现身说法:先讲之前的困扰,再讲用了之后的改变,口吻真诚不做作,有"我本来不信"的转折。',
  },
  {
    id: 'gadget-saved-me',
    label: 'This Gadget Saved Me',
    zh: '这神器救了我',
    en: 'This Gadget Saved Me',
    desc: 'Turn a feature into a must-have reason',
    descZh: '把一个功能演成非买不可的理由',
    category: 'ugc',
    needsPerson: true,
    defaultShots: 4,
    emoji: '🙌',
    hint: '以"这东西救了我的xx"切入,把某个具体痛点场景演出来,产品作为救场英雄登场,结尾强烈安利"你也需要"。情绪从崩溃到解脱。',
  },
  {
    id: 'secret-hack',
    label: 'Secret Hack Reveal',
    zh: '隐藏用法揭秘',
    en: 'Secret Hack Reveal',
    desc: 'Reveal a clever way to use it',
    descZh: '揭秘一个没人告诉你的聪明用法',
    category: 'ugc',
    needsPerson: true,
    defaultShots: 4,
    emoji: '🤫',
    hint: '以"没人告诉你的小秘诀"钩子开场,神秘感,揭晓一个聪明的产品用法/隐藏功能,观众"原来还能这样",结尾"学到了记得存"。',
  },
  {
    id: 'review',
    label: 'Product Review',
    zh: '真实上手测评',
    en: 'Product Review',
    desc: 'Honest hands-on test that proves the claims',
    descZh: '客观实测，用结果证明卖点不是吹的',
    category: 'ugc',
    needsPerson: true,
    defaultShots: 4,
    emoji: '🔍',
    hint: '半信半疑的测评者当场实测:先摆顾虑,再做一个肉眼可见结果的检验动作,用实测结果替代广告词下结论。台词客观、有细节、可信。',
  },
  {
    id: 'unboxing',
    label: 'Unboxing Reveal',
    zh: '开箱揭晓',
    en: 'Unboxing',
    desc: 'The ritual thrill of peeling it open',
    descZh: '层层拆开的仪式感与惊喜时刻',
    category: 'ugc',
    needsPerson: true,
    defaultShots: 4,
    emoji: '📦',
    hint: '以包裹/礼盒到手开场,带着期待层层拆开,镜头贴近手部与产品第一次露面的瞬间,有"咦没想到"的小意外,结尾用产品上手兑现期待。',
  },
  {
    id: 'unboxing-asmr',
    label: 'Unboxing ASMR',
    zh: '开箱 ASMR',
    en: 'Unboxing ASMR',
    desc: 'Extreme close-ups and satisfying unboxing sounds',
    descZh: '极致特写＋解压开箱音，看着就上头',
    category: 'ugc',
    needsPerson: false,
    defaultShots: 3,
    emoji: '🎧',
    hint: '几乎无对白,靠极近特写与开箱的真实声音(撕封、剥膜、按压、扣合)制造解压满足感,节奏慢、镜头极近、光影质感拉满,产品逐层揭示。',
  },
  {
    id: 'try-on',
    label: 'Virtual Try-On',
    zh: '虚拟试穿',
    en: 'Virtual Try-On',
    desc: 'Unbox to try-on in one take (shoes/apparel)',
    descZh: '开箱到上身一镜到底（鞋类/服饰）',
    category: 'ugc',
    needsPerson: true,
    defaultShots: 4,
    emoji: '👟',
    hint: '开箱→上身/上脚试穿一气呵成:展示细节、上身效果、转身/走动看动态,口播搭配感受,适合鞋服饰品。',
  },
  {
    id: 'couple-sharing',
    label: 'Couple Sharing',
    zh: '情侣共享',
    en: 'Couple Sharing',
    desc: 'A couple shares the product at home',
    descZh: '一对情侣在家一起用、一起安利',
    category: 'ugc',
    needsPerson: true,
    defaultShots: 4,
    emoji: '💑',
    hint: '一对情侣/室友在家自然互动分享产品:一个先用一个凑过来,有生活化的拌嘴和"你也试试",温馨真实,产品融进两人日常。',
  },
  // ── Commercial 家族(广告大片/动效/纯产品) ──
  {
    id: 'tvspot',
    label: 'TV Spot',
    zh: '电视广告大片',
    en: 'TV Spot',
    desc: 'Broadcast-grade polish with cinematic camera work',
    descZh: '播出级质感，电影级运镜的品牌大片',
    category: 'commercial',
    needsPerson: false,
    defaultShots: 4,
    emoji: '🎬',
    hint: '广告大片质感:精致布光、电影级运镜(缓推/环绕/慢镜)、产品英雄登场式特写,旁白式画外音+氛围BGM,无手持感,追求高级与质感。',
  },
  {
    id: 'hypermotion',
    label: 'Hyper Motion',
    zh: '超动感特效',
    en: 'Hyper Motion',
    desc: 'High-energy product fly-ins, spins, and splashes',
    descZh: '高能产品飞入、旋转、溅射，卡点炸屏',
    category: 'commercial',
    needsPerson: false,
    defaultShots: 3,
    emoji: '⚡',
    hint: '高能产品动效hero:产品飞入、旋转、材质溅射、粒子光效、快节奏卡点,每镜一个视觉冲击动作,强节拍音效,几乎无对白或极简slogan。',
  },
  {
    id: 'giant-product',
    label: 'Giant Product',
    zh: '巨型产品',
    en: 'Giant Product',
    desc: 'Oversized product you cannot scroll past',
    descZh: '超大号产品闯入现实，刷到根本停不下来',
    category: 'commercial',
    needsPerson: true,
    defaultShots: 3,
    emoji: '🦖',
    hint: '超现实巨大化产品闯入真实场景(街道/房间),尺度反差制造scroll-stopping冲击,人物在旁被震撼,产品如地标般登场。',
  },
  {
    id: 'crush-test',
    label: 'Crush Test',
    zh: '抗压测试',
    en: 'Crush Test',
    desc: 'Crush and drop durability, oddly satisfying',
    descZh: '挤压摔落测耐用，莫名解压又服气',
    category: 'commercial',
    needsPerson: false,
    defaultShots: 3,
    emoji: '💥',
    hint: '对产品做满足感十足的耐久/防护测试(挤压、摔落、泼溅、碾压),特写慢镜呈现产品扛住考验,证明卖点,解压又有说服力。避免血腥/危险人身描写。',
  },
  {
    id: 'camera-pov',
    label: 'Camera POV',
    zh: '第一人称视角',
    en: 'Camera POV',
    desc: 'Immersive first-person product moment',
    descZh: '沉浸式第一视角，镜头就是你的眼睛',
    category: 'tiktok',
    needsPerson: false,
    defaultShots: 3,
    emoji: '👁️',
    hint: '第一人称主观视角:镜头就是"你"的眼睛,手伸入画面拿取/使用产品,沉浸代入,适合快节奏 TikTok 风。',
  },
  {
    id: 'mess-to-fresh',
    label: 'Mess to Fresh',
    zh: '脏乱变焕新',
    en: 'Mess to Fresh',
    desc: 'The satisfying flip from messy to spotless',
    descZh: '从脏乱到锃亮的爽感大反转',
    category: 'tiktok',
    needsPerson: true,
    defaultShots: 3,
    emoji: '✨',
    hint: '前后强对比:先放大"乱/脏/糟"的状态,产品介入的转折动作,后段同机位呈现"净/爽/整齐",反差爽感,适合清洁/收纳类。',
  },
];

export const AD_CATEGORIES: { id: AdCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'ugc', label: 'UGC' },
  { id: 'commercial', label: 'Commercial' },
  { id: 'tiktok', label: 'TikTok' },
];

export function getFormat(id: string): AdFormat {
  return AD_FORMATS.find((f) => f.id === id) || AD_FORMATS[0];
}
