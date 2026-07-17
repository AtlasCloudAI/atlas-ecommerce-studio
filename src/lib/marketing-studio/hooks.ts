/**
 * Hook = 结构化开场钩子(前 3 秒抓住观众,注入第一镜)。复刻 Higgsfield 的 Hook 资产层。
 */
export interface AdHook {
  id: string;
  label: string;
  en: string;
  zh?: string; // 中文钩子名
  recipe: string; // 注入首镜的开场指令(中文,给前端展示/plan 参考)
  promptEn?: string; // 英文开场指令(注入生成视频的 prompt 占位符;空=不指定)
}

export const AD_HOOKS: AdHook[] = [
  { id: 'none', label: 'None', en: 'None', zh: '无', recipe: '' },
  { id: 'conflict', label: 'Open with Conflict', en: 'Conflict', zh: '冲突开场', recipe: '首镜前3秒即甩人物矛盾/被刁难的瞬间,火药味短句台词,不交代前因。', promptEn: 'open on a moment of conflict or being challenged in the first 3 seconds, a tense punchy line, no backstory' },
  { id: 'suspense', label: 'Suspenseful Question', en: 'Suspense', zh: '悬念提问', recipe: '首镜用一个反常识、无法立刻回答的问句开场,画面停在一个说不通的场景上,产品成为后续解谜的钥匙。', promptEn: 'open with a counterintuitive question that cannot be answered right away, hold on a scene that does not add up' },
  { id: 'painpoint', label: 'Hit a Pain Point', en: 'Painpoint', zh: '直击痛点', recipe: '首镜前3秒还原目标人群最崩溃的生活瞬间,替观众说出心里话的抱怨,一眼"这就是我"。', promptEn: 'open on the audience most frustrating everyday moment and voice their exact complaint so they instantly think "that is me"' },
  { id: 'number', label: 'Shock with a Number', en: 'Number Shock', zh: '数字震撼', recipe: '首镜甩一个具体到反常的数字并视觉化呈现,数字打头的字幕/台词制造冲击。', promptEn: 'open by throwing out a shockingly specific number and visualizing it, number-led line for impact' },
  { id: 'contrast', label: 'Before & After Tease', en: 'Contrast Preview', zh: '前后对比剧透', recipe: '首镜抢先剧透后面的高光反转:先给糟糕的 before 再闪一帧惊艳的 after,把最好结果当诱饵前置。', promptEn: 'tease the transformation upfront: flash a bad before then a stunning after as bait' },
  { id: 'identity', label: 'Identity Twist', en: 'Identity Twist', zh: '身份反差', recipe: '首镜用人物身份与行为的强烈反差制造好奇:让一个"不该会"的人做专业的事,台词点破落差。', promptEn: 'open with a strong identity-vs-action contrast: someone who "should not" be able to do this doing it expertly' },
  { id: 'bizarre', label: 'Bizarre & Curious', en: 'Bizarre', zh: '猎奇违和', recipe: '首镜放一个物理上说不通、看着别扭的违和画面制造"啊?"的瞬间,用反常操作勾住手指。', promptEn: 'open on a physically impossible or oddly-off visual that makes viewers go "huh?"' },
  { id: 'freebie', label: 'Irresistible Freebie', en: 'Freebie Lure', zh: '福利诱惑', recipe: '首镜直给让人挪不开眼的好处/超值画面,把"占便宜"的爽感视觉化,利益前置留人。', promptEn: 'open by directly showing an irresistible benefit or deal, visualize the great-value feeling upfront' },
  { id: 'pov', label: 'First-Person POV', en: 'First-Person', zh: '第一人称视角', recipe: '首镜用第一人称主观镜头把观众拽进现场,角色的手直接伸向镜头做动作,用"你"直接对话。', promptEn: 'open in first-person POV pulling the viewer into the scene, the hand reaches toward the camera, address "you" directly' },
  { id: 'controversial', label: 'Controversial Take', en: 'Controversial Take', zh: '争议观点', recipe: '首镜抛出一个反主流、容易让人想反驳的观点当诱饵,笃定挑衅的表情,后续用产品和事实反转打脸。', promptEn: 'open with a bold anti-mainstream take as bait, confident provocative expression' },
  { id: 'authority', label: 'Expert Authority', en: 'Authority', zh: '专家权威', recipe: '首镜让一个自带权威的身份说话(干了十年的老师傅/业内人),点破"内行只买这个"拉信任。', promptEn: 'open with an authoritative insider (a veteran/expert) stating that insiders only buy this' },
];

export function getHook(id: string): AdHook {
  return AD_HOOKS.find((h) => h.id === id) || AD_HOOKS[0];
}
