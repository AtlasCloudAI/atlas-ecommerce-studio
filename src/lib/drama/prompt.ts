import { atlasChat } from '@/lib/atlas';

// 剧本质量优先。2026-07-14 实测:openai/gpt-5.5 可稳定产出 3 角色、完整分镜的 JSON 剧本;
// doubao 2.1 turbo/pro 在线路中会接近或超过 120s,flash 虽快但质量不符合 Drama Studio 的目标。
// 2026-07-15 新提示词 A/B 实测(同题红烧牛肉面喜剧):gpt-5.5 30s 台词口语有梗明显最佳;
// gemini 26s 但书面腔口号腔(用户实评"剧本太烂");deepseek 35s 略糙;glm 65s+JSON坏。
// 旧 502 根因是旧提示词输出冗长致 CF 侧 ~53s 偶发超时;新提示词输出精简(~2.5k字符,30s),gpt-5.5 可回主力,gemini 留兜底。
export const DRAMA_SCRIPT_MODEL = process.env.DRAMA_MODEL || 'openai/gpt-5.5';
export const DRAMA_SCRIPT_FALLBACK_MODEL = process.env.DRAMA_FALLBACK_MODEL || 'google/gemini-2.5-flash';

function envInt(value: string | undefined, fallback: number, min: number, max: number): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

// Cloudflare request still needs a little time to refund and return a clear error before the 120s edge.
// Default to waiting for the real Atlas script as long as practical.
const SCRIPT_TIMEOUT_MS = envInt(process.env.DRAMA_SCRIPT_TIMEOUT_MS || process.env.ATLASCLOUD_CHAT_TIMEOUT_MS, 110_000, 10_000, 115_000);
const SCRIPT_MAX_TOKENS = envInt(process.env.DRAMA_SCRIPT_MAX_TOKENS, 6_500, 4_000, 12_000);

// 影视 IP 混搭/角色反差的风格预设(源自 multiref-demo/gen_got.py 的"权游卖纸巾"创意套路,泛化成多风格)
export const DRAMA_STYLES = [
  { id: 'epic', label: 'Epic Fantasy', zh: '史诗奇幻', emoji: '⚔️', hint: '史诗、权谋、严肃庄重的气场,放进现代/日常场景形成强反差(如史诗英雄一本正经卖平价日用品)' },
  { id: 'palace', label: 'Palace Intrigue', zh: '宫斗权谋', emoji: '👑', hint: '深宫算计、步步为营、绵里藏针的台词张力' },
  { id: 'wuxia', label: 'Martial Arts Wuxia', zh: '武侠江湖', emoji: '🗡️', hint: '侠客恩怨、江湖道义、快意恩仇的气口' },
  { id: 'family', label: 'Family Drama', zh: '中式家庭', emoji: '🍜', hint: '催婚/见家长/丈母娘考验等中式家庭日常的夸张戏剧化(如社恐程序员见挑剔丈母娘)' },
  { id: 'office', label: 'Office Politics', zh: '职场斗争', emoji: '💼', hint: '办公室政治、KPI 内卷、老板的荒诞与打工人的心声' },
  { id: 'hero', label: 'Superhero', zh: '超级英雄', emoji: '🦸', hint: '拯救世界的宏大使命 vs 鸡毛蒜皮日常的强反差' },
];

