/**
 * Avatar preset = 出镜数字人形象库(可选;选了则锁定人物描述,注入每镜图 prompt)。
 * 复刻 Higgsfield 的 Avatar 资产层(preset 部分)。自定义 Avatar 走 Phase 2 的 DB 资产表。
 */
export interface AvatarPreset {
  id: string;
  label: string;
  en: string;
  desc: string; // 英文人物描述(空=让 LLM 自动设计)
  zh?: string; // 中文人物名
  descZh?: string; // 中文人物描述
  image?: string; // 形象图 URL(选下拉时自动填充到人物图槽,作 edit 人物参考)
}

export const AVATAR_PRESETS: AvatarPreset[] = [
  { id: 'none', label: 'Auto Design', en: 'Auto', desc: '', zh: '自动设计' },
  { id: 'cn-female-young', label: 'Young Woman', en: 'Young Woman', desc: 'a friendly young Chinese woman in her mid-twenties, long straight black hair, natural light makeup, casual chic outfit, warm approachable smile', zh: '青春少女', descZh: '一位亲和的中国年轻女性,二十五岁上下,乌黑长直发,清透淡妆,休闲时髦穿搭,笑容温暖平易近人', image: '/api/marketing-studio/media/avatar-preset-cn-female-young.jpg' },
  { id: 'cn-male-young', label: 'Young Man', en: 'Young Man', desc: 'a friendly young Chinese man in his mid-twenties, short neat black hair, casual clean outfit, easygoing confident smile', zh: '阳光男孩', descZh: '一位亲和的中国年轻男性,二十五岁上下,清爽短黑发,干净利落的休闲装,笑容随和自信', image: '/api/marketing-studio/media/avatar-preset-cn-male-young.jpg' },
  { id: 'female-mature', label: 'Sophisticated Woman', en: 'Mature Woman', desc: 'an elegant Chinese woman in her thirties, shoulder-length hair, refined smart-casual style, calm trustworthy demeanor', zh: '知性女性', descZh: '一位优雅的中国女性,三十岁出头,及肩短发,精致的轻商务休闲风,气质沉稳,值得信赖', image: '/api/marketing-studio/media/avatar-preset-female-mature.jpg' },
  { id: 'male-fit', label: 'Fit Guy', en: 'Fit Male', desc: 'an athletic young man in sportswear, fit build, energetic and upbeat, gym/outdoor vibe', zh: '健身型男', descZh: '一位身着运动装的健硕青年,身材紧实,活力满满,充满健身房与户外运动的气息', image: '/api/marketing-studio/media/avatar-preset-male-fit.jpg' },
  { id: 'girl-cute', label: 'Sweet Girl', en: 'Cute Girl', desc: 'a cute cheerful young woman with bright expressive eyes, trendy youthful outfit, playful energetic vibe', zh: '甜美女生', descZh: '一位可爱开朗的年轻女生,眼神明亮灵动,潮流青春穿搭,俏皮又元气满满', image: '/api/marketing-studio/media/avatar-preset-girl-cute.jpg' },
  { id: 'mom-warm', label: 'Gentle Mom', en: 'Warm Mom', desc: 'a warm friendly young mother in her early thirties, soft casual clothing, gentle caring smile, home lifestyle vibe', zh: '温柔妈妈', descZh: '一位温暖亲切的年轻妈妈,三十岁出头,柔和的休闲衣着,笑容温柔体贴,满是居家生活气息', image: '/api/marketing-studio/media/avatar-preset-mom-warm.jpg' },
  { id: 'senior-expert', label: 'Seasoned Expert', en: 'Seasoned Expert', desc: 'a seasoned middle-aged craftsman/expert, weathered trustworthy face, practical workwear, confident authoritative presence', zh: '资深专家', descZh: '一位经验老到的中年匠人/专家,饱经风霜、令人信服的面庞,朴实的工装,沉稳自信,自带权威感', image: '/api/marketing-studio/media/avatar-preset-senior-expert.jpg' },
];

export function getAvatar(id: string): AvatarPreset {
  return AVATAR_PRESETS.find((a) => a.id === id) || AVATAR_PRESETS[0];
}
