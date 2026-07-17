'use client';
import { byokHeaders, useByokActive } from '@/lib/byok';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { AlertCircle, CheckCircle2, Download, Loader2, Play, Plus, Sparkles, Video, X } from 'lucide-react';
import { LazyVideo } from '@/components/LazyVideo';
import { useMounted } from '@/lib/use-mounted';
import { AD_FORMATS, AD_CATEGORIES, type AdCategory } from '@/lib/marketing-studio/formats';
import { AD_HOOKS, getHook } from '@/lib/marketing-studio/hooks';
import { AD_SETTINGS, getSetting } from '@/lib/marketing-studio/settings';
import { AVATAR_PRESETS, getAvatar } from '@/lib/marketing-studio/avatars';
import { EXAMPLE_VIDEOS, EXAMPLE_RECIPES } from '@/lib/marketing-studio/examples';
import type { MarketingPlan } from '@/lib/marketing-studio/schema';
import { videoCredits } from '@/lib/video-pricing';
import { useI18n } from '@/i18n/provider';

// ── Higgsfield marketing-studio/product 视觉规格(实测抓取)──
// bg #131416 · 面板实心 #1c1e21 · accent lime #7036F0 · 近黑字 #131416
// hero: Space Grotesk 700 uppercase / -1.6px / lh1.2 / 全白 rgba(255,255,255,.9)
const LIME = '#7036F0';
const INK = '#131416'; // lime 底上的近黑字(与页面底色一致)
const PANEL = '#1c1e21';
const COSTS = { plan: 3, image: 5, video: 12 };
// 视频模型:seedance-2.0/image-to-video(prompt 带台词 + generate_audio 即对口型,单步最便宜),与后端 REPLICA_VIDEO_MODEL 白名单一致
const REPLICA_VIDEO_MODEL = 'bytedance/seedance-2.0/image-to-video';

async function postJson(url: string, body: unknown) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...byokHeaders() }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.detail ? `${j.error || 'error'}: ${j.detail}` : (j.error || 'failed'));
  return j;
}
function imageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('read_failed'));
    r.readAsDataURL(file);
  });
}
// 代理轮询 Atlas 任务(无数据库):后端 /poll 用 key 查 getUrl 状态并回传。
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
          const output = (Array.isArray(c.outputs) ? c.outputs : [])[0];
          clearInterval(t);
          output ? resolve(output) : reject(new Error('empty_output'));
        }
        else if (c.status === 'failed') { clearInterval(t); reject(new Error(c.error || 'failed')); }
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
function errText(code: string, locale: string) {
  const zh = locale === 'zh';
  if (code.startsWith('insufficient_credits:')) {
    const [, need, have] = code.split(':');
    return zh ? `积分不足:本次需要 ${need} 积分,当前只有 ${have}。` : `Not enough credits: this step needs ${need}, you have ${have}.`;
  }
  if (code === 'insufficient_credits') return zh ? '积分不足,请前往定价页充值。' : 'Not enough credits. Please top up on the pricing page.';
  if (code === 'plan_fallback') return zh ? 'AI 出方案暂时不可用,已用模板方案,可直接生成或稍后重试。' : 'AI planning is temporarily unavailable; a template plan is used — you can generate now or retry later.';
  if (code === 'product_required') return zh ? '请先填写产品描述或上传产品图片。' : 'Please add a product description or upload a product image first.';
  if (code === 'image_too_large') return zh ? '图片太大了,请压缩到 8MB 以内。' : 'Image is too large. Please compress it to under 8MB.';
  if (code === 'not_image') return zh ? '请上传图片文件。' : 'Please upload an image file';
  if (code === 'video_failed' || code === 'empty_output' || code === 'generation failed' || code === 'failed') return zh ? '生成失败了,请点重试;若反复失败,可能是内容触发了审核或额度不足。' : 'Generation failed — please retry; if it persists it may be a content-safety block or low credits.';
  return zh ? `出错了:${code}(可点重试)` : `Something went wrong: ${code} (try again)`;
}

// imgGetUrl/vidGetUrl = Atlas 任务查询地址:提交后立刻持久化,刷新/中断后凭它恢复轮询,不重复提交扣费。
type ShotState = { img: 'idle' | 'run' | 'done' | 'fail'; vid: 'idle' | 'run' | 'done' | 'fail'; imgUrl?: string; vidUrl?: string; imgGetUrl?: string; vidGetUrl?: string };
// 生成进度持久化 key:plan/视频状态存 localStorage,刷新或切页回来自动恢复现场、断点续跑。
const MK_SESSION_KEY = 'mk-session-v1';
type Asset = { preview?: string; url?: string; uploading?: boolean };
const CAT_LABEL: Record<string, string> = { all: 'All', ugc: 'UGC', commercial: 'Commercial', tiktok: 'TikTok' };
const CAT_ICON: Record<string, string> = { tiktok: '🎵', ugc: '👤', commercial: '🎬' };
const VIDEO_RATIOS = ['9:16', '16:9', '1:1', '4:3', '3:4'];
const VIDEO_RESOLUTIONS = ['480p', '720p', '1080p'];
const VIDEO_DURATIONS = [4, 5, 6, 8, 10, 12, 15];
// 自定义 chevron(白色半透明),让原生 select 呈现统一 pill 外观
const CHEVRON = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23ffffff' stroke-opacity='0.55' stroke-width='3'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")";
const selStyle: React.CSSProperties = { backgroundImage: CHEVRON, backgroundPosition: 'right 8px center', backgroundSize: '10px', backgroundRepeat: 'no-repeat' };