// 正规影视流程:先定人设/场景("定妆图"), 再逐镜用参考图锁一致性出片。
// 因此剧本产物必须给足:①每个角色一段英文外观(生成"定妆图");②每段标出场角色(cast)+时长(durationSec, AI 按节奏自定);③一段英文场景图 prompt。
const SYS = `你是顶级短剧编剧 + 病毒式带货短视频导演,擅长把强风格化角色(史诗/宫斗/武侠…)扔进现代日常场景,用"一本正经地荒诞"制造笑点。你产出的剧本会进入正规影视流程:先按你写的外观生成角色定妆图、场景图、产品参考图,再逐镜用参考图锁一致性出片。用原创角色名(不照搬有版权人物),保留该风格的味道。
剧本质量硬标准:
① 开场 3 秒钩子必须是一个拍得出来的具体画面动作冲突(不是概念、不是气氛);
② 笑点靠反差与错位:角色用自己世界的逻辑严肃对待日常小事;每段至少 1 个可笑的具体细节(动作/道具/台词),拒绝泛泛地"搞笑";
③ 台词一律口语短句,像真人拌嘴,带梗、一针见血;禁止书面腔/旁白腔/口号腔(类似「此乃吾之战利品」「这就是XX的力量」一律禁用);dialogue 格式:角色名：「台词」,多人对话用空格分隔;
④ 带货剧:卖点严禁念参数,必须转化成人物的欲望/冲突/破功瞬间(如为大块牛肉翻脸、闻到香气忘词);最后一段要有反转式收尾 + 让人想买的自然暗示;
⑤ 段与段承接成完整闭环(起势→升级→反转),不是独立段子拼盘。
技术要求:
⑥ **分镜数量严格按用户要求**(未指定时 4-6 段、至少 4 段);**每段 durationSec 由你按节奏定**(整数 4-12:钩子短 4-6s,对峙/高潮长 8-12s);
⑦ 每段 cast 列出该段出场角色的 key;每个角色写 **≥40 词英文 appearance**(年龄/性别/发型/服装材质配色/体型/标志性道具/神态/布光,多角色外观差异明显);
⑧ 若主题涉及实物商品:必须给 **productImagePrompt**(ENGLISH,干净棚拍包装图,写清品类/包装形态/主色/包装上的中文品名文字),产品出镜的段标 **product:true**(带货主题至少一半段落标 true),全剧必须是同一件产品;纯剧情则 productImagePrompt 给空字符串、所有段 product:false;
⑨ **JSON 安全(极重要)**:所有字符串值里一律不得出现英文双引号字符(会截断 JSON 导致分镜丢失),台词/强调/引用一律用中文引号「」。
⑩ **输出语言必须自动匹配用户【主题/产品】文本所用的语种**(用户用什么语言写主题,剧本就用什么语言,支持中/英/日/韩/西等任意语种):除 appearance(恒英文,供出图)外,title/logline/setting/scene/action/dialogue/hook/climax 等所有面向观众的字段一律用该语种,不得混写;判断不出时用中文。
只输出合法 JSON,不要解释、不要 markdown 代码块。`;

export interface ScriptInput {
  topic: string;
  style: string;
  lang: string;
  // 用户指定的精确段数(可选);不传则完全交给 AI 按剧情节奏决定(4-6 段)。
  targetSegments?: number;
}

export interface DramaCharacter {
  key: string;
  name: string;
  persona: string;
  appearance: string; // 英文,用于生成定妆图
}
export interface DramaSegment {
  i: number;
  durationSec: number; // AI 决定,4-15
  cast: string[]; // 出场角色 key
  product?: boolean; // 该段画面是否出现产品(带货主题时 AI 标注;有上传产品图时用作参考锁一致性)
  scene: string;
  action: string;
  dialogue?: string;
  hook?: string;
}
export interface DramaScript {
  title: string;
  logline: string;
  sellingPoints: string[];
  characters: DramaCharacter[];
  setting: string;
  sceneImagePrompt: string; // 英文,用于生成场景图
  productImagePrompt: string; // 英文,用于生成"产品定妆图"(无实物产品则为空串)
  segments: DramaSegment[];
  climax: string;
}

