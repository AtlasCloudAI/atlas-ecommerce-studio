'use client';
import { byokHeaders, useByokActive } from '@/lib/byok';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { AlertCircle, CheckCircle2, Download, Film, ImagePlus, Loader2, Pencil, RefreshCw, Video, Wand2, X } from 'lucide-react';
import { composeAdReel } from '@/lib/compose-client';
import { DRAMA_STYLES } from '@/lib/drama/prompt';
import { videoCredits } from '@/lib/video-pricing';
import { useI18n } from '@/i18n/provider';
import { useMounted } from '@/lib/use-mounted';

// 和 marketing-studio 统一的视觉规格:深色 #131416 + 紫色 #7036F0 + Space Grotesk
const ACCENT = '#7036F0';
const INK = '#131416';
const PANEL = '#1c1e21';

type Character = { key: string; name: string; persona: string; appearance?: string };
type Script = {
  title?: string;
  logline?: string;
  sellingPoints?: string[];
  characters?: Character[];
  setting?: string;
  sceneImagePrompt?: string;
  productImagePrompt?: string;
  // durationSec/cast 由 AI 规划:每段时长按节奏自定、cast 标出场角色(定妆图参考)、product 标该段是否出现产品。
  segments?: { i: number; durationSec?: number; cast?: string[]; product?: boolean; scene: string; action: string; dialogue?: string; hook?: string }[];
  climax?: string;
};
// imgGetUrl/vidGetUrl = Atlas 任务查询地址:提交后立刻持久化,刷新/中断后凭它恢复轮询,不重复提交扣费。
type ShotState = { img: 'idle' | 'run' | 'done' | 'fail'; vid: 'idle' | 'run' | 'done' | 'fail'; imgUrl?: string; vidUrl?: string; imgGetUrl?: string; vidGetUrl?: string; err?: string };
// 角色定妆图 / 场景图资产:先于分镜生成,作为逐镜合成的参考图锁一致性。getUrl 同样持久化以便续跑。
type AssetState = { status: 'idle' | 'run' | 'done' | 'fail'; url?: string; getUrl?: string; err?: string };
// 用户上传的产品图(可选):作为带货镜头的参考图,锁住真实产品外观。preview 为本地 blob 预览,url 为上传后可引用地址。
type UploadAsset = { preview?: string; url?: string; uploading?: boolean }; // 用户上传的产品原图(直接作参考,不再定妆生成)
// seedance-2.0/reference-to-video 单次最多 9 张参考图;每镜 refs = 产品图 + 出场角色定妆图 + 场景图。
// 产品图上限 4:一镜即便 4 角色 + 场景(5 张)也塞得下 4 张产品(共 9)不超限;运行时按剩余配额再动态截断。
const MAX_SHOT_REFS = 9;
const MAX_PRODUCT_IMAGES = 4;
// 生成进度持久化 key:剧本/分镜/定妆资产状态存 localStorage,刷新或切页回来自动恢复现场、断点续跑。
// v2:剧本结构升级(角色 key/appearance、每段 durationSec/cast、定妆资产),与 v1 不兼容,换 key 避免旧数据恢复出错。
const DRAMA_SESSION_KEY = 'drama-session-v2';

const VIDEO_RATIOS = ['9:16', '16:9', '1:1'];
const VIDEO_RESOLUTIONS = ['480p', '720p', '1080p'];
// 每段时长的可选值(AI 会先给出建议值,用户可在剧本卡片里逐段微调);与后端 normalizeVideoDuration 支持范围一致。
const VIDEO_DURATIONS = [4, 5, 6, 7, 8, 9, 10, 12, 15];
const CHEVRON = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23ffffff' stroke-opacity='0.55' stroke-width='3'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")";
const selStyle: React.CSSProperties = { backgroundImage: CHEVRON, backgroundPosition: 'right 8px center', backgroundSize: '10px', backgroundRepeat: 'no-repeat' };
// script/image(定妆图+场景图)走固定 COST;逐镜视频走动态 videoCredits(见 segVideoCost/videoEst)。
const DRAMA_COSTS = { script: 5, image: 8, video: 12 };
// 逐镜出片模型:seedance-2.0/reference-to-video(产品图+角色定妆图+场景图 → 直接出片),与后端一致。
const DRAMA_VIDEO_MODEL = 'bytedance/seedance-2.0/reference-to-video';
function dramaErrText(code: string, locale: string) {
  if (code.startsWith('insufficient_credits:')) {
    const [, need, have] = code.split(':');
    return locale === 'zh' ? `积分不足:本次需要 ${need} 积分,当前只有 ${have}。` : `Not enough credits: this step needs ${need}, you have ${have}.`;
  }
  if (code === 'insufficient_credits') return locale === 'zh' ? '积分不足,请前往定价页充值。' : 'Not enough credits. Please top up on the pricing page.';
  if (code.includes('Atlas chat timed out')) return locale === 'zh' ? 'AI 剧本服务响应超时,请稍后重试。' : 'The AI script service timed out. Please try again later.';
  if (code.startsWith('script_timeout_refunded')) return locale === 'zh' ? 'AI 剧本生成超时,已退回剧本积分。请稍后重试。' : 'AI script generation timed out. Script credits were refunded. Please try again later.';
  if (code.startsWith('script_failed_refunded')) return locale === 'zh' ? 'AI 剧本生成失败,已退回剧本积分。请稍后重试。' : 'AI script generation failed. Script credits were refunded. Please try again later.';
  return code;
}

async function postJson(url: string, body: unknown) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...byokHeaders() }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.detail ? `${j.error || 'error'}: ${j.detail}` : (j.error || 'failed'));
  return j;
}
// 文件转 dataURL(和 marketing-studio 一致):上传端点收 { dataUrl } 的 JSON,不是 multipart。
function imageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('read_failed'));
    r.readAsDataURL(file);
  });
}
function pollGen(getUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let n = 0;
    let transientErrors = 0;
    let lastError = '';
    const t = setInterval(async () => {
      n += 1;
      if (n > 300) { clearInterval(t); reject(new Error('timeout')); return; }
      try {
        const c = await postJson('/api/marketing-studio/poll', { getUrl });
        // transient=true:Atlas 状态查询网关瞬时超时(504),任务多半还在跑;计数不清零,连续太多次才放弃(避免静默转圈到超时)。
        if (c.transient) {
          transientErrors += 1;
          if (transientErrors >= 8) { clearInterval(t); reject(new Error('poll_gateway_unstable')); }
          return;
        }
        transientErrors = 0;
        if (c.status === 'completed') {
          const o = (Array.isArray(c.outputs) ? c.outputs : [])[0];
          clearInterval(t);
          o ? resolve(o) : reject(new Error('empty_output'));
        } else if (c.status === 'failed') { clearInterval(t); reject(new Error(c.error || 'failed')); }
      } catch (e) {
        transientErrors += 1;
        lastError = String((e as Error).message || e).slice(0, 240);
        if (transientErrors >= 8) {
          clearInterval(t);
          reject(new Error(lastError || 'poll_failed'));
        }
      }
    }, 3000);
  });
}