function buildDirectMarketingPlan(input: { prompt: string; ratio: string; formatId: string; scene?: string }): MarketingPlan {
  const prompt = input.prompt.trim() || '产品视频';
  // 选了场景则用它(→plan.scene→后端 buildShotImageEditPrompt 的 Scene:),否则退回无人产品场景默认
  const scene = input.scene
    ? `The whole scene is set in ${input.scene}. Request: ${prompt}.`
    : `Cinematic product scene for this request: ${prompt}. No presenter, no human, no storyboard panels.`;
  return {
    title: prompt.slice(0, 60),
    ratio: input.ratio,
    formatId: input.formatId,
    product: `Uploaded product reference and request: ${prompt}`,
    character: '',
    scene,
    shots: [{
      i: 1,
      shot: `Cinematic product scene, no presenter, no human unless explicitly requested: ${prompt}. Use the uploaded product image as the exact product reference and integrate it into the scene.`,
      prompt: `One continuous realistic advertising video: ${prompt}. Smooth camera motion, physically plausible environment transformation, strong product consistency.`,
    }],
  };
}

function buildDirectVideoPrompt(plan: MarketingPlan, lang: string) {
  const request = plan.shots[0]?.prompt || plan.product;
  return [
    `Create one continuous ${plan.ratio} realistic video from the generated first frame.`,
    `User request: ${request}.`,
    'Use the uploaded product image as the product reference. Keep the product identity, label, color, bottle shape and materials consistent.',
    'If the request describes a scene transformation, make it cinematic and physically plausible with smooth camera motion.',
    `Clear natural motion, no subtitles, no watermark, clear spoken ${lang} only if speech is needed.`,
  ]
    .filter(Boolean)
    .join(' ')
    .slice(0, 3000);
}