function extractJson(raw: string): Record<string, unknown> {
  const s = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const a = s.indexOf('{');
  if (a < 0) throw new Error('no_json_in_llm_output');
  const b = s.lastIndexOf('}');
  if (b > a) {
    try { return JSON.parse(s.slice(a, b + 1)) as Record<string, unknown>; } catch { /* 可能被截断,下面尝试兜底修复 */ }
  }
  // 输出被 max_tokens 截断的兜底:截到最后一个看起来完整的位置,再尝试补齐尾部括号,尽量保住已生成的内容。
  const frag = s.slice(a);
  const cut = Math.max(frag.lastIndexOf('"}'), frag.lastIndexOf('}]'), frag.lastIndexOf('}'));
  if (cut > 0) {
    const head = frag.slice(0, cut + 1);
    for (const tail of ['', '}', ']}', '}]}', '"}]}', '"}]} ']) {
      try { return JSON.parse(head + tail) as Record<string, unknown>; } catch { /* try next tail */ }
    }
  }
  throw new Error('llm_json_unparseable');
}

const KEY_ALPHA = 'abcdefghijklmnopqrstuvwxyz';
function clampInt(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
}
function asStr(v: unknown, fallback = ''): string {
  return typeof v === 'string' && v.trim() ? v.trim() : fallback;
}

// 把 LLM 原始 JSON 规范化成前后端都能安全消费的 DramaScript:
// 角色补 key/appearance、每段 durationSec clamp、cast 过滤为合法 key(空则兜底)。
// 尽量不抛错——保住已生成内容能出片,比严格校验更重要。
export function normalizeScript(j: Record<string, unknown>): DramaScript {
  const rawChars = Array.isArray(j.characters) ? j.characters : [];
  const characters: DramaCharacter[] = rawChars.slice(0, 4).map((c, idx): DramaCharacter => {
    const o = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>;
    const name = asStr(o.name, `角色${idx + 1}`);
    const persona = asStr(o.persona, '');
    return {
      key: asStr(o.key, `char_${KEY_ALPHA[idx] || idx}`),
      name,
      persona,
      // appearance 缺失时用 persona 兜底(至少给出图模型一点信息),避免定妆图完全随机。
      appearance: asStr(o.appearance, persona || `A distinctive character named ${name}, photorealistic, cinematic.`),
    };
  });
  const keySet = new Set(characters.map((c) => c.key));
  const fallbackCast = characters.slice(0, 2).map((c) => c.key); // 无 cast 时至少给前两个角色当参考

  const rawSegs = Array.isArray(j.segments) ? j.segments : [];
  const segments: DramaSegment[] = rawSegs.slice(0, 8).map((s, idx): DramaSegment => {
    const o = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>;
    const cast = (Array.isArray(o.cast) ? o.cast : [])
      .map((k) => asStr(k))
      .filter((k) => keySet.has(k));
    return {
      i: clampInt(o.i, 1, 99, idx + 1),
      durationSec: clampInt(o.durationSec ?? o.dur, 4, 15, 8),
      cast: cast.length ? cast : fallbackCast,
      product: o.product === true,
      scene: asStr(o.scene),
      action: asStr(o.action),
      dialogue: asStr(o.dialogue) || undefined,
      hook: asStr(o.hook) || undefined,
    };
  });

  const sellingPoints = (Array.isArray(j.sellingPoints) ? j.sellingPoints : [])
    .map((x) => asStr(x))
    .filter(Boolean)
    .slice(0, 5);

  return {
    title: asStr(j.title, '未命名剧本'),
    logline: asStr(j.logline),
    sellingPoints,
    characters,
    setting: asStr(j.setting),
    sceneImagePrompt: asStr(j.sceneImagePrompt, asStr(j.setting)),
    productImagePrompt: asStr(j.productImagePrompt),
    segments,
    climax: asStr(j.climax),
  };
}