export default function DramaStudioPage() {
  const { status } = useSession();
  const mounted = useMounted();
  const { locale } = useI18n();
  const byokActive = useByokActive();
  const [topic, setTopic] = useState('');
  const [style, setStyle] = useState('epic');
  // 语言下拉已移除:剧本语种自动跟随主题输入的语言(见 lib/drama/prompt.ts 规则⑩)
  const [videoRatio, setVideoRatio] = useState('9:16');
  const [videoResolution, setVideoResolution] = useState('720p');
  // 分镜段数:'auto' = 交给 AI 按剧情决定;数字 = 精确指定几段(传给后端 targetSegments)。
  const [segChoice, setSegChoice] = useState('auto');
  const [script, setScript] = useState<Script | null>(null);
  const [shots, setShots] = useState<ShotState[]>([]);
  // 角色定妆图(按角色 key)+ 场景图:分镜生成前先出好,作为逐镜合成的参考图锁一致性。
  const [charAssets, setCharAssets] = useState<Record<string, AssetState>>({});
  const [sceneAsset, setSceneAsset] = useState<AssetState>({ status: 'idle' });
  // 用户上传的产品图(可选,跨剧本保留):带货镜头合成时作参考锁产品一致性。
  const [productAssets, setProductAssets] = useState<UploadAsset[]>([]); // 多张产品原图(直接作 seedance 参考)
  const [zoomImg, setZoomImg] = useState<string | null>(null); // 角色/场景/产品图点击放大预览
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [compose, setCompose] = useState<{ status: 'idle' | 'run' | 'done' | 'fail'; frac: number; note: string; url: string }>({ status: 'idle', frac: 0, note: '', url: '' });
  const [credits, setCredits] = useState<number | null>(null);
  const [creationId, setCreationId] = useState(''); // 剧本生成时创建的"作品文件夹"id;定妆/首帧/视频/成片完成时 patch 进它的 assets
  const [editingChar, setEditingChar] = useState<string | null>(null); // 正在编辑外观提示词的角色 key(展开编辑框)
  const creationIdRef = useRef(creationId); // 供 runAssets/genOneShot 闭包稳定读到最新 id(避免 stale)
  creationIdRef.current = creationId;
  const storyboardRef = useRef<HTMLDivElement>(null);
  const productInput = useRef<HTMLInputElement>(null);

  // 成本 = 定妆资产(每角色 1 张 + 场景 1 张,固定 COST) + 每镜视频(动态,按分辨率×每段时长)。剧本出来前用占位数(3 角色/4 段)粗估。
  const charCount = script?.characters?.length || 3;
  const segCount = script?.segments?.length || 4;
  // 逐镜视频动态计费:按当前分辨率 + 该段时长(seg.durationSec,缺省 8s)。
  const segVideoCost = (seg?: { durationSec?: number }) => videoCredits(DRAMA_VIDEO_MODEL, videoResolution, seg?.durationSec || 8);
  const assetCost = (charCount + 1) * DRAMA_COSTS.image;
  const videoSum = script?.segments?.length
    ? script.segments.reduce((sum, seg) => sum + segVideoCost(seg), 0)
    : segCount * segVideoCost();
  const videoEst = assetCost + videoSum;
  const totalEst = DRAMA_COSTS.script + videoEst;
  const hasCreditsForScript = byokActive || status !== 'authenticated' || credits === null || credits >= DRAMA_COSTS.script;
  const hasCreditsForVideo = byokActive || status !== 'authenticated' || credits === null || credits >= videoEst;

  // ── 分步生成:派生状态 + 单镜工具 ──
  // 定妆图+场景图都就绪才允许逐镜;所有镜的视频都完成才允许拼接。
  // 带货剧本(有 product:true 段)时,产品参考图也必须就绪——否则各镜产品靠文字现编,镜间不一致。
  const needsProductRef = (script?.segments || []).some((s) => s.product);
  const assetsReady = (script?.characters || []).every((c) => charAssets[c.key]?.status === 'done' && !!charAssets[c.key]?.url) && sceneAsset.status === 'done' && !!sceneAsset.url && (!needsProductRef || productAssets.some((p) => !!p.url));
  const allVidsDone = !!script?.segments?.length && shots.length === script.segments.length && shots.every((s) => s.vid === 'done' && !!s.vidUrl);
  const anyShotRunning = shots.some((s) => s.img === 'run' || s.vid === 'run');
  // shotsRef:供 genOneShot 读断点续跑的 getUrl(避免闭包读到过期值);patchShot:按索引函数式更新(并发点多个镜也不互相覆盖)。
  const shotsRef = useRef<ShotState[]>(shots);
  shotsRef.current = shots;
  const patchShot = useCallback((i: number, patch: Partial<ShotState>) => {
    setShots((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }, []);
  // drama 作品文件夹:从当前剧本 + 资产聚合结构化 assets,在关键节点覆盖写进 Creation(my-work 详情据此分区展示)。
  const buildDramaAssets = (chars: Record<string, AssetState>, scene: AssetState, shotList: ShotState[], productUrls?: string[]) => ({
    kind: 'drama' as const,
    title: script?.title || topic.slice(0, 60) || '短剧',
    characters: (script?.characters || []).map((c) => ({ key: c.key, name: c.name, appearance: c.appearance || c.persona || '', portraitUrl: chars[c.key]?.url || null })),
    sceneImageUrl: scene?.url || null,
    productImageUrl: (productUrls?.[0] ?? productAssets.map((p) => p.url).filter(Boolean)[0]) || null,
    productImageUrls: (productUrls ?? productAssets.map((p) => p.url).filter((u): u is string => !!u)),
    scenes: (script?.segments || []).map((seg, i) => ({ i: seg.i ?? i + 1, scene: seg.scene || '', dialogue: seg.dialogue || '', frameUrl: shotList[i]?.imgUrl || null, videoUrl: shotList[i]?.vidUrl || null })),
  });
  const patchDramaAssets = async (chars: Record<string, AssetState>, scene: AssetState, shotList: ShotState[], productUrls?: string[]) => {
    const cid = creationIdRef.current;
    if (!cid) return;
    try {
      await fetch(`/api/creations/${cid}/assets`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...byokHeaders() }, body: JSON.stringify({ assets: buildDramaAssets(chars, scene, shotList, productUrls) }) });
    } catch { /* 文件夹更新失败不阻断生成 */ }
  };

  const refreshCredits = useCallback(async () => {
    try {
      const r = await fetch('/api/me', { cache: 'no-store' });
      if (!r.ok) {
        setCredits(null);
        return null;
      }
      const j = await r.json();
      const n = Number(j.credits);
      const next = Number.isFinite(n) ? n : null;
      setCredits(next);
      return next;
    } catch {
      setCredits(null);
      return null;
    }
  }, []);

  useEffect(() => {
    if (status === 'authenticated') void refreshCredits();
    else setCredits(null);
  }, [status, refreshCredits]);

  useEffect(() => {
    const h = () => {
      if (status === 'authenticated') void refreshCredits();
    };
    window.addEventListener('atlas:credits', h);
    return () => window.removeEventListener('atlas:credits', h);
  }, [status, refreshCredits]);

  // ── 生成进度持久化(同 marketing-studio):刷新/切页不丢现场,断点续跑 ──
  useEffect(() => {
    if (!mounted) return;
    try {
      const raw = localStorage.getItem(DRAMA_SESSION_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (Date.now() - (s.ts || 0) > 24 * 3600_000) return; // 只看时效;无剧本(只填了主题/传了图)也恢复输入,登录跳转回来不丢
      if (typeof s.topic === 'string' && s.topic) setTopic(s.topic);
      // 生成参数一并恢复:否则刷新后 resolution 回默认值,续跑的镜头会用错参数(时长现在跟随每段 durationSec,不再是全局值)。
      if (VIDEO_RESOLUTIONS.includes(s.videoResolution)) setVideoResolution(s.videoResolution);
      if (VIDEO_RATIOS.includes(s.videoRatio)) setVideoRatio(s.videoRatio);
      // 定妆图/场景图资产恢复:已完成的(有 url)续跑时直接复用,不重复出图扣费。
      if (s.charAssets && typeof s.charAssets === 'object') {
        const ca: Record<string, AssetState> = {};
        for (const [k, v] of Object.entries(s.charAssets as Record<string, AssetState>)) {
          // 同 shots:只保留完成(done+url)的定妆图,未完成清 getUrl 重新提交,不轮询过期旧任务
          ca[k] = (v.status === 'done' && !!v.url) ? { ...v } : { status: 'idle' };
        }
        setCharAssets(ca);
      }
      if (s.sceneAsset && typeof s.sceneAsset === 'object') {
        setSceneAsset((s.sceneAsset.status === 'done' && !!s.sceneAsset.url) ? { ...s.sceneAsset } : { status: 'idle' });
      }
      // 产品图恢复:用 url 同时当预览(上传后的 R2 url 可直接内联显示)。
      if (Array.isArray(s.productUrls)) setProductAssets((s.productUrls as string[]).filter(Boolean).map((u) => ({ preview: u, url: u })));
      else if (typeof s.productUrl === 'string' && s.productUrl) setProductAssets([{ preview: s.productUrl, url: s.productUrl }]);
      // 剧本/分镜仅在确有剧本时恢复(断点续跑)
      if (s.script?.segments?.length) {
        setScript(s.script);
        const restored: ShotState[] = (Array.isArray(s.shots) && s.shots.length === s.script.segments.length
          ? s.shots
          : s.script.segments.map(() => ({ img: 'idle', vid: 'idle' }))
        ).map((x: ShotState) => {
          // 只保留真正完成(done + url)的镜;未完成的一律复位 idle 并清掉 getUrl——
          // 否则续跑会拿着可能已过期的旧 getUrl 一直轮询死任务、从不重新提交(实测就是"点生成没调 Atlas"的根因)。
          const imgDone = x.img === 'done' && !!x.imgUrl;
          const vidDone = x.vid === 'done' && !!x.vidUrl;
          return {
            img: imgDone ? 'done' : 'idle', vid: vidDone ? 'done' : 'idle',
            imgUrl: imgDone ? x.imgUrl : undefined, vidUrl: vidDone ? x.vidUrl : undefined,
            imgGetUrl: imgDone ? x.imgGetUrl : undefined, vidGetUrl: vidDone ? x.vidGetUrl : undefined,
          } as ShotState;
        });
        setShots(restored);
      }
      if (typeof s.creationId === 'string') setCreationId(s.creationId);
    } catch { /* ignore broken session */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return; // 无剧本(只填了主题/传了图)也存,登录 OAuth 跳转回来不丢
    try {
      localStorage.setItem(DRAMA_SESSION_KEY, JSON.stringify({ script, shots, charAssets, sceneAsset, productUrls: productAssets.map((p) => p.url).filter(Boolean), topic, videoRatio, videoResolution, creationId, ts: Date.now() }));
    } catch { /* storage full etc. */ }
  }, [mounted, script, shots, charAssets, sceneAsset, productAssets, topic, videoRatio, videoResolution, creationId]);

  async function genScript() {
    if (status !== 'authenticated') { signIn('google'); return; }
    if (!topic.trim()) { setErr(locale === 'zh' ? '请先输入一个主题或产品' : 'Please enter a topic or product first'); return; }
    setErr(null); setNotice(null); setBusy('script'); setScript(null); setShots([]); setCharAssets({}); setSceneAsset({ status: 'idle' }); setCreationId(''); creationIdRef.current = ''; setCompose({ status: 'idle', frac: 0, note: '', url: '' });
    try {
      const currentCredits = await refreshCredits();
      if (!byokActive && currentCredits !== null && currentCredits < DRAMA_COSTS.script) {
        setErr(`insufficient_credits:${DRAMA_COSTS.script}:${currentCredits}`);
        setBusy(null);
        return;
      }
      // 段数:'auto' 完全交给 AI;否则传精确段数。每段时长始终由 AI 规划(可后期微调)。
      setNotice(locale === 'zh'
        ? 'AI 正在生成高质量剧本,通常需要 30-90 秒,请保持页面打开。'
        : 'AI is writing a higher-quality script, usually 30-90 seconds. Keep this page open.');
      const j = await postJson('/api/drama-studio/script', { topic: topic.trim(), style, ...(segChoice !== 'auto' ? { segments: Number(segChoice) } : {}) }) as { script?: Script; model?: string };
      const s: Script = j.script || {};
      if (!s.segments?.length) throw new Error('script_empty');
      setScript(s); setShots((s.segments || []).map(() => ({ img: 'idle', vid: 'idle' })));
      setNotice(null);
      // 每次生成新剧本都重置定妆资产,避免沿用上一部剧的角色图;自动生成的产品图也重置(用户上传的跨剧本保留)。
      setCharAssets({}); setSceneAsset({ status: 'idle' });
      // 用户上传的产品原图跨剧本保留(不再有自动生成的定妆图需要重置)
      // 剧本一出即在「我的作品」建这部剧的文件夹(骨架:角色+场景,url 待逐步填);后续关键节点覆盖写 assets。
      try {
        const skeleton = {
          kind: 'drama',
          title: s.title || topic.slice(0, 60) || '短剧',
          characters: (s.characters || []).map((c) => ({ key: c.key, name: c.name, appearance: c.appearance || c.persona || '', portraitUrl: null })),
          sceneImageUrl: null,
          scenes: (s.segments || []).map((seg, i) => ({ i: seg.i ?? i + 1, scene: seg.scene || '', dialogue: seg.dialogue || '', frameUrl: null, videoUrl: null })),
        };
        const st = await postJson('/api/creations/start', { type: 'drama-studio', title: skeleton.title, assets: skeleton });
        if (st?.id) { setCreationId(st.id); creationIdRef.current = st.id; }
      } catch { /* 建文件夹失败不阻断剧本展示 */ }
      // 剧本区在输入面板下方,生成后平滑滚过去,避免用户以为"没反应"
      setTimeout(() => storyboardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
    } catch (e) { setNotice(null); setErr(e instanceof Error ? e.message : 'script_failed'); }
    setBusy(null);
    window.dispatchEvent(new Event('atlas:credits'));
  }
  function editSeg(i: number, key: 'scene' | 'action' | 'dialogue', val: string) {
    setScript((prev) => {
      if (!prev?.segments) return prev;
      const segs = prev.segments.map((s, idx) => (idx === i ? { ...s, [key]: val } : s));
      return { ...prev, segments: segs };
    });
  }
  // AI 给出建议时长后,用户仍可逐段微调(完全交给 AI 但保留手动覆盖)。
  function setSegDuration(i: number, sec: number) {
    setScript((prev) => {
      if (!prev?.segments) return prev;
      const segs = prev.segments.map((s, idx) => (idx === i ? { ...s, durationSec: sec } : s));
      return { ...prev, segments: segs };
    });
  }
  // 该段是否出现产品(AI 给默认,用户可逐段覆盖);上传了产品图后,标 true 的段合成时会带产品参考图锁一致性。
  function setSegProduct(i: number, on: boolean) {
    setScript((prev) => {
      if (!prev?.segments) return prev;
      const segs = prev.segments.map((s, idx) => (idx === i ? { ...s, product: on } : s));
      return { ...prev, segments: segs };
    });
  }
  // 上传产品图(可选):复用 marketing 的上传端点(收 { dataUrl } JSON,返回 { url })。产品图跨剧本保留,不随重新生成剧本清空。
  async function uploadOneProduct(file: File) {
    const dataUrl = await imageToDataUrl(file);
    if (dataUrl.length > 8_000_000) { setErr('image_too_large'); return; }
    const marker: UploadAsset = { preview: dataUrl, uploading: true };
    let added = false;
    setProductAssets((prev) => { if (prev.length >= MAX_PRODUCT_IMAGES) return prev; added = true; return [...prev, marker]; });
    if (!added) { setErr(locale === 'zh' ? `产品图最多 ${MAX_PRODUCT_IMAGES} 张` : `Up to ${MAX_PRODUCT_IMAGES} product images`); return; }
    try {
      const j = await postJson('/api/marketing-studio/upload', { dataUrl });
      setProductAssets((prev) => prev.map((p) => (p === marker ? { preview: dataUrl, url: j.url } : p)));
    } catch (e) {
      setProductAssets((prev) => prev.filter((p) => p !== marker));
      setErr(e instanceof Error ? e.message : 'upload_failed');
    }
  }
  // 上传产品图(可选,多张):复用 marketing 上传端点;直接用原图作 seedance 参考,跨剧本保留。
  async function uploadProducts(files: FileList) {
    setErr(null);
    for (const f of Array.from(files)) await uploadOneProduct(f);
  }
  // ── STAGE A:生成所有角色定妆图 + 场景图。每个 job 独立 catch(失败标 fail、不拖垮其他),返回解析好的资产 map 供逐镜直接透传。 ──
  async function runAssets(): Promise<{ chars: Record<string, AssetState>; scene: AssetState; products?: string[] }> {
    const charList = script?.characters || [];
    const lc: Record<string, AssetState> = {};
    charList.forEach((c) => {
      const prev = charAssets[c.key];
      lc[c.key] = prev?.status === 'done' && prev.url ? { ...prev } : { status: 'idle', getUrl: prev?.getUrl };
    });
    let ls: AssetState = sceneAsset.status === 'done' && sceneAsset.url ? { ...sceneAsset } : { status: 'idle', getUrl: sceneAsset.getUrl };
    setCharAssets({ ...lc }); setSceneAsset({ ...ls });
    const syncChars = () => setCharAssets({ ...lc });
    const jobs: Promise<void>[] = charList.map((c) => (async () => {
      if (lc[c.key].status === 'done' && lc[c.key].url) return;
      lc[c.key] = { status: 'run', getUrl: lc[c.key].getUrl }; syncChars();
      try {
        if (!lc[c.key].getUrl) {
          const p = `Full-body character reference sheet of ${c.name}. ${c.appearance || c.persona}. Standing in a neutral studio, plain background, ultra-photorealistic cinematic, natural soft lighting, sharp facial detail, no text no watermark no logo.`;
          const im = await postJson('/api/drama-studio/shot-image', { prompt: p, ratio: '3:4' });
          lc[c.key] = { ...lc[c.key], getUrl: im.getUrl }; syncChars();
        }
        const url = await pollGen(lc[c.key].getUrl!);
        lc[c.key] = { status: 'done', url, getUrl: lc[c.key].getUrl }; syncChars();
      } catch (e) {
        lc[c.key] = { status: 'fail', err: e instanceof Error ? e.message : 'failed' }; syncChars(); // 清 getUrl,重试重新提交
      }
    })());
    jobs.push((async () => {
      if (ls.status === 'done' && ls.url) return;
      ls = { status: 'run', getUrl: ls.getUrl }; setSceneAsset({ ...ls });
      try {
        if (!ls.getUrl) {
          const p = `${script?.sceneImagePrompt || script?.setting || 'cinematic establishing shot'}. Cinematic establishing shot, wide angle, no people, dramatic lighting, film grain, no text no watermark.`;
          const im = await postJson('/api/drama-studio/shot-image', { prompt: p, ratio: videoRatio });
          ls = { ...ls, getUrl: im.getUrl }; setSceneAsset({ ...ls });
        }
        const url = await pollGen(ls.getUrl!);
        ls = { status: 'done', url, getUrl: ls.getUrl }; setSceneAsset({ ...ls });
      } catch (e) {
        ls = { status: 'fail', err: e instanceof Error ? e.message : 'failed' }; setSceneAsset({ ...ls });
      }
    })());
    // 产品图:直接用用户上传的多张原图作 seedance 参考,不再自动生成"定妆图"(用户要求用原图保真)。
    const productUrls = productAssets.map((p) => p.url).filter((u): u is string => !!u);
    await Promise.all(jobs);
    void patchDramaAssets(lc, ls, shotsRef.current, productUrls); // 定妆/场景/产品图完成 → 更新文件夹
    return { chars: lc, scene: ls, products: productUrls };
  }

  // STAGE A 按钮:生成/补全定妆图 + 场景图(失败的可再点重试)
  async function genAssets() {
    if (status !== 'authenticated') { signIn('google'); return; }
    if (!script) return;
    setErr(null); setBusy('assets');
    try {
      const currentCredits = await refreshCredits();
      const charList = script.characters || [];
      const needProduct = 0; // 产品图用用户上传的原图,不再自动生成扣费
      const need = (charList.filter((c) => !(charAssets[c.key]?.status === 'done' && charAssets[c.key]?.url)).length + (sceneAsset.status === 'done' && sceneAsset.url ? 0 : 1) + needProduct) * DRAMA_COSTS.image;
      if (!byokActive && currentCredits !== null && currentCredits < need) { setErr(`insufficient_credits:${need}:${currentCredits}`); return; }
      await runAssets();
    } finally {
      setBusy(null);
      window.dispatchEvent(new Event('atlas:credits'));
    }
  }

  // 单角色定妆图(重)生成:复用单角色逻辑,完成后同步文件夹。用户可改 appearance 后重出某个角色(不影响其他角色)。
  async function genOneCharacter(key: string) {
    if (status !== 'authenticated') { signIn('google'); return; }
    const c = script?.characters?.find((x) => x.key === key);
    if (!c) return;
    setErr(null);
    setCharAssets((prev) => ({ ...prev, [key]: { status: 'run' } }));
    try {
      const p = `Full-body character reference sheet of ${c.name}. ${c.appearance || c.persona}. Standing in a neutral studio, plain background, ultra-photorealistic cinematic, natural soft lighting, sharp facial detail, no text no watermark no logo.`;
      const im = await postJson('/api/drama-studio/shot-image', { prompt: p, ratio: '3:4' });
      const url = await pollGen(im.getUrl);
      setCharAssets((prev) => {
        const next = { ...prev, [key]: { status: 'done' as const, url, getUrl: im.getUrl } };
        void patchDramaAssets(next, sceneAsset, shotsRef.current); // 定妆图更新 → 同步文件夹
        return next;
      });
    } catch (e) {
      setCharAssets((prev) => ({ ...prev, [key]: { status: 'fail', err: e instanceof Error ? e.message : 'failed' } }));
    } finally {
      window.dispatchEvent(new Event('atlas:credits'));
    }
  }
  // 编辑某角色的英文外观提示词(改完点"重新生成"出新定妆图)。
  function editCharAppearance(key: string, val: string) {
    setScript((prev) => (prev ? { ...prev, characters: (prev.characters || []).map((c) => (c.key === key ? { ...c, appearance: val } : c)) } : prev));
  }
  // 单独(重)生成场景图:失败后可单独重试(不必整体重跑),完成后同步文件夹。
  async function genOneScene() {
    if (status !== 'authenticated') { signIn('google'); return; }
    if (!script) return;
    setErr(null);
    setSceneAsset({ status: 'run' });
    try {
      const p = `${script.sceneImagePrompt || script.setting || 'cinematic establishing shot'}. Cinematic establishing shot, wide angle, no people, dramatic lighting, film grain, no text no watermark.`;
      const im = await postJson('/api/drama-studio/shot-image', { prompt: p, ratio: videoRatio });
      const url = await pollGen(im.getUrl);
      const done: AssetState = { status: 'done', url, getUrl: im.getUrl };
      setSceneAsset(done);
      void patchDramaAssets(charAssets, done, shotsRef.current); // 场景图更新 → 同步文件夹
    } catch (e) {
      setSceneAsset({ status: 'fail', err: e instanceof Error ? e.message : 'failed' });
    } finally {
      window.dispatchEvent(new Event('atlas:credits'));
    }
  }

  // ── 单镜生成:出首帧(edit,带定妆图/场景/产品参考)+ i2v。按索引函数式更新、运行态守卫防并发/双击重复提交。ctx 透传资产避免读到过期 state。 ──
  async function genOneShot(i: number, ctx?: { chars: Record<string, AssetState>; scene: AssetState; products?: string[] }): Promise<boolean> {
    const seg = script?.segments?.[i];
    if (!seg) return false;
    const chars = ctx?.chars || charAssets;
    const scene = ctx?.scene || sceneAsset;
    const cur = shotsRef.current[i] || ({ img: 'idle', vid: 'idle' } as ShotState);
    if (cur.vid === 'done' && cur.vidUrl) return true;
    if (cur.img === 'run' || cur.vid === 'run') return false; // 运行态守卫:防并发/双击重复提交扣费
    patchShot(i, { err: undefined });
    try {
      // 组参考图 + @imageN 绑定:产品图(带货段)+ 出场角色定妆图 + 场景图,一次性喂 reference-to-video 直接出片
      // (不再先 edit 合成首帧再 i2v —— 少一步损耗,产品/角色/场景一致性由多参考锁定)。
      // refs 顺序 = 产品图 + 出场角色定妆图 + 场景图,喂 reference-to-video;@imageN 按顺序绑定。
      // seedance 上限 9:角色与场景一致性最关键,先占位;产品图用剩余配额,超出按配额截断。
      const prodRefs = ctx?.products ?? productAssets.map((p) => p.url).filter((u): u is string => !!u);
      const castUrls = (seg.cast || []).map((k) => ({ k, u: chars[k]?.url })).filter((x): x is { k: string; u: string } => !!x.u);
      const sceneUsed = scene.url ? 1 : 0;
      const productBudget = Math.max(0, MAX_SHOT_REFS - castUrls.length - sceneUsed);
      const useProducts = seg.product ? prodRefs.slice(0, productBudget) : [];
      const refs: string[] = [];
      const parts: string[] = [];
      useProducts.forEach((u) => { refs.push(u); parts.push(`@image${refs.length} is the product — keep its packaging, logo, colors and text pixel-identical, do not redesign it`); });
      castUrls.forEach(({ k }) => {
        if (refs.length >= MAX_SHOT_REFS) return;
        refs.push(chars[k]!.url!);
        const nm = script?.characters?.find((c) => c.key === k)?.name || k;
        parts.push(`@image${refs.length} is ${nm} — keep the same face, hairstyle and outfit`);
      });
      if (scene.url && refs.length < MAX_SHOT_REFS) { refs.push(scene.url); parts.push(`@image${refs.length} is the scene/environment`); }
      const vidPrompt = `${parts.join('. ')}. Cinematic film shot. ${seg.scene}. ${seg.action}. ${seg.dialogue ? `The characters speak this dialogue OUT LOUD with clear audible spoken voice and natural lip-sync: ${seg.dialogue}` : 'Natural ambient sound.'} Dramatic, WITH SOUND and spoken audio. No subtitles, no captions, no on-screen text or watermark.`;

      patchShot(i, { img: 'done' }); // reference-to-video 一步出片,无独立"合成首帧"步骤
      let vGetUrl = shotsRef.current[i]?.vidGetUrl;
      patchShot(i, { vid: 'run' });
      if (!vGetUrl) {
        const vd = await postJson('/api/marketing-studio/shot-video', { referenceImages: refs, prompt: vidPrompt, ratio: videoRatio, resolution: videoResolution, duration: seg.durationSec || 8 });
        vGetUrl = vd.getUrl; patchShot(i, { vidGetUrl: vGetUrl });
      }
      let vidUrl: string;
      try { vidUrl = await pollGen(vGetUrl!); }
      catch (e) { patchShot(i, { vidGetUrl: undefined }); throw e; }
      patchShot(i, { vid: 'done', vidUrl });
      // ⚠️ 不能直接用 shotsRef.current:setShots 异步,此刻 ref 还是旧值(本镜 vidUrl 不在里面),会导致文件夹"少最后一镜"。显式并入本镜再 patch。
      const nextShots = shotsRef.current.map((s, idx) => (idx === i ? { ...s, img: 'done' as const, vid: 'done' as const, vidUrl } : s));
      void patchDramaAssets(ctx?.chars || charAssets, ctx?.scene || sceneAsset, nextShots, ctx?.products ?? productAssets.map((p) => p.url).filter((u): u is string => !!u)); // 该镜完成 → 更新文件夹
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'failed';
      setShots((prev) => prev.map((s, idx) => (idx === i ? { ...s, img: s.img === 'run' ? 'fail' : s.img, vid: s.vid === 'run' ? 'fail' : s.vid, err: msg } : s)));
      return false;
    } finally {
      window.dispatchEvent(new Event('atlas:credits'));
    }
  }

  // 一键全部:确保资产就绪 → 依次生成每镜(失败不中断)→ 全部完成则自动拼接。逐镜可单独重试。
  async function genAllShots() {
    if (status !== 'authenticated') { signIn('google'); return; }
    if (!script?.segments?.length) return;
    setErr(null); setBusy('all'); setCompose({ status: 'idle', frac: 0, note: '', url: '' });
    if (shots.length !== script.segments.length) {
      setShots(script.segments.map((_, idx) => (shots[idx] && shots[idx].vid === 'done' && shots[idx].vidUrl ? shots[idx] : ({ img: 'idle', vid: 'idle' } as ShotState))));
    }
    try {
      let ctx: { chars: Record<string, AssetState>; scene: AssetState; products?: string[] } = { chars: charAssets, scene: sceneAsset, products: productAssets.map((p) => p.url).filter((u): u is string => !!u) };
      if (!assetsReady) {
        ctx = await runAssets();
        const ready = (script.characters || []).every((c) => ctx.chars[c.key]?.status === 'done' && !!ctx.chars[c.key]?.url) && ctx.scene.status === 'done' && !!ctx.scene.url
          && (!(script.segments || []).some((s) => s.product) || (ctx.products?.length ?? 0) > 0); // 带货剧必须有产品图,否则镜间产品不一致
        if (!ready) { setErr(locale === 'zh' ? '定妆图/场景图/产品图未全部成功,请在上方重试后再逐镜生成' : 'Some reference images failed — retry them above first'); return; }
      }
      for (let i = 0; i < script.segments.length; i++) {
        if (shotsRef.current[i]?.vid === 'done' && shotsRef.current[i]?.vidUrl) continue;
        await genOneShot(i, ctx); // 失败不中断,继续下一镜
      }
      if (script.segments.every((_, i) => shotsRef.current[i]?.vid === 'done' && shotsRef.current[i]?.vidUrl)) {
        await composeVideo();
      }
    } finally {
      setBusy(null);
      window.dispatchEvent(new Event('atlas:credits'));
    }
  }

  // 拼接成片 + 存档(所有镜视频都完成后)。不占用 busy,用 compose.status 单独跟踪。
  async function composeVideo() {
    const segs = script?.segments || [];
    if (!segs.length || !segs.every((_, i) => shotsRef.current[i]?.vid === 'done' && shotsRef.current[i]?.vidUrl)) return;
    const vidUrls = segs.map((_, i) => shotsRef.current[i]?.vidUrl).filter((u): u is string => !!u);
    const firstImg = shotsRef.current[0]?.imgUrl || '';
    let cid = creationIdRef.current || creationId;
    if (!cid) {
      // 正常情况下剧本生成时已建文件夹;这里兜底(极少走到)。
      try { const st = await postJson('/api/creations/start', { type: 'drama-studio', title: script?.title || topic.slice(0, 60) || '短剧', assets: buildDramaAssets(charAssets, sceneAsset, shotsRef.current) }); cid = st.id; setCreationId(cid); creationIdRef.current = cid; } catch { /* 占位失败不阻断 */ }
    }
    try {
      setCompose({ status: 'run', frac: 0, note: locale === 'zh' ? '开始拼接' : 'Starting to stitch', url: '' });
      const blob = await composeAdReel(vidUrls, (p) => setCompose((c) => ({ ...c, status: 'run', frac: p.frac, note: p.note })));
      setCompose({ status: 'done', frac: 1, note: locale === 'zh' ? '完成' : 'Done', url: URL.createObjectURL(blob) });
      try {
        const fd = new FormData();
        fd.append('file', blob, 'reel.mp4');
        fd.append('title', script?.title || topic.slice(0, 60) || 'Drama');
        fd.append('type', 'drama-studio');
        fd.append('thumbnail', firstImg);
        fd.append('shots', JSON.stringify(vidUrls));
        if (cid) fd.append('creationId', cid);
        await fetch('/api/marketing-studio/save-reel', { method: 'POST', body: fd });
      } catch { /* ignore history save failure */ }
      // 不清 creationId:文件夹已存成片,保留 id 让成片后仍能改角色/重生成时 patch;下次 genScript 会重置。
    } catch (e) {
      setCompose((c) => (c.status === 'run' ? { ...c, status: 'fail', note: e instanceof Error ? e.message : 'compose_failed' } : c));
      if (cid) fetch(`/api/creations/${cid}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...byokHeaders() }, body: JSON.stringify({ status: 'failed', error: e instanceof Error ? e.message : 'compose_failed' }) }).catch(() => {});
    }
  }

  const gridBg = {
    backgroundColor: INK,
    colorScheme: 'dark',
    backgroundImage:
      'radial-gradient(70% 55% at 50% -6%, rgba(112,54,240,0.10) 0%, rgba(112,54,240,0) 60%), linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)',
    backgroundSize: 'auto, 44px 44px, 44px 44px',
  } as React.CSSProperties;
  const selCls = 'appearance-none bg-white/[0.04] rounded-lg pl-2.5 pr-7 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-[#7036F0]';

  // 顶层 hydration gate:首帧统一空骨架,避免 session/locale 造成 SSR≠client 分歧(#418)。
  if (!mounted) return <main className="min-h-screen text-[#f7f7f8]" style={gridBg} />;
  return (
    <main className="min-h-screen text-[#f7f7f8]" style={gridBg}>
      {/* 顶栏 */}
      <div className="px-6 sm:px-8 py-5">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3">
          <a href="/" className="flex items-center gap-2 hover:opacity-80 transition">
            <div className="w-7 h-7 rounded-lg grid place-items-center text-sm" style={{ background: ACCENT }}>🎭</div>
            <b className="text-sm tracking-tight">Drama Studio</b>
          </a>
          <a href="/marketing-studio" className="text-xs text-white/60 hover:text-white transition">{locale === 'zh' ? '广告工作室' : 'Ad Studio'}</a>
          <a href="/" className="text-xs text-white/60 hover:text-white transition">{locale === 'zh' ? '← 全部应用' : '← All apps'}</a>
        </div>
      </div>

      {/* Hero */}
      <div className="text-center pt-14 pb-10 px-6">
        <div className="text-[11px] uppercase tracking-[0.24em] text-white/50 font-medium mb-3" style={{ fontFamily: 'var(--font-grotesk), "Space Grotesk", sans-serif' }}>Drama Studio</div>
        <h1 className="font-bold uppercase leading-[1.08] tracking-[-0.03em] text-[clamp(40px,5.4vw,58px)] text-white/90" style={{ fontFamily: 'var(--font-grotesk), "Space Grotesk", system-ui, sans-serif' }}>
          {locale === 'zh'
            ? <>把任何主题<br />变成一部<span style={{ color: ACCENT }}>短剧</span></>
            : <>Turn any topic<br />into a <span style={{ color: ACCENT }}>drama</span></>}
        </h1>
      </div>

      {/* 生成器面板 */}
      <div className="max-w-4xl mx-auto px-4">
        <div className="rounded-3xl border border-white/[0.06] p-4 sm:p-5 shadow-[0_24px_70px_-24px_rgba(0,0,0,0.85)]" style={{ background: PANEL }}>
          <textarea value={topic} onChange={(e) => setTopic(e.target.value)} rows={3}
            placeholder={locale === 'zh' ? '主题 / 产品,例如:社恐程序员第一次见挑剔的准丈母娘,靠一包纸巾力挽狂澜 / 史诗英雄推销一款平价保温杯……' : 'Topic / product, e.g. A shy programmer meets his picky future mother-in-law for the first time and saves the day with a pack of tissues / An epic hero pitches a budget thermos…'}
            className="w-full bg-transparent text-[15px] leading-relaxed resize-none focus:outline-none placeholder:text-white/30 px-1 pt-1" />
          <div className="flex items-center gap-2 flex-wrap mt-3">
            {DRAMA_STYLES.map((s) => (
              <button key={s.id} onClick={() => setStyle(s.id)}
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs transition border ${style === s.id ? 'border-[#7036F0] bg-[#7036F0]/15 text-white' : 'border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.06]'}`}>
                <span>{s.emoji}</span>{locale === 'zh' ? ({ epic: '史诗奇幻', palace: '宫斗权谋', wuxia: '武侠江湖', family: '家庭伦理', office: '职场斗争', hero: '超级英雄' }[s.id] ?? s.label) : s.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-wrap mt-3">
            <select value={segChoice} onChange={(e) => setSegChoice(e.target.value)} className={selCls} style={selStyle} title={locale === 'zh' ? '分镜段数:自动=AI 按剧情决定(4-6 段),或手动指定' : 'Number of scenes: auto (AI decides) or fixed'}>
              <option value="auto">{locale === 'zh' ? '段数:自动' : 'Scenes: auto'}</option>
              {[2, 3, 4, 5, 6, 8].map((n) => <option key={n} value={String(n)}>{locale === 'zh' ? `${n} 段` : `${n} scenes`}</option>)}
            </select>
            <select value={videoRatio} onChange={(e) => setVideoRatio(e.target.value)} className={selCls} style={selStyle} title={locale === 'zh' ? '画面比例' : 'Aspect ratio'}>{VIDEO_RATIOS.map((r) => <option key={r} value={r}>{r}</option>)}</select>
            <select value={videoResolution} onChange={(e) => setVideoResolution(e.target.value)} className={selCls} style={selStyle} title={locale === 'zh' ? '分辨率' : 'Resolution'}>{VIDEO_RESOLUTIONS.map((r) => <option key={r} value={r}>{r}</option>)}</select>
            <span className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg text-[11px] text-white/45 bg-white/[0.03] border border-white/10" title={locale === 'zh' ? '每段时长由 AI 按节奏规划,生成后可逐段微调;段数用左侧下拉选自动或手动' : 'Per-scene duration is AI-planned (tweak per scene after); pick scene count on the left'}>⏱️ {locale === 'zh' ? '时长 AI 规划' : 'AI timing'}</span>
            {/* 产品图上传(可选):带货短剧用你的真实产品锁一致性 */}
            <input ref={productInput} type="file" multiple accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const fs = e.target.files; if (fs && fs.length) void uploadProducts(fs); e.currentTarget.value = ''; }} />
            {productAssets.map((pa, idx) => (
              <span key={idx} className="inline-flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-lg text-[11px] bg-white/[0.04] border border-white/10">
                <span className="relative w-6 h-6 rounded overflow-hidden bg-black/30 shrink-0">
                  {pa.preview && <img src={pa.preview} alt="product" className={`w-full h-full object-cover ${pa.url ? 'cursor-zoom-in' : ''}`} onClick={() => pa.url && setZoomImg(pa.url)} />}
                  {pa.uploading && <span className="absolute inset-0 bg-black/60 grid place-items-center"><Loader2 className="w-3 h-3 animate-spin text-white" /></span>}
                </span>
                <button onClick={() => setProductAssets((prev) => prev.filter((_, k) => k !== idx))} title={locale === 'zh' ? '移除' : 'Remove'} className="text-white/40 hover:text-white"><X className="w-3 h-3" /></button>
              </span>
            ))}
            {productAssets.length < MAX_PRODUCT_IMAGES && (
              <button onClick={() => productInput.current?.click()} className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg text-[11px] text-white/55 bg-white/[0.03] border border-white/10 hover:border-[#7036F0]/60 transition" title={locale === 'zh' ? `上传产品图(可选,最多 ${MAX_PRODUCT_IMAGES} 张):用你的真实产品原图直接作参考` : `Upload product photos (optional, up to ${MAX_PRODUCT_IMAGES}): your real product images used directly as reference`}>
                <ImagePlus className="w-3.5 h-3.5" />{locale === 'zh' ? `产品图 ${productAssets.length}/${MAX_PRODUCT_IMAGES}` : `Product ${productAssets.length}/${MAX_PRODUCT_IMAGES}`}
              </button>
            )}
            <button onClick={genScript} disabled={busy !== null || !hasCreditsForScript}
              className="ml-auto px-6 py-2.5 rounded-xl font-extrabold text-sm inline-flex items-center gap-2 disabled:opacity-50 transition hover:brightness-110"
              style={{ background: `radial-gradient(90% 90% at 50% 120%, #a78bfa 0%, rgba(167,139,250,0) 60%), ${ACCENT}`, color: '#fff' }}>
              {busy === 'script' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />} {byokActive ? (locale === 'zh' ? '生成剧本' : 'Write script') : <>{!hasCreditsForScript ? (locale === 'zh' ? '积分不足' : 'Not enough credits') : (locale === 'zh' ? '生成剧本' : 'Write script')} · ✦{DRAMA_COSTS.script}</>}
            </button>
          </div>
          {status === 'authenticated' && (
            <div className="mt-3 text-center text-[11px] text-white/35">
              {byokActive
                ? (locale === 'zh' ? '用自己的 Key · 不扣积分' : 'Your own key · no credits charged')
                : locale === 'zh'
                ? `完整流程预计 ${totalEst} 积分(剧本 ${DRAMA_COSTS.script},定妆图约 ${assetCost},每场景约 ${segVideoCost()}),当前余额 ${credits ?? '·'}。`
                : `Full run estimate ${totalEst} credits (script ${DRAMA_COSTS.script}, cast/scene refs ~${assetCost}, ~${segVideoCost()}/scene), current balance ${credits ?? '·'}.`}
            </div>
          )}
        </div>
      </div>

      {zoomImg && (
        <div onClick={() => setZoomImg(null)} className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-4 cursor-zoom-out" role="dialog" aria-modal="true">
          <img src={zoomImg} alt="preview" className="max-w-[94vw] max-h-[90vh] w-auto h-auto object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />
          <button onClick={() => setZoomImg(null)} className="absolute top-4 right-4 text-white/70 hover:text-white" aria-label="close"><X className="w-6 h-6" /></button>
        </div>
      )}
      {err && <div className="max-w-4xl mx-auto px-4 mt-6"><div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2"><AlertCircle className="w-4 h-4" />{locale === 'zh' ? '错误' : 'Error'}: {dramaErrText(err, locale)}</div></div>}
      {notice && <div className="max-w-4xl mx-auto px-4 mt-6"><div className="flex items-center gap-2 text-sm text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-2"><AlertCircle className="w-4 h-4" />{notice}</div></div>}

      {/* 剧本展示 */}
      {script && (
        <div ref={storyboardRef} className="max-w-3xl mx-auto px-4 py-10 scroll-mt-6">
          <div className="rounded-3xl border border-white/[0.06] p-5" style={{ background: PANEL }}>
            <div className="flex items-center gap-2 mb-1"><Wand2 className="w-4 h-4" style={{ color: ACCENT }} /><b className="text-lg">{script.title || (locale === 'zh' ? '未命名剧本' : 'Untitled script')}</b></div>
            {script.logline && <p className="text-sm text-white/60 mb-3">{script.logline}</p>}
            {!!script.characters?.length && (
              <div className="mb-4">
                <div className="text-xs text-white/45 mb-2">🎭 {locale === 'zh' ? '角色定妆(生成视频时先出定妆图,锁住每个角色跨镜头长相一致)' : 'Cast — reference portraits are generated first to lock each character’s look across shots'}</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {script.characters.map((c) => {
                    const a = charAssets[c.key];
                    return (
                      <div key={c.key} className="rounded-xl border border-white/10 bg-black/20 p-2">
                        <div className="flex gap-2 items-center">
                          <div className="w-12 h-16 rounded-lg overflow-hidden bg-white/5 border border-white/10 shrink-0 grid place-items-center">
                            {a?.url ? <img src={a.url} alt={c.name} className="w-full h-full object-cover cursor-zoom-in" onClick={() => setZoomImg(a.url!)} />
                              : a?.status === 'run' ? <Loader2 className="w-4 h-4 animate-spin text-white/50" />
                              : a?.status === 'fail' ? <AlertCircle className="w-4 h-4 text-red-400" />
                              : <span className="text-lg opacity-60">🎭</span>}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-bold truncate" style={{ color: ACCENT }}>{c.name}</div>
                            <div className="text-[10px] text-white/50 overflow-hidden" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{c.persona}</div>
                          </div>
                          <div className="flex flex-col gap-1 shrink-0">
                            <button onClick={() => genOneCharacter(c.key)} disabled={a?.status === 'run' || busy === 'assets' || busy === 'all'} title={locale === 'zh' ? '重新生成这个角色的定妆图' : 'Regenerate this portrait'} className="p-1 rounded hover:bg-white/10 disabled:opacity-40 transition"><RefreshCw className={`w-3.5 h-3.5 text-white/60 ${a?.status === 'run' ? 'animate-spin' : ''}`} /></button>
                            <button onClick={() => setEditingChar(editingChar === c.key ? null : c.key)} title={locale === 'zh' ? '编辑角色外观提示词' : 'Edit appearance prompt'} className={`p-1 rounded hover:bg-white/10 transition ${editingChar === c.key ? 'bg-white/10' : ''}`}><Pencil className="w-3.5 h-3.5 text-white/60" /></button>
                          </div>
                        </div>
                        {editingChar === c.key && (
                          <div className="mt-2">
                            <textarea value={c.appearance || ''} onChange={(e) => editCharAppearance(c.key, e.target.value)} rows={3} placeholder={locale === 'zh' ? '角色外观(英文最佳:年龄/发型/服装/神态/布光…),改完点下方重新生成' : 'Appearance in English (age/hair/outfit/expression/lighting)…'} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-[11px] text-white/80 resize-y focus:outline-none focus:border-[#7036F0]" />
                            <button onClick={() => { setEditingChar(null); void genOneCharacter(c.key); }} disabled={a?.status === 'run'} className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg disabled:opacity-40 transition" style={{ background: ACCENT, color: '#fff' }}><RefreshCw className="w-3 h-3" />{locale === 'zh' ? `改词并重新生成 · ✦${DRAMA_COSTS.image}` : `Regenerate · ✦${DRAMA_COSTS.image}`}</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {(script.setting || sceneAsset.status !== 'idle') && (
              <div className="flex items-center gap-2 text-xs text-white/45 mb-4">
                {sceneAsset.status !== 'idle' && (
                  <span className="w-11 h-7 rounded overflow-hidden bg-white/5 border border-white/10 grid place-items-center shrink-0">
                    {sceneAsset.url ? <img src={sceneAsset.url} className="w-full h-full object-cover cursor-zoom-in" alt="scene" onClick={() => setZoomImg(sceneAsset.url!)} />
                      : sceneAsset.status === 'run' ? <Loader2 className="w-3 h-3 animate-spin text-white/50" />
                      : sceneAsset.status === 'fail' ? <AlertCircle className="w-3 h-3 text-red-400" /> : null}
                  </span>
                )}
                <span className="flex-1 min-w-0 truncate">🎬 {locale === 'zh' ? '场景设定' : 'Setting'}: {script.setting}</span>
                {sceneAsset.status === 'fail' && sceneAsset.err && <span className="text-red-400 truncate max-w-[28%]" title={sceneAsset.err}>{dramaErrText(sceneAsset.err, locale)}</span>}
                <button onClick={genOneScene} disabled={sceneAsset.status === 'run' || busy === 'assets' || busy === 'all'} title={locale === 'zh' ? '重新生成场景图' : 'Regenerate scene image'} className="p-1 rounded hover:bg-white/10 disabled:opacity-40 transition shrink-0"><RefreshCw className={`w-3.5 h-3.5 text-white/60 ${sceneAsset.status === 'run' ? 'animate-spin' : ''}`} /></button>
              </div>
            )}
            <div className="space-y-2">
              {(script.segments || []).map((seg, i) => {
                const st = shots[i];
                return (
                  <div key={i} className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="text-[11px] rounded-full px-2 py-0.5 bg-white/5 border border-white/10" style={{ color: ACCENT }}>{locale === 'zh' ? `场景 ${seg.i}` : `Scene ${seg.i}`}</span>
                      {/* 每段时长:AI 给建议值,用户可微调 */}
                      <select value={seg.durationSec || 8} onChange={(e) => setSegDuration(i, Number(e.target.value))} className="appearance-none bg-white/[0.06] rounded px-1.5 py-0.5 text-[10px] text-white/80 focus:outline-none focus:ring-1 focus:ring-[#7036F0]" title={locale === 'zh' ? '本段时长(秒),AI 规划可微调' : 'Scene duration (s), AI-planned & adjustable'}>{VIDEO_DURATIONS.map((d) => <option key={d} value={d}>{d}s</option>)}</select>
                      {/* 出场角色(对应定妆图参考) */}
                      {(seg.cast || []).map((k) => {
                        const c = script.characters?.find((x) => x.key === k);
                        return c ? <span key={k} className="text-[10px] rounded-full px-1.5 py-0.5 bg-[#7036F0]/15 border border-[#7036F0]/30 text-white/70">{c.name}</span> : null;
                      })}
                      {/* 产品出镜开关:仅在上传了产品图时显示;点亮的段合成时带产品图作参考锁一致性 */}
                      {productAssets.some((p) => p.url) && (
                        <button onClick={() => setSegProduct(i, !seg.product)} title={locale === 'zh' ? '该段是否出现产品(点击切换);点亮时用你上传的产品图锁一致性' : 'Toggle product in this shot; when on, uses your uploaded product image'} className={`text-[10px] rounded-full px-1.5 py-0.5 border transition ${seg.product ? 'bg-[#7036F0]/20 border-[#7036F0]/50 text-white' : 'bg-white/5 border-white/10 text-white/40'}`}>🛍️ {locale === 'zh' ? '产品' : 'Product'}</button>
                      )}
                      {seg.hook && <span className="text-[10px] text-white/40">💡 {seg.hook}</span>}
                      {st && <StatusChip icon={<Video className="w-3 h-3" />} label={locale === 'zh' ? '图片' : 'Image'} s={st.img} />}
                      {st && <StatusChip icon={<Film className="w-3 h-3" />} label={locale === 'zh' ? '视频' : 'Video'} s={st.vid} />}
                    </div>
                    <input value={seg.scene} onChange={(e) => editSeg(i, 'scene', e.target.value)} className="w-full mb-1.5 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white/80 focus:outline-none focus:border-[#7036F0]" placeholder={locale === 'zh' ? '镜头 / 构图' : 'Shot / framing'} />
                    <textarea value={seg.action} onChange={(e) => editSeg(i, 'action', e.target.value)} rows={2} className="w-full mb-1.5 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white/80 resize-y focus:outline-none focus:border-[#7036F0]" placeholder={locale === 'zh' ? '剧情 / 动作' : 'Plot / action'} />
                    <input value={seg.dialogue || ''} onChange={(e) => editSeg(i, 'dialogue', e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white/70 focus:outline-none focus:border-[#7036F0]" placeholder={locale === 'zh' ? '台词(可选)' : 'Dialogue (optional)'} />
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <button onClick={() => genOneShot(i)} disabled={!assetsReady || busy === 'all' || busy === 'assets' || st?.img === 'run' || st?.vid === 'run'} title={!assetsReady ? (locale === 'zh' ? '请先在下方生成定妆图 + 场景图' : 'Generate portraits + scene first') : ''} className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-40 transition" style={st?.vid === 'done' ? { border: '1px solid rgba(255,255,255,0.15)', color: '#fff' } : { background: ACCENT, color: '#fff' }}>
                        {(st?.img === 'run' || st?.vid === 'run') ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Video className="w-3.5 h-3.5" />}
                        {st?.vid === 'done' ? (locale === 'zh' ? '重新生成' : 'Regenerate') : (st?.img === 'fail' || st?.vid === 'fail') ? (locale === 'zh' ? '重试本镜' : 'Retry') : (locale === 'zh' ? `生成本镜 · ✦${segVideoCost(seg)}` : `Generate · ✦${segVideoCost(seg)}`)}
                      </button>
                      {st?.vid === 'done' && !!st?.vidUrl && <span className="text-[11px] text-emerald-400">✓ {locale === 'zh' ? '已完成' : 'Done'}</span>}
                      {st?.err && <span className="text-[11px] text-red-400 truncate max-w-[55%]" title={st.err}>{dramaErrText(st.err, locale)}</span>}
                    </div>
                    {st?.vid === 'done' && st.vidUrl && (
                      <video src={st.vidUrl} poster={st.imgUrl} controls playsInline className="mt-2 w-full max-w-[220px] rounded-lg border border-white/10 bg-black" />
                    )}
                  </div>
                );
              })}
            </div>
            {script.climax && <div className="mt-3 text-xs text-white/50">🔥 {locale === 'zh' ? '高潮' : 'Climax'}: {script.climax}</div>}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {/* ① 先出定妆图 + 场景图(失败的可再点重试,只补跑未完成的) */}
              <button onClick={genAssets} disabled={busy !== null || anyShotRunning} className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-bold disabled:opacity-50 border border-white/15 hover:border-[#7036F0] transition">
                {busy === 'assets' ? <Loader2 className="w-4 h-4 animate-spin" /> : <span className="text-sm">①</span>} {assetsReady ? (locale === 'zh' ? '定妆图/场景已就绪 ✓' : 'Reference ready ✓') : (locale === 'zh' ? `生成定妆图+场景 · ✦${assetCost}` : `Portraits + scene · ✦${assetCost}`)}
              </button>
              {/* ② 全部生成:依次逐镜,某镜失败不影响其他,可单独重试 */}
              <button onClick={genAllShots} disabled={busy !== null || !hasCreditsForVideo || anyShotRunning} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-extrabold disabled:opacity-50" style={{ background: ACCENT, color: '#fff' }}>
                {busy === 'all' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />} {byokActive ? (locale === 'zh' ? '全部生成' : 'Generate all') : <>{!hasCreditsForVideo ? (locale === 'zh' ? '积分不足' : 'Not enough credits') : (locale === 'zh' ? '全部生成' : 'Generate all')} · ✦{videoEst}</>}
              </button>
              {/* ③ 拼接:所有分镜视频都完成才可点 */}
              <button onClick={composeVideo} disabled={!allVidsDone || busy !== null || compose.status === 'run' || anyShotRunning} title={allVidsDone ? '' : (locale === 'zh' ? '所有分镜视频完成后才能拼接' : 'Available after every shot is done')} className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-bold disabled:opacity-40 border border-white/15 hover:border-[#7036F0] transition">
                {compose.status === 'run' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Film className="w-4 h-4" />} {locale === 'zh' ? '拼接成片' : 'Stitch final'}
              </button>
            </div>
            <div className="text-[11px] text-white/40 mt-2">{locale === 'zh' ? '生成过程请保持本页面打开(成片在你的浏览器本地拼接)。' : 'Keep this page open during generation (the final cut is stitched locally in your browser).'}</div>
          </div>
        </div>
      )}

      {/* 成片 */}
      {compose.status !== 'idle' && (
        <div className="max-w-3xl mx-auto px-4 pb-16">
          <div className="rounded-3xl border border-white/[0.06] p-5" style={{ background: PANEL }}>
            <div className="flex items-center gap-2 text-sm mb-2">
              {compose.status === 'done' ? <CheckCircle2 className="w-4 h-4" style={{ color: ACCENT }} /> : compose.status === 'fail' ? <AlertCircle className="w-4 h-4 text-red-400" /> : <Loader2 className="w-4 h-4 animate-spin" style={{ color: ACCENT }} />}
              <b>{compose.status === 'done' ? (locale === 'zh' ? '视频已就绪' : 'Video ready') : compose.status === 'fail' ? (locale === 'zh' ? '拼接失败' : 'Stitching failed') : (locale === 'zh' ? '拼接中' : 'Stitching')}</b><span className="text-xs text-white/40">{compose.note}</span>
            </div>
            {compose.status === 'run' && <div className="h-1.5 bg-white/10 rounded-full overflow-hidden"><div className="h-full transition-all" style={{ width: `${Math.round(compose.frac * 100)}%`, background: ACCENT }} /></div>}
            {compose.url && (
              <div className="mt-3">
                <video controls autoPlay muted src={compose.url} className="w-full max-w-[300px] rounded-xl border border-white/10" />
                <a href={compose.url} download="drama.mp4" className="mt-2 inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-white/15 hover:border-[#7036F0]"><Download className="w-4 h-4" />{locale === 'zh' ? '下载' : 'Download'}</a>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function StatusChip({ icon, label, s }: { icon: React.ReactNode; label: string; s: 'idle' | 'run' | 'done' | 'fail' }) {
  const cls = s === 'done' ? 'text-[#7036F0]' : s === 'run' ? 'text-white' : s === 'fail' ? 'text-red-400' : 'text-white/30';
  return <span className={`inline-flex items-center gap-1 text-[10px] ${cls}`}>{s === 'run' ? <Loader2 className="w-3 h-3 animate-spin" /> : icon}{label}</span>;
}