export default function MarketingStudioPage() {
  const { status } = useSession();
  const mounted = useMounted();
  const { locale } = useI18n();
  const byokActive = useByokActive();
  const [category, setCategory] = useState<AdCategory | 'all'>('all');
  const [formatId, setFormatId] = useState('ugc');
  const [product, setProduct] = useState('');
  const [hookId, setHookId] = useState('none');
  const [settingId, setSettingId] = useState('none');
  const [avatarId, setAvatarId] = useState('none');
  const [lang, setLang] = useState('英文');
  const [videoRatio, setVideoRatio] = useState('9:16');
  const [videoResolution, setVideoResolution] = useState('1080p');
  const [videoDuration, setVideoDuration] = useState(15);
  const [productAssets, setProductAssets] = useState<Asset[]>([]); // 产品图支持多张
  const [avatarAsset, setAvatarAsset] = useState<Asset>({});
  const [plan, setPlan] = useState<MarketingPlan | null>(null);
  const [shots, setShots] = useState<ShotState[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [compose, setCompose] = useState<{ status: 'idle' | 'run' | 'done' | 'fail'; frac: number; note: string; url: string }>({ status: 'idle', frac: 0, note: '', url: '' });
  const [preview, setPreview] = useState<string | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [creationId, setCreationId] = useState(''); // 点生成时创建的"作品占位"id,完成/失败时更新它
  const [replica, setReplica] = useState<{ imgPrompt: string } | null>(null); // 非空=复刻模式(视频提示词已填入文本框可编辑),存出图专用构图 prompt
  const [expanding, setExpanding] = useState(false); // AI 扩写提示词中
  const productInput = useRef<HTMLInputElement>(null);
  const avatarInput = useRef<HTMLInputElement>(null);

  const fmt = useMemo(() => AD_FORMATS.find((f) => f.id === formatId) || AD_FORMATS[0], [formatId]);
  const visibleFormats = useMemo(() => (category === 'all' ? AD_FORMATS : AD_FORMATS.filter((f) => f.category === category)), [category]);
  // 视频步骤动态计费(按当前选的分辨率/时长实时算);首帧图仍走固定 COST.image。
  const videoCost = videoCredits(REPLICA_VIDEO_MODEL, videoResolution, videoDuration);
  const shotCost = COSTS.image + videoCost;
  const hasCreditsForVideo = byokActive || status !== 'authenticated' || credits === null || credits >= shotCost;

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

  // ── 生成进度持久化:刷新/切页不丢现场 ──
  // 恢复(mounted 后一次):24h 内的会话恢复 plan/视频状态;中断时的 'run' 归一为 'idle',
  // 已存 getUrl 的步骤续跑时直接恢复轮询(不重新提交、不重复扣费)。
  useEffect(() => {
    if (!mounted) return;
    try {
      const raw = localStorage.getItem(MK_SESSION_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (Date.now() - (s.ts || 0) > 24 * 3600_000) return; // 只看时效;不再要求有 plan(填了输入还没生成也要恢复,登录跳转回来不丢)
      // 输入项一律恢复(登录 OAuth 跳转/刷新回来都不丢)
      if (typeof s.product === 'string') setProduct(s.product);
      if (typeof s.formatId === 'string' && s.formatId) setFormatId(s.formatId);
      if (typeof s.hookId === 'string' && s.hookId) setHookId(s.hookId);
      if (typeof s.settingId === 'string' && s.settingId) setSettingId(s.settingId);
      if (typeof s.avatarId === 'string' && s.avatarId) setAvatarId(s.avatarId);
      if (s.replica && typeof s.replica.imgPrompt === 'string') setReplica(s.replica);
      // 图只存了 url(R2/同源,可恢复);blob preview 重载即失效,用 url 兜底
      const purls: string[] = Array.isArray(s.productUrls) ? s.productUrls.filter(Boolean) : (s.productUrl ? [s.productUrl] : []);
      if (purls.length) setProductAssets(purls.map((u: string) => ({ preview: u, url: u })));
      if (s.avatarUrl) setAvatarAsset({ preview: s.avatarUrl, url: s.avatarUrl });
      if (VIDEO_RESOLUTIONS.includes(s.videoResolution)) setVideoResolution(s.videoResolution);
      if (VIDEO_DURATIONS.includes(s.videoDuration)) setVideoDuration(s.videoDuration);
      if (VIDEO_RATIOS.includes(s.videoRatio)) setVideoRatio(s.videoRatio);
      // plan/shots 仅在确有已生成内容时恢复(断点续跑);中断的 'run' 归一为 'idle'
      if (s.plan?.shots?.length) {
        setPlan(s.plan);
        const first = Array.isArray(s.shots) && s.shots[0] ? s.shots[0] : { img: 'idle', vid: 'idle' };
        // 未完成的镜清掉 getUrl,续跑重新提交,不轮询可能已过期的旧任务(否则"点生成没调 Atlas")
        const imgDone = first.img === 'done' && !!first.imgUrl;
        const vidDone = first.vid === 'done' && !!first.vidUrl;
        setShots([{
          img: imgDone ? 'done' : 'idle', vid: vidDone ? 'done' : 'idle',
          imgUrl: imgDone ? first.imgUrl : undefined, vidUrl: vidDone ? first.vidUrl : undefined,
          imgGetUrl: imgDone ? first.imgGetUrl : undefined, vidGetUrl: vidDone ? first.vidGetUrl : undefined,
        }]);
      }
      if (typeof s.creationId === 'string') setCreationId(s.creationId);
    } catch { /* ignore broken session */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  // 保存:plan/视频状态每次变化都落 localStorage(imgUrl/vidUrl 是 R2 同源地址,持久可播)。
  useEffect(() => {
    if (!mounted) return; // 不再要求有 plan:只填了输入(还没生成)也存,登录 OAuth 跳转回来才不丢
    try {
      localStorage.setItem(MK_SESSION_KEY, JSON.stringify({
        plan, shots, product, formatId, hookId, settingId, avatarId, replica,
        videoRatio, videoResolution, videoDuration, creationId,
        productUrls: productAssets.map((a) => a.url).filter(Boolean), avatarUrl: avatarAsset.url || '', // 图只存 R2/同源 url(blob preview 重载即失效)
        ts: Date.now(),
      }));
    } catch { /* storage full etc. */ }
  }, [mounted, plan, shots, product, formatId, hookId, settingId, avatarId, replica, videoRatio, videoResolution, videoDuration, creationId, productAssets, avatarAsset.url]);

  async function onPick(kind: 'product' | 'avatar', file?: File | null) {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setErr('not_image'); return; }
    setErr(null);
    let dataUrl: string;
    try { dataUrl = await imageToDataUrl(file); }
    catch (e) { setErr(e instanceof Error ? e.message : 'upload_failed'); return; }
    if (dataUrl.length > 8_000_000) { setErr('image_too_large'); return; }
    if (kind === 'avatar') {
      setAvatarAsset({ preview: dataUrl, uploading: true });
      try {
        const j = await postJson('/api/marketing-studio/upload', { dataUrl });
        setAvatarAsset({ preview: dataUrl, url: j.url, uploading: false });
      } catch (e) { setAvatarAsset({}); setErr(e instanceof Error ? e.message : 'upload_failed'); }
      return;
    }
    // 产品图:追加到数组(可多张)。用对象引用定位这张,完成/失败只改这张。
    const slot: Asset = { preview: dataUrl, uploading: true };
    setProductAssets((prev) => [...prev, slot]);
    try {
      const j = await postJson('/api/marketing-studio/upload', { dataUrl });
      setProductAssets((prev) => prev.map((a) => (a === slot ? { preview: dataUrl, url: j.url, uploading: false } : a)));
    } catch (e) {
      setProductAssets((prev) => prev.filter((a) => a !== slot));
      setErr(e instanceof Error ? e.message : 'upload_failed');
    }
  }

  useEffect(() => {
    if (!mounted) return;
    const handlePaste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.files || []).find((item) => item.type.startsWith('image/'));
      if (!file) return;
      event.preventDefault();
      void onPick('product', file);
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  // 一键复刻:把该样例的产品图 + 产品描述带入生成器,选中对应玩法,滚回顶部,用户可直接生成同款广告(也可换成自己的产品图)。
  function replicateExample(fid: string) {
    const r = EXAMPLE_RECIPES[fid];
    setFormatId(fid);
    setReplica(r ? { imgPrompt: r.imgPrompt } : null);
    if (r) {
      setProduct(r.vidPrompt); // 完整视频提示词填入文本框:用户可见、可编辑、可微调台词/动作/场景
      setProductAssets(r.image ? [{ preview: r.image, url: r.image }] : []); // 带入产品图(可再加自己的多张)
      setAvatarAsset(r.avatar ? { preview: r.avatar, url: r.avatar } : {}); // 带入人物图(UGC 口播类才有),无则清空
    }
    setPlan(null); setShots([]); setErr(null);
    setCompose({ status: 'idle', frac: 0, note: '', url: '' });
    // 延迟到本次 setState 重渲染之后再滚,否则 smooth 动画会被打断,用户停在卡片墙看不到"已填好"。
    if (typeof window !== 'undefined') setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 60);
  }

  // AI 扩写:把文本框里的简短描述扩写成完整 UGC 视频提示词(参考已上传的产品图/人物图,台词跟随输入语言)
  async function expandPrompt() {
    const brief = product.trim();
    if (!brief) { setErr(locale === 'zh' ? '请先输入简短描述再扩写' : 'Enter a short brief first'); return; }
    setExpanding(true); setErr(null);
    try {
      const r = await postJson('/api/marketing-studio/expand-prompt', { brief, formatId, productUrls: productAssets.map((a) => a.url).filter(Boolean), avatarUrl: avatarAsset.url || '' });
      if (r.prompt) { setProduct(r.prompt); setReplica(null); } // 扩写结果=手动详细脚本(非复刻),出图也用它
    } catch (e) {
      setErr(String((e as Error).message || e));
    } finally {
      setExpanding(false);
    }
  }

  async function genDirectVideo() {
    if (status !== 'authenticated') { signIn('google'); return; }
    if (!product.trim() && !productAssets.some((a) => a.url)) { setErr('product_required'); return; }
    if (productAssets.some((a) => a.uploading) || avatarAsset.uploading) return;
    // 场景/钩子下拉 → 注入 prompt 占位(both 复刻/普通模式生效):场景进画面(出图+视频),钩子进视频开场
    const settingRecipe = getSetting(settingId).recipe; // 英文场景描述(空=智能自选)
    const hookEn = getHook(hookId).promptEn || ''; // 英文开场钩子指令
    const sceneAdd = settingRecipe ? ` The whole scene is set in ${settingRecipe}.` : '';
    const hookAdd = hookEn ? ` Opening hook in the first 3 seconds: ${hookEn}.` : '';
    const directPlan = buildDirectMarketingPlan({ prompt: product.trim() || '产品视频', ratio: videoRatio, formatId, scene: settingRecipe || undefined });
    const local: ShotState = { img: 'idle', vid: 'idle' };
    setErr(null);
    setBusy('video');
    setPlan(directPlan);
    setShots([local]);
    setCreationId('');
    setCompose({ status: 'run', frac: 0.05, note: locale === 'zh' ? '准备生成' : 'Preparing', url: '' });
    let cid = '';
    try {
      const currentCredits = await refreshCredits();
      if (!byokActive && currentCredits !== null && currentCredits < shotCost) {
        setErr(`insufficient_credits:${shotCost}:${currentCredits}`);
        setCompose({ status: 'idle', frac: 0, note: '', url: '' });
        setBusy(null);
        return;
      }
      // 作品页立刻出现"生成中"这条作品:没有占位就创建一条(续跑时复用已有的)
      try {
        const st = await postJson('/api/creations/start', { type: 'marketing-studio', title: directPlan.title || product.slice(0, 60) || '产品广告' });
        cid = st.id;
        setCreationId(cid);
      } catch { /* 占位失败不阻断生成 */ }

      setCompose({ status: 'run', frac: 0.15, note: locale === 'zh' ? '生成首帧' : 'Generating first frame', url: '' });
      local.img = 'run';
      setShots([{ ...local }]);
      const im = await postJson('/api/marketing-studio/shot-image', {
        plan: directPlan,
        shotIndex: 0,
        productUrls: productAssets.map((a) => a.url).filter(Boolean),
        avatarUrl: avatarAsset.url || '',
        promptOverride: (replica ? replica.imgPrompt : product.trim()) + sceneAdd, // 出图 prompt:复刻用配方构图,手动/扩写用文本框内容
      });
      local.imgGetUrl = im.getUrl;
      setShots([{ ...local }]);
      const imgUrl = await pollGen(local.imgGetUrl!);
      local.img = 'done';
      local.imgUrl = imgUrl;
      setShots([{ ...local }]);

      setCompose({ status: 'run', frac: 0.48, note: locale === 'zh' ? '生成视频' : 'Generating video', url: '' });
      local.vid = 'run';
      setShots([{ ...local }]);
      const vd = await postJson('/api/marketing-studio/shot-video', {
        imageUrl: imgUrl,
        prompt: product.trim() + sceneAdd + hookAdd + ' No subtitles, no captions, no on-screen text or watermark.', // 视频 prompt = 文本框内容 + 场景 + 钩子;明确禁字幕(seedance 常自动烧字幕)
        ratio: directPlan.ratio,
        resolution: videoResolution,
        duration: videoDuration,
        model: REPLICA_VIDEO_MODEL, // 统一 seedance-2.0 i2v(prompt 带台词 + generate_audio):复刻和手动扩写都能对口型出口播
      });
      local.vidGetUrl = vd.getUrl;
      setShots([{ ...local }]);
      const vidUrl = await pollGen(local.vidGetUrl!);
      local.vid = 'done';
      local.vidUrl = vidUrl;
      setShots([{ ...local }]);
      setCompose({ status: 'done', frac: 1, note: 'Done', url: vidUrl });

      // 存历史:成片 URL → 写 Creation(登录用户;失败不影响页面展示)
      try {
        await postJson('/api/marketing-studio/save-reel', {
          url: vidUrl,
          title: directPlan.title || product.slice(0, 60) || 'Ad',
          type: 'marketing-studio',
          thumbnail: imgUrl,
          creationId: cid,
        });
      } catch { /* ignore history save failure */ }
      setCreationId(''); // 本条已完成,下次点生成再建新占位
      setReplica(null); // 复刻完成,退出复刻模式
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'video_failed');
      local.img = local.img === 'run' ? 'fail' : local.img;
      local.vid = local.vid === 'run' ? 'fail' : local.vid;
      setShots([{ ...local }]);
      setCompose((c) => (c.status === 'run' ? { ...c, status: 'fail', note: errText(e instanceof Error ? e.message : 'video_failed', locale) } : c));
      // 作品页把这条占位标记为"失败"(而不是永远转圈)
      if (cid) fetch(`/api/creations/${cid}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...byokHeaders() }, body: JSON.stringify({ status: 'failed', error: e instanceof Error ? e.message : 'video_failed' }) }).catch(() => {});
      setCreationId('');
    }
    setBusy(null);
    window.dispatchEvent(new Event('atlas:credits'));
  }

  const gridBg = {
    backgroundColor: INK,
    colorScheme: 'dark',
    backgroundImage:
      'radial-gradient(70% 55% at 50% -6%, rgba(112,54,240,0.06) 0%, rgba(112,54,240,0) 60%), linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)',
    backgroundSize: 'auto, 44px 44px, 44px 44px',
  } as React.CSSProperties;
  const selCls = 'appearance-none bg-white/[0.04] rounded-lg pl-2.5 pr-7 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-[#7036F0]';

  // 单张已上传缩略图(带删除);产品图可多张,人物图单张
  const ThumbSlot = ({ asset, onRemove, label }: { asset: Asset; onRemove: () => void; label: string }) => (
    <div className="relative w-14 h-14 rounded-2xl overflow-hidden border border-white/15 shrink-0">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={asset.preview} alt={label} className="w-full h-full object-cover" />
      {asset.uploading && <div className="absolute inset-0 bg-black/60 grid place-items-center"><Loader2 className="w-4 h-4 animate-spin text-white" /></div>}
      {asset.url && <div className="absolute bottom-0 inset-x-0 text-[8px] text-center font-semibold leading-tight" style={{ background: LIME, color: '#fff' }}>{locale === 'zh' ? '已传' : 'OK'}</div>}
      <button onClick={onRemove} className="absolute top-0.5 right-0.5 bg-black/60 rounded-full p-0.5"><X className="w-3 h-3 text-white" /></button>
    </div>
  );
  const AddSlot = ({ onClick, label }: { onClick: () => void; label: string }) => (
    <button onClick={onClick} className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-[#7036F0]/60 hover:bg-white/[0.06] flex flex-col items-center justify-center gap-0.5 text-white/45 hover:text-[#7036F0] transition shrink-0">
      <Plus className="w-4 h-4" /><span className="text-[8px] uppercase tracking-wide leading-none text-center px-0.5">{label}</span>
    </button>
  );

  // 顶层 hydration gate:首帧(SSR + client hydration)统一渲染空骨架,mounted 后再渲染真实内容,
  // 彻底规避页面内 client-only 状态(session/credits/locale)造成的 SSR≠client 分歧(React #418)。
  if (!mounted) return <main className="min-h-screen text-[#f7f7f8]" style={gridBg} />;
  return (
    <main className="min-h-screen text-[#f7f7f8]" style={gridBg}>
      {/* 顶栏 */}
      <div className="px-6 sm:px-8 py-5">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3">
          <a href="/" className="flex items-center gap-2 hover:opacity-80 transition">
            <div className="w-7 h-7 rounded-lg grid place-items-center text-sm" style={{ background: LIME }}>🎬</div>
            <b className="text-sm tracking-tight">Marketing Studio</b>
          </a>
          <a href="/" className="flex items-center gap-1 text-xs text-white/60 hover:text-white transition">← {locale === 'zh' ? '全部应用' : 'All apps'}</a>
        </div>
      </div>

      {/* Hero */}
      <div className="text-center pt-14 pb-10 px-6">
        <div className="text-[11px] uppercase tracking-[0.24em] text-white/50 font-medium mb-3" style={{ fontFamily: 'var(--font-grotesk), "Space Grotesk", sans-serif' }}>Marketing Studio</div>
        <h1 className="font-bold uppercase leading-[1.08] tracking-[-0.03em] text-[clamp(40px,5.4vw,58px)] text-white/90" style={{ fontFamily: 'var(--font-grotesk), "Space Grotesk", system-ui, sans-serif' }}>
          {locale === 'zh'
            ? <>把任何产品<br />变成视频广告</>
            : <>Turn any product<br />into a video ad</>}
        </h1>
      </div>

      {/* 生成器面板 */}
      <div className="max-w-4xl mx-auto px-4">
        <div className="rounded-3xl border border-white/[0.06] p-4 sm:p-5 shadow-[0_24px_70px_-24px_rgba(0,0,0,0.85)]" style={{ background: PANEL }}>
          <div className="flex items-stretch gap-4">
            {/* prompt + 控件 */}
            <div className="flex-1 min-w-0 flex flex-col">
              <input ref={productInput} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { Array.from(e.target.files || []).forEach((f) => void onPick('product', f)); e.target.value = ''; }} />
              <input ref={avatarInput} type="file" accept="image/*" className="hidden" onChange={(e) => { void onPick('avatar', e.target.files?.[0]); e.target.value = ''; }} />
              {/* 上传图:产品(可多张,一次可多选)+ 人物,横排放输入框上方 */}
              <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
                {productAssets.map((a, i) => <ThumbSlot key={i} asset={a} onRemove={() => setProductAssets((prev) => prev.filter((_, j) => j !== i))} label={locale === 'zh' ? '产品' : 'Product'} />)}
                {productAssets.length < 4 && <AddSlot onClick={() => productInput.current?.click()} label={productAssets.length ? (locale === 'zh' ? '加产品' : 'Add') : (locale === 'zh' ? '产品' : 'Product')} />}
                <span className="w-px h-12 bg-white/10 mx-1 shrink-0" />
                {avatarAsset.preview
                  ? <ThumbSlot asset={avatarAsset} onRemove={() => setAvatarAsset({})} label={locale === 'zh' ? '人物' : 'Avatar'} />
                  : <AddSlot onClick={() => avatarInput.current?.click()} label={locale === 'zh' ? '人物' : 'Avatar'} />}
              </div>
              <textarea value={product} onChange={(e) => setProduct(e.target.value)} rows={4}
                placeholder={locale === 'zh' ? '一句话描述产品/广告,点「AI 扩写」生成完整口播脚本;也可直接粘贴或编辑完整提示词…' : 'One line about your product/ad, then hit AI Expand; or paste & edit a full prompt…'}
                className="w-full flex-1 bg-transparent text-[15px] leading-relaxed resize-none focus:outline-none placeholder:text-white/30 px-1 pt-1" />
              <div className="flex items-center gap-2 mt-1 mb-1">
                <button onClick={expandPrompt} disabled={expanding || !product.trim()} className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg text-[#131517] disabled:opacity-40 transition hover:brightness-110" style={{ background: LIME }}>{expanding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}{locale === 'zh' ? 'AI 扩写完美提示词' : 'AI Expand'}</button>
                {replica && <span className="text-[11px] text-white/45">{locale === 'zh' ? '✨ 已载入复刻脚本,可直接编辑台词/动作' : '✨ Replica script loaded — edit freely'}</span>}
              </div>
              <div className="flex items-center gap-2 flex-wrap mt-2">
                <select value={formatId} onChange={(e) => setFormatId(e.target.value)} className={selCls} style={selStyle} title={locale === 'zh' ? '玩法' : 'Format'}>
                  {AD_FORMATS.map((f) => <option key={f.id} value={f.id}>{f.emoji} {locale === 'zh' ? (f.zh ?? f.label) : f.label}</option>)}
                </select>
                {!replica && <select value={hookId} onChange={(e) => setHookId(e.target.value)} className={selCls} style={selStyle} title={locale === 'zh' ? '开场钩子' : 'Hook'}>{AD_HOOKS.map((h) => <option key={h.id} value={h.id}>{h.id === 'none' ? (locale === 'zh' ? '钩子(可选)' : 'Hook (optional)') : (locale === 'zh' ? (h.zh ?? h.label) : h.label)}</option>)}</select>}
                {!replica && <select value={settingId} onChange={(e) => setSettingId(e.target.value)} className={selCls} style={selStyle} title={locale === 'zh' ? '场景' : 'Setting'}>{AD_SETTINGS.map((s) => <option key={s.id} value={s.id}>{s.id === 'none' ? (locale === 'zh' ? '场景(可选)' : 'Setting (optional)') : (locale === 'zh' ? (s.zh ?? s.label) : s.label)}</option>)}</select>}
                <select value={avatarId} onChange={(e) => { const id = e.target.value; setAvatarId(id); const a = getAvatar(id); setAvatarAsset(a.image ? { preview: a.image, url: a.image } : {}); }} disabled={!fmt.needsPerson} className={`${selCls} disabled:opacity-40`} style={selStyle} title={locale === 'zh' ? '出镜人物(选了自动填充形象图)' : 'Avatar (auto-fills a portrait)'}>{AVATAR_PRESETS.map((a) => <option key={a.id} value={a.id}>{a.id === 'none' ? (locale === 'zh' ? '人物(可选)' : 'Avatar (optional)') : (locale === 'zh' ? (a.zh ?? a.label) : a.label)}</option>)}</select>
                <select value={videoRatio} onChange={(e) => setVideoRatio(e.target.value)} className={selCls} style={selStyle} title={locale === 'zh' ? '画面比例' : 'Aspect ratio'}>{VIDEO_RATIOS.map((r) => <option key={r} value={r}>{r}</option>)}</select>
                <select value={videoResolution} onChange={(e) => setVideoResolution(e.target.value)} className={selCls} style={selStyle} title={locale === 'zh' ? '分辨率' : 'Resolution'}>{VIDEO_RESOLUTIONS.map((r) => <option key={r} value={r}>{r}</option>)}</select>
                <select value={videoDuration} onChange={(e) => setVideoDuration(Number(e.target.value))} className={selCls} style={selStyle} title={locale === 'zh' ? '时长' : 'Duration'}>{VIDEO_DURATIONS.map((d) => <option key={d} value={d}>{d}s</option>)}</select>
                {/* 语言下拉已移除:台词语言自动跟随文本框里输入的语言(中文输入→中文台词) */}
              </div>
            </div>
            {/* GENERATE(通高) */}
            <button onClick={genDirectVideo} disabled={busy !== null || productAssets.some((a) => a.uploading) || avatarAsset.uploading || !hasCreditsForVideo}
              className="self-stretch px-6 rounded-2xl font-extrabold text-sm flex flex-col items-center justify-center gap-1.5 disabled:opacity-50 transition hover:brightness-105 shrink-0"
              style={{ background: `radial-gradient(90% 90% at 50% 120%, #a78bfa 0%, rgba(167,139,250,0) 60%), ${LIME}`, color: '#fff' }}>
              {busy === 'video' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Video className="w-5 h-5" />}
              <span>{byokActive ? (locale === 'zh' ? '生成视频' : 'GENERATE') : (!hasCreditsForVideo ? (locale === 'zh' ? '积分不足' : 'LOW CREDITS') : (locale === 'zh' ? '生成视频' : 'GENERATE'))}</span>{!byokActive && <span className="text-[10px] opacity-70">✦ {shotCost}</span>}
            </button>
          </div>
          {(status === 'authenticated' || byokActive) && (
            <div className="mt-3 text-center text-[11px] text-white/35">
              {byokActive
                ? (locale === 'zh' ? '用自己的 Key · 不扣积分' : 'Your own key · no credits charged')
                : (locale === 'zh'
                  ? `直接生成预计 ${shotCost} 积分(首帧 ${COSTS.image},视频 ${videoCost}),当前余额 ${credits ?? '·'}。`
                  : `Direct generation estimate ${shotCost} credits (first frame ${COSTS.image}, video ${videoCost}), current balance ${credits ?? '·'}.`)}
            </div>
          )}
        </div>
      </div>

      {err && <div className="max-w-4xl mx-auto px-4 mt-4 mb-6"><div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2"><AlertCircle className="w-4 h-4" />{errText(err, locale)}</div></div>}

      {/* 成片 */}
      {compose.status !== 'idle' && (
        <div className="max-w-md mx-auto px-4 pb-16">
          <div className="rounded-3xl border border-white/10 p-5 shadow-[0_24px_80px_-28px_rgba(112,54,240,0.55)]" style={{ background: PANEL }}>
            <div className="flex items-center gap-2 text-sm mb-3">
              {compose.status === 'done' ? <CheckCircle2 className="w-4 h-4" style={{ color: LIME }} /> : compose.status === 'fail' ? <AlertCircle className="w-4 h-4 text-red-400" /> : <Loader2 className="w-4 h-4 animate-spin" style={{ color: LIME }} />}
              <b>{compose.status === 'done' ? (locale === 'zh' ? '视频已就绪' : 'Video ready') : compose.status === 'fail' ? (locale === 'zh' ? '生成失败' : 'Generation failed') : (locale === 'zh' ? '生成中' : 'Generating')}</b>
              <span className="ml-auto text-xs text-white/40 truncate max-w-[45%]">{compose.note}</span>
            </div>
            {compose.status === 'run' && (
              <>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden mb-4"><div className="h-full rounded-full transition-all" style={{ width: `${Math.round(compose.frac * 100)}%`, background: `linear-gradient(90deg,#a78bfa,${LIME})` }} /></div>
                <div className="relative mx-auto aspect-[9/16] w-full max-w-[300px] rounded-2xl overflow-hidden border border-white/10 bg-black/40 grid place-items-center">
                  <div className="flex flex-col items-center gap-2 text-white/50"><Loader2 className="w-9 h-9 animate-spin" style={{ color: LIME }} /><span className="text-xs">{compose.note || (locale === 'zh' ? '生成中…' : 'Generating…')}</span></div>
                </div>
              </>
            )}
            {compose.status === 'fail' && (
              <div className="rounded-2xl border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-300 text-center">
                <div className="mb-3 leading-relaxed">{compose.note || (locale === 'zh' ? '生成失败,请重试' : 'Generation failed, please retry')}</div>
                <button onClick={genDirectVideo} disabled={busy !== null} className="inline-flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-xl transition hover:brightness-110 disabled:opacity-50" style={{ background: LIME, color: '#131517' }}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}{locale === 'zh' ? '重试' : 'Retry'}</button>
              </div>
            )}
            {compose.url && (
              <div className="flex flex-col items-center">
                <div className="relative mx-auto w-full max-w-[300px]">
                  <video controls autoPlay loop playsInline src={compose.url} className="w-full aspect-[9/16] rounded-2xl border border-white/10 bg-black object-contain shadow-[0_16px_50px_-20px_rgba(0,0,0,0.8)]" />
                </div>
                <p className="mt-2 text-[11px] text-white/35">{locale === 'zh' ? '点视频右下角开声音听口播 🔊' : 'Tap the video volume to hear the voiceover 🔊'}</p>
                <div className="mt-2 flex items-center gap-2">
                  <a href={compose.url} download="ad.mp4" className="inline-flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-xl text-white transition hover:brightness-110" style={{ background: LIME }}><Download className="w-4 h-4" />{locale === 'zh' ? '下载视频' : 'Download'}</a>
                  <button onClick={genDirectVideo} disabled={busy !== null} className="inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-xl border border-white/15 hover:border-[#7036F0] disabled:opacity-50 transition">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}{locale === 'zh' ? '再生成一个' : 'Regenerate'}</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex justify-center flex-wrap gap-2 mt-4 mb-5 px-4">
        {AD_CATEGORIES.map((c) => {
          const on = category === c.id;
          return (
            <button key={c.id} onClick={() => setCategory(c.id)}
              className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-medium transition ${on ? 'bg-white text-[#131517]' : 'bg-white/5 text-white hover:bg-white/10'}`}>
              {CAT_ICON[c.id] && <span className="text-[13px] leading-none">{CAT_ICON[c.id]}</span>}
              {locale === 'zh' ? ({ all: '全部', ugc: 'UGC', commercial: '商业广告', tiktok: 'TikTok' }[c.id] || CAT_LABEL[c.id] || c.label) : (CAT_LABEL[c.id] || c.label)}
              {c.id === 'tiktok' && <span className="ml-0.5 rounded px-1 py-0.5 text-[8px] font-bold leading-none" style={{ background: LIME, color: '#fff' }}>NEW</span>}
            </button>
          );
        })}
      </div>

      <div className="max-w-6xl mx-auto px-4 pb-20">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {visibleFormats.map((f) => (
            <button key={f.id} onClick={() => { setFormatId(f.id); setReplica(null); }}
              className={`group relative text-left rounded-2xl overflow-hidden border transition aspect-[9/16] ${formatId === f.id ? 'border-[#7036F0] ring-2 ring-[#7036F0]/40' : 'border-white/8 hover:border-white/20'}`}
              style={{ background: 'linear-gradient(160deg,#1b1d21,#141517)' }}>
              {EXAMPLE_VIDEOS[f.id] ? (
                <LazyVideo src={EXAMPLE_VIDEOS[f.id]} className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                <div className="absolute inset-0 grid place-items-center text-6xl opacity-80 transition group-hover:scale-110">{f.emoji}</div>
              )}
              {formatId === f.id && <div className="absolute top-2 left-2 text-[9px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 z-10" style={{ background: LIME, color: '#fff' }}>{locale === 'zh' ? '已选' : 'Selected'}</div>}
              <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/90 via-black/50 to-transparent">
                <div className="text-[13px] font-bold tracking-tight">{locale === 'zh' ? (f.zh ?? f.label) : f.label}</div>
                <div className="text-[10px] text-white/55 leading-tight mt-0.5 line-clamp-2">{locale === 'zh' ? (f.descZh ?? f.desc) : f.desc}</div>
                {EXAMPLE_RECIPES[f.id] && (
                  <button onClick={(e) => { e.stopPropagation(); replicateExample(f.id); }}
                    className="mt-2 w-full inline-flex items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-bold transition hover:brightness-110" style={{ background: LIME, color: '#fff' }}>
                    <Sparkles className="w-3 h-3" /> {locale === 'zh' ? '一键复刻' : 'Remix this'}
                  </button>
                )}
              </div>
              {EXAMPLE_VIDEOS[f.id] && (
                <button onClick={(e) => { e.stopPropagation(); setPreview(f.id); }}
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/50 backdrop-blur-sm grid place-items-center opacity-0 group-hover:opacity-100 transition hover:bg-black/75" title={locale === 'zh' ? '放大预览(带声音)' : 'Expand preview (with sound)'}>
                  <Play className="w-5 h-5 text-white" />
                </button>
              )}
            </button>
          ))}
        </div>
      </div>

      {preview && EXAMPLE_VIDEOS[preview] && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur grid place-items-center p-4" onClick={() => setPreview(null)}>
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <video src={EXAMPLE_VIDEOS[preview]} controls autoPlay loop playsInline
              className="max-h-[85vh] w-auto rounded-2xl border border-white/10 bg-black" style={{ aspectRatio: '9 / 16' }} />
            <button onClick={() => setPreview(null)} className="absolute -top-3 -right-3 w-9 h-9 rounded-full bg-white text-black grid place-items-center shadow-lg"><X className="w-5 h-5" /></button>
            <div className="mt-3 text-center text-sm text-white/80">{(() => { const pf = AD_FORMATS.find((f) => f.id === preview); return pf ? (locale === 'zh' ? (pf.zh ?? pf.label) : pf.label) : ''; })()} · {locale === 'zh' ? '点击空白处关闭' : 'Click outside to close'}</div>
          </div>
        </div>
      )}
    </main>
  );
}