export async function draftScript(input: ScriptInput): Promise<DramaScript> {
  const style = DRAMA_STYLES.find((s) => s.id === input.style) || DRAMA_STYLES[0];
  const segHint = input.targetSegments
    ? `分镜数量:必须严格产出 exactly ${input.targetSegments} 段分镜(segments 数组长度正好 ${input.targetSegments}),不多不少。`
    : `分镜数量:由你按剧情节奏决定,4-6 段为宜(至少 4 段,除非剧情极短)。`;
  const usr = `产出 1 个【${style.label}】风格的剧情长剧本。
主题/产品:${input.topic}
风格要点:${style.hint}
**输出语言(极重要):先判断上面【主题/产品】这段文字用的是什么语言,然后整个剧本所有面向观众的文本字段 —— title、logline、setting、sellingPoints、每段的 scene / action / dialogue / hook、climax —— 全部用与它相同的语言书写(用户用中文写就通篇中文、用英文写就通篇英文、用日文写就通篇日文,以此类推,不是只有台词!);判断不出时用中文。characters 的 appearance 字段例外,始终用英文(供出图模型)。**${segHint}
严格用这个 JSON 结构(只输出 JSON):
{
  "title": "标题",
  "logline": "一句话故事",
  "sellingPoints": ["若有产品给1-3条卖点;纯剧情给主题看点"],
  "characters": [
    {"key": "char_a", "name": "原创角色名", "persona": "人设/为什么反差好看(与主题同语种)", "appearance": "ENGLISH ≥40-word full-body reference: age, gender, hairstyle, outfit materials & colors, body type, signature props, facial features, expression, lighting — detailed enough for a consistent, recognizable look. Characters must look clearly different from each other."}
  ],
  "setting": "场景一句话(与主题同语种,给用户看)",
  "sceneImagePrompt": "ENGLISH cinematic establishing shot of the setting, no people, detailed environment, lighting and mood.",
  "productImagePrompt": "ENGLISH clean studio packshot of the exact product from the topic (category, packaging form, main colors, Chinese brand text on the pack), plain background. Empty string if no physical product.",
  "segments": [
    {"i": 1, "durationSec": 6, "cast": ["char_a"], "product": true, "scene": "画面/景别/构图(与主题同语种)", "action": "这一段的剧情与动作(与主题同语种)", "dialogue": "台词(可空,与主题同语种)", "hook": "笑点/反转/看点"}
  ],
  "climax": "爆点:为什么好看/会传播"
}
注意:①characters 2-3 个(最多4),每个的 key 用 char_a/char_b/char_c;②每段 cast 里的 key 必须是上面 characters 定义过的;③durationSec 是整数秒(4-12),按节奏定,别所有段都一样;④按上面要求的段数产出,别少给;⑤带货主题:productImagePrompt 必填且产品出镜段标 product:true(至少一半段落),全剧同一件产品;纯剧情:productImagePrompt 给空字符串、所有段 false;⑥所有字符串值里禁止出现英文双引号字符,台词一律用中文引号「」(否则 JSON 会坏、分镜会丢)。`;
  // 质量优先主模型;它偶发 502/超时(Atlas 网关波动)时降级到更快更稳的 gemini 兜底。
  // 两次超时之和 <Worker 120s:主模型 ~68s(实测 53s 足够)+ 兜底 44s = 112s。
  const attempts = [
    { model: DRAMA_SCRIPT_MODEL, timeout: Math.min(SCRIPT_TIMEOUT_MS, 58_000) },
    { model: DRAMA_SCRIPT_FALLBACK_MODEL, timeout: 50_000 },
  ];
  let lastErr: unknown;
  for (const { model, timeout } of attempts) {
    try {
      const raw = await atlasChat(
        [{ role: 'system', content: SYS }, { role: 'user', content: usr }],
        model,
        SCRIPT_MAX_TOKENS, // 富 schema(每角色外观 + 多段)较长,但必须留出 Worker 恢复时间。
        timeout,
      );
      return normalizeScript(extractJson(raw));
    } catch (e) {
      lastErr = e;
      console.error(`[draftScript] model ${model} failed: ${String(e)}`);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('script_failed');
}
