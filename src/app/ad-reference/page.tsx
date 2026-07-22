'use client';
import { byokHeaders, useByokActive } from '@/lib/byok';
import { pollGen } from '@/lib/poll-client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSession, signIn } from 'next-auth/react';
import { useI18n } from '@/i18n/provider';
import { useMounted } from '@/lib/use-mounted';
import { videoCredits } from '@/lib/video-pricing';

// 爆款广告复刻(Ad Reference):粘贴一条爆款广告 → 换成你的产品/出镜人/声音,同 hook 同能量。
// 无登录直连(同 marketing-studio):upload → edit(gemini-omni video-edit)→ 可选 voice+lipsync → R2 成片。
// bg #131416 · 面板 #1c1e21 · accent #7036F0 · Space Grotesk

const GROTESK = 'var(--font-grotesk), "Space Grotesk", system-ui, sans-serif';
const VOICES = [
  { id: 'hpp4J3VqNfWAUOO0d1Us', label: 'Female · Bright' },
  { id: 'EXAVITQu4vr4xnSDxMaL', label: 'Female · Warm' },
  { id: 'CwhRBWXzGAHq8TQ4Fs17', label: 'Male · Relaxed' },
];
// voice(TTS 配音)走固定 COST;edit/motion(视频)与 lipsync(对口型)走动态 videoCredits。
const AD_COSTS = { edit: 15, character: 15, voice: 10, lipsync: 2 };
// 视频类模型(与后端 lib/ad-reference.ts 一致):edit/character = omni video-edit,lipsync = veed。
const EDIT_VIDEO_MODEL = 'google/gemini-omni-flash/video-edit';
const LIPSYNC_MODEL = 'veed/lipsync';
// 台词字数估音频秒数:中文按 字数/5 秒、英文按 词数/2.5 秒;空则保守 12s(与后端 lipsync route 默认一致)。
function estimateAudioSeconds(text: string): number {
  const t = (text || '').trim();
  if (!t) return 12;
  const cjk = (t.match(/[一-鿿぀-ヿ가-힯]/g) || []).length; // 中/日/韩字符
  if (cjk >= t.length / 2) return Math.max(3, Math.ceil(cjk / 5));
  const words = t.split(/\s+/).filter(Boolean).length;
  return Math.max(3, Math.ceil(words / 2.5));
}

async function postJson(url: string, body: unknown) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...byokHeaders() }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ? `${j.error}${j.detail ? ': ' + String(j.detail).slice(0, 160) : ''}` : `HTTP ${r.status}`);
  return j;
}
function adErrText(msg: string, locale: string) {
  if (msg === 'insufficient_credits' || msg.startsWith('insufficient_credits')) {
    return locale === 'zh' ? '积分不足,请前往定价页充值。' : 'Not enough credits. Please top up on the pricing page.';
  }
  if (msg === 'media_url_not_public' || msg.startsWith('media_url_not_public')) {
    return locale === 'zh'
      ? '当前上传后的媒体地址不是公网地址,Atlas 无法抓取。请在已部署的线上域名测试,或配置 PUBLIC_MEDIA_BASE_URL / NEXTAUTH_URL 为公网地址后重试。'
      : 'The uploaded media URL is not public, so Atlas cannot fetch it. Use the deployed public domain or configure PUBLIC_MEDIA_BASE_URL / NEXTAUTH_URL.';
  }
  return msg;
}

// pollGen 已抽到 @/lib/poll-client(健壮版:串行轮询 + 退避 + 高瞬时容忍),marketing/drama/ad-reference 共用。

async function uploadFile(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  const r = await fetch('/api/ad-reference/upload', { method: 'POST', headers: byokHeaders(), body: form });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.url) throw new Error(j.error === 'file_too_large' ? 'File too large' : `Upload failed ${j.detail || j.error || r.status}`);
  return j.url as string;
}

function readVideoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => { URL.revokeObjectURL(v.src); resolve(v.duration || 0); };
    v.onerror = () => { URL.revokeObjectURL(v.src); resolve(0); };
    v.src = URL.createObjectURL(file);
  });
}

type Slot = { url: string; preview: string } | null;
type Step = 'idle' | 'edit' | 'character' | 'voice' | 'lipsync' | 'done';

// 参考广告示例视频(用户可一键选用、免上传);素材在 R2 marketing-studio-media
const EXAMPLE_REF_VIDEOS = [
  '/api/marketing-studio/media/adref-example-1.mp4',
  '/api/marketing-studio/media/adref-example-2.mp4',
];
const AD_REF_SESSION_KEY = 'adref-session-v1';

export default function AdReferencePage() {
  const { locale } = useI18n();
  const byokActive = useByokActive();
  const { status } = useSession();
  const mounted = useMounted();
  const [refVideo, setRefVideo] = useState<Slot>(null);
  const [refVideoSeconds, setRefVideoSeconds] = useState(0); // 参考视频时长(秒),上传时读出;示例视频未知则 0(计费/预估回退 30s)
  const [product, setProduct] = useState<Slot>(null);
  const [avatar, setAvatar] = useState<Slot>(null);
  const [productNote, setProductNote] = useState('');
  const [extraNote, setExtraNote] = useState('');
  const [newVoice, setNewVoice] = useState(false);
  const [script, setScript] = useState('');
  const [voiceId, setVoiceId] = useState(VOICES[0].id);
  const [busy, setBusy] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('idle');
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const [credits, setCredits] = useState<number | null>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const productInput = useRef<HTMLInputElement>(null);
  const avatarInput = useRef<HTMLInputElement>(null);

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

  // ── 输入持久化:填的内容实时存,登录 OAuth 跳转/刷新回来都不丢(视频/图只存 url,blob preview 重载即失效) ──
  useEffect(() => {
    if (!mounted) return;
    try {
      const raw = localStorage.getItem(AD_REF_SESSION_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (Date.now() - (s.ts || 0) > 24 * 3600_000) return;
      if (s.refVideoUrl) setRefVideo({ url: s.refVideoUrl, preview: s.refVideoUrl });
      if (Number(s.refVideoSeconds) > 0) setRefVideoSeconds(Number(s.refVideoSeconds));
      if (s.productUrl) setProduct({ url: s.productUrl, preview: s.productUrl });
      if (s.avatarUrl) setAvatar({ url: s.avatarUrl, preview: s.avatarUrl });
      if (typeof s.productNote === 'string') setProductNote(s.productNote);
      if (typeof s.extraNote === 'string') setExtraNote(s.extraNote);
      if (typeof s.newVoice === 'boolean') setNewVoice(s.newVoice);
      if (typeof s.script === 'string') setScript(s.script);
      if (typeof s.voiceId === 'string' && s.voiceId) setVoiceId(s.voiceId);
    } catch { /* ignore broken session */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem(AD_REF_SESSION_KEY, JSON.stringify({
        refVideoUrl: refVideo?.url || '', refVideoSeconds, productUrl: product?.url || '', avatarUrl: avatar?.url || '',
        productNote, extraNote, newVoice, script, voiceId, ts: Date.now(),
      }));
    } catch { /* storage full etc. */ }
  }, [mounted, refVideo, refVideoSeconds, product, avatar, productNote, extraNote, newVoice, script, voiceId]);

  async function onPick(kind: 'video' | 'product' | 'avatar', file: File | undefined) {
    if (!file) return;
    setError('');
    try {
      if (kind === 'video') {
        if (file.size > 60_000_000) throw new Error(locale === 'zh' ? '视频必须小于 60MB' : 'Video must be under 60MB');
        const dur = await readVideoDuration(file);
        if (dur > 31) throw new Error(locale === 'zh' ? `参考视频必须 ≤30 秒(当前 ${Math.round(dur)} 秒)` : `Reference video must be ≤30s (currently ${Math.round(dur)}s)`);
        setBusy(locale === 'zh' ? '正在上传参考视频…' : 'Uploading reference video…');
        const url = await uploadFile(file);
        setRefVideo({ url, preview: URL.createObjectURL(file) });
        setRefVideoSeconds(dur || 0); // 记参考视频时长,edit/character/motion 计费按它算
      } else {
        if (file.size > 10_000_000) throw new Error(locale === 'zh' ? '图片必须小于 10MB' : 'Image must be under 10MB');
        setBusy(kind === 'product' ? (locale === 'zh' ? '正在上传产品图…' : 'Uploading product image…') : (locale === 'zh' ? '正在上传出镜人照片…' : 'Uploading talent photo…'));
        const url = await uploadFile(file);
        const slot = { url, preview: URL.createObjectURL(file) };
        if (kind === 'product') setProduct(slot); else setAvatar(slot);
      }
    } catch (e) {
      setError(String((e as Error).message || e));
    } finally {
      setBusy(null);
    }
  }

  const isGenerating = step === 'edit' || step === 'character' || step === 'voice' || step === 'lipsync';
  // 纯 omni:换人+换产品合并为一次 edit,不再单独计 character。
  // 视频步骤(edit)按参考视频秒数动态计费,lipsync 按台词字数估的音频秒数;voice(TTS)走固定 COST。
  const editEst = (product || avatar) ? videoCredits(EDIT_VIDEO_MODEL, undefined, refVideoSeconds || 30) : 0;
  const lipsyncEst = videoCredits(LIPSYNC_MODEL, undefined, estimateAudioSeconds(script));
  const adEst = editEst + (newVoice ? AD_COSTS.voice + lipsyncEst : 0);
  const hasEnoughCredits = byokActive || status !== 'authenticated' || credits === null || credits >= adEst;
  // 勾了换声音也不强制填脚本:没填就自动生成台词(见 generate ③)
  const canGenerate = !!refVideo && (!!product || !!avatar) && !busy && !isGenerating && hasEnoughCredits;

  // 提交 + 轮询;生成异步失败(如 omni 换人偶发 1010002)自动重试,参数/积分类错误不重试。
  async function submitAndPoll(url: string, body: unknown, pollTimeout = 480_000, retries = 2): Promise<string> {
    let last: unknown;
    for (let i = 0; i <= retries; i++) {
      try {
        const r = await postJson(url, body);
        return await pollGen(r.getUrl, { timeoutMs: pollTimeout });
      } catch (e) {
        last = e;
        const m = String((e as Error)?.message || e);
        if (/insufficient_credits|media_url_not_public|unauthorized|invalid_/.test(m)) throw e;
        if (i < retries) { setBusy(locale === 'zh' ? `生成失败,自动重试中…(第 ${i + 1}/${retries} 次)` : `Generation failed, retrying… (${i + 1}/${retries})`); await new Promise((r2) => setTimeout(r2, 2000)); }
      }
    }
    throw last;
  }

  async function generate() {
    if (status !== 'authenticated') { signIn('google'); return; }
    if (!refVideo) return;
    setError(''); setResult('');
    let cid = ''; // 作品占位 id,完成/失败时更新它
    try {
      const currentCredits = await refreshCredits();
      if (!byokActive && currentCredits !== null && currentCredits < adEst) {
        setError(locale === 'zh' ? `积分不足:本次预计需要 ${adEst} 积分,当前只有 ${currentCredits}。` : `Not enough credits: this run needs ${adEst}, you have ${currentCredits}.`);
        return;
      }
      // 作品页立刻出现"生成中"这条作品
      try {
        const st = await postJson('/api/creations/start', { type: 'ad-reference', title: productNote.trim() || extraNote.trim() || '爆款广告复刻' });
        cid = st.id;
      } catch { /* 占位失败不阻断生成 */ }
      let final = refVideo.url;

      // ①② 纯 omni:一次 video-edit 同时换出镜人+产品(编辑原片、保运镜/原声),异步失败自动重试。
      // omni 换真人会稳定撞 1010002(deepfake);重试满 3 次仍失败 → 兜底 kling 动作迁移换人 + omni 加产品。
      if (avatar || product) {
        setStep('edit');
        try {
          final = await submitAndPoll('/api/ad-reference/edit', {
            videoUrl: final,
            avatarUrl: avatar?.url || '',
            productUrl: product?.url || '',
            productNote,
            extraNote,
            videoSeconds: refVideoSeconds,
          }, 600_000, 3);
        } catch (omniErr) {
          // 只换产品(无出镜人)没有兜底路径,直接抛错
          if (!avatar) throw omniErr;
          // 兜底:kling 动作迁移——出镜人图 + 原参考视频(动作源)→ 你的人做原片动作(不撞 1010002)
          setStep('character');
          let swapped = await submitAndPoll('/api/ad-reference/motion', {
            videoUrl: refVideo?.url || '',
            avatarUrl: avatar?.url || '',
            videoSeconds: refVideoSeconds,
          }, 600_000, 1);
          // 有产品则在换人结果上再用 omni 加产品(换产品不拦)
          if (product) {
            setStep('edit');
            swapped = await submitAndPoll('/api/ad-reference/edit', {
              videoUrl: swapped,
              productUrl: product?.url || '',
              productNote,
              extraNote,
              videoSeconds: refVideoSeconds,
            }, 600_000, 2);
          }
          final = swapped;
        }
      }

      // ③ 可选:新配音 + 对口型。勾了换声音但没填脚本 → 自动用 LLM 按产品(图)/参考生成一段台词,不强制用户输入。
      if (newVoice) {
        let text = script.trim();
        if (text.length < 4) {
          setStep('voice');
          try {
            const gs = await postJson('/api/ad-reference/gen-script', { productNote, extraNote, productUrl: product?.url || '', avatarUrl: avatar?.url || '' });
            text = (gs.script || '').trim();
            if (text) setScript(text); // 回填文本框:用户能看到并二次编辑自动生成的台词
          } catch { /* 生成台词失败则跳过配音,不阻断整体出片 */ }
        }
        if (text.length >= 4) {
          setStep('voice');
          const audioUrl = await submitAndPoll('/api/ad-reference/voice', { text, voice: voiceId }, 180_000, 2);
          setStep('lipsync');
          final = await submitAndPoll('/api/ad-reference/lipsync', { videoUrl: final, audioUrl, audioSeconds: estimateAudioSeconds(text) }, 480_000, 2);
        }
      }
      try {
        await postJson('/api/ad-reference/save', {
          outputUrl: final,
          title: productNote.trim() || extraNote.trim() || (locale === 'zh' ? '爆款广告复刻' : 'Ad reference remake'),
          thumbnail: product?.url || avatar?.url || '',
          creationId: cid,
        });
      } catch { /* ignore history save failure */ }
      setResult(final);
      setStep('done');
    } catch (e) {
      setError(adErrText(String((e as Error).message || e), locale));
      setStep('idle');
      // 作品页把这条占位标记为"失败"
      if (cid) postJson(`/api/creations/${cid}`, { status: 'failed', error: String((e as Error).message || e) }).catch(() => {});
    } finally {
      window.dispatchEvent(new Event('atlas:credits'));
    }
  }

  const stepLabel: Record<Step, string> = {
    idle: '', done: '',
    character: locale === 'zh' ? '换脸方式切换中:用动作迁移让你的人物做原片动作…约需 2–4 分钟' : 'Switching method: animating your talent with the reference motion… about 2–4 min',
    edit: locale === 'zh' ? '正在替换出镜人与产品(保留原片运镜/节奏)…约需 1–4 分钟' : 'Swapping presenter & product (keeping original motion/pacing)… about 1–4 min',
    voice: locale === 'zh' ? '③ 正在生成新配音…' : '③ Generating new voiceover…',
    lipsync: locale === 'zh' ? '④ 正在为新配音对口型…' : '④ Lip-syncing the new voiceover…',
  };

  // 顶层 hydration gate:首帧统一空骨架,避免 session/locale 造成 SSR≠client 分歧(#418)。
  if (!mounted) return <div className="min-h-screen" style={{ background: '#131416' }} />;
  return (
    <div className="min-h-screen" style={{ background: '#131416' }}>
      <div className="mx-auto max-w-[1200px] px-5 py-8">
        <Link href="/" className="text-white/40 text-sm hover:text-white/70">← Marketing Studio</Link>
        <div className="mt-6 mb-2 text-[11px] uppercase tracking-[0.24em] text-white/50 font-medium" style={{ fontFamily: GROTESK }}>Reference to Ad</div>
        <h1 className="font-bold uppercase leading-[1.1] tracking-[-0.03em] text-[clamp(30px,4.4vw,46px)] text-white/90" style={{ fontFamily: GROTESK }}>
          {locale === 'zh' ? '复刻任意爆款广告' : 'Remake Any Viral Ad'}
        </h1>
        <p className="mt-3 max-w-xl text-white/50 text-[15px]">
          {locale === 'zh'
            ? '粘贴一条爆款广告,把它变成你自己的——同样的 hook、同样的节奏能量,卖你的产品。我们直接编辑原视频:场景、运镜、节奏全部保留,只替换出镜人、产品和声音。'
            : 'Paste a viral ad and make it yours — same hook, same energy, selling your product. We edit the original video directly: scene, camera work, and pacing all stay, we only swap the talent, product, and voice.'}
        </p>

        <div className="mt-8 grid gap-6 lg:grid-cols-[420px_1fr]">
          {/* 左:输入面板 */}
          <div className="rounded-2xl p-5" style={{ background: '#1c1e21' }}>
            <div className="text-white/60 text-xs uppercase tracking-wider mb-2" style={{ fontFamily: GROTESK }}>{locale === 'zh' ? '参考广告视频' : 'Reference Ad Video'}</div>
            {refVideo ? (
              <div className="relative w-full rounded-xl border border-white/15 bg-white/[0.03] p-2">
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <video src={refVideo.preview} className="w-full max-h-52 rounded-lg bg-black object-contain" muted loop autoPlay playsInline />
                <div className="mt-2 flex items-center gap-2">
                  <button onClick={() => videoInput.current?.click()}
                    className="flex-1 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/70 hover:border-white/30 transition">
                    {locale === 'zh' ? '换一个视频' : 'Replace video'}
                  </button>
                  <button onClick={() => setRefVideo(null)} title={locale === 'zh' ? '移除' : 'Remove'}
                    className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/70 hover:border-red-400/60 hover:text-red-300 transition">
                    ✕ {locale === 'zh' ? '移除' : 'Remove'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => videoInput.current?.click()}
                className="w-full rounded-xl border border-dashed border-white/15 bg-white/[0.03] px-4 py-5 text-left hover:border-white/30 transition"
              >
                <div>
                  <div className="text-white/90 text-sm font-medium">{locale === 'zh' ? '上传参考广告视频' : 'Upload reference ad video'}</div>
                  <div className="text-white/40 text-xs mt-1">mp4/mov · ≤30s · ≤60MB</div>
                </div>
              </button>
            )}
            <input ref={videoInput} type="file" accept="video/mp4,video/quicktime,video/webm" className="hidden"
              onChange={(e) => { onPick('video', e.target.files?.[0]); e.target.value = ''; }} />

            <div className="mt-4 grid grid-cols-2 gap-3">
              {([['product', product, productInput, 'PRODUCT', 'Your product photo'], ['avatar', avatar, avatarInput, 'AVATAR', 'New talent photo']] as const).map(([kind, slot, ref, label, hint]) => (
                <div key={kind}>
                  <div className="text-white/60 text-xs uppercase tracking-wider mb-2" style={{ fontFamily: GROTESK }}>{locale === 'zh' ? (kind === 'product' ? '产品' : '出镜人') : label}</div>
                  <button onClick={() => ref.current?.click()}
                    className="w-full aspect-square rounded-xl border border-dashed border-white/15 bg-white/[0.03] hover:border-white/30 transition overflow-hidden flex items-center justify-center">
                    {slot ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={slot.preview} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-white/40 text-xs px-3 text-center">+ {locale === 'zh' ? (kind === 'product' ? '你的产品图' : '新出镜人照片') : hint}<br /><span className="text-white/25">{locale === 'zh' ? '(可选,至少一项)' : '(optional, at least one)'}</span></span>
                    )}
                  </button>
                  <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                    onChange={(e) => onPick(kind, e.target.files?.[0])} />
                </div>
              ))}
            </div>

            <input value={productNote} onChange={(e) => setProductNote(e.target.value)} placeholder={locale === 'zh' ? '产品细节(可选,例如:薄荷绿拍立得相机)' : 'Product details (optional, e.g. mint-green instant camera)'}
              className="mt-4 w-full rounded-lg bg-white/[0.05] border border-white/10 px-3 py-2 text-sm text-white/90 placeholder:text-white/25 outline-none focus:border-white/25" />
            <input value={extraNote} onChange={(e) => setExtraNote(e.target.value)} placeholder={locale === 'zh' ? '补充说明(可选)' : 'Extra instructions (optional)'}
              className="mt-2 w-full rounded-lg bg-white/[0.05] border border-white/10 px-3 py-2 text-sm text-white/90 placeholder:text-white/25 outline-none focus:border-white/25" />

            {/* 声音 */}
            <div className="mt-5 rounded-xl bg-white/[0.03] border border-white/10 p-3">
              <label className="flex items-center gap-2 text-sm text-white/80 cursor-pointer">
                <input type="checkbox" checked={newVoice} onChange={(e) => setNewVoice(e.target.checked)} className="accent-[#7036F0]" />
                {locale === 'zh' ? '替换配音与台词(不勾选则保留编辑后的原声)' : 'Replace voice & script (leave unchecked to keep the edited original audio)'}
              </label>
              {newVoice && (
                <div className="mt-3 space-y-2">
                  <textarea value={script} onChange={(e) => setScript(e.target.value)} rows={3} maxLength={600}
                    placeholder={locale === 'zh' ? '新台词(推销你的产品)' : 'New script (pitch your product)'}
                    className="w-full rounded-lg bg-white/[0.05] border border-white/10 px-3 py-2 text-sm text-white/90 placeholder:text-white/25 outline-none focus:border-white/25 resize-none" />
                  <select value={voiceId} onChange={(e) => setVoiceId(e.target.value)}
                    className="w-full rounded-lg bg-[#26282c] border border-white/10 px-3 py-2 text-sm text-white/90 outline-none">
                    {VOICES.map((v) => <option key={v.id} value={v.id}>{locale === 'zh' ? ({ 'hpp4J3VqNfWAUOO0d1Us': '女声 · 明亮', 'EXAVITQu4vr4xnSDxMaL': '女声 · 温暖', 'CwhRBWXzGAHq8TQ4Fs17': '男声 · 放松' }[v.id] ?? v.label) : v.label}</option>)}
                  </select>
                </div>
              )}
            </div>

            <button disabled={!canGenerate} onClick={generate}
              className="mt-5 w-full rounded-xl py-3.5 font-bold uppercase tracking-wide text-[#131416] disabled:opacity-40 transition"
              style={{ fontFamily: GROTESK, background: 'linear-gradient(135deg,#ffd83d,#ff9550)' }}>
              {isGenerating
                ? (locale === 'zh' ? '生成中…' : 'Generating…')
                : byokActive
                  ? (locale === 'zh' ? '生成' : 'GENERATE')
                  : !hasEnoughCredits
                    ? `${locale === 'zh' ? '积分不足' : 'Not enough credits'} · ✦${adEst}`
                    : `${locale === 'zh' ? '生成' : 'GENERATE'} · ✦${adEst}`}
            </button>
            {byokActive ? (
              <div className="mt-2 text-center text-[11px] text-white/35">
                {locale === 'zh' ? '用自己的 Key · 不扣积分' : 'Your own key · no credits charged'}
              </div>
            ) : status === 'authenticated' && (
              <div className="mt-2 text-center text-[11px] text-white/35">
                {locale === 'zh'
                  ? `本次预计消耗 ${adEst} 积分${credits === null ? '' : `,当前余额 ${credits}。`}`
                  : `Estimated cost ${adEst} credits${credits === null ? '' : `, current balance ${credits}.`}`}
              </div>
            )}
            <div className="mt-2 text-center text-[11px] text-white/30">{locale === 'zh' ? '上传即表示你确认拥有使用该参考视频及肖像的权利' : 'By uploading, you confirm you have the rights to use this reference video and likeness'}</div>

            {/* 示例参考广告:放在表单最下面,没素材时一键试用 */}
            {!refVideo && (
              <div className="mt-5 border-t border-white/[0.07] pt-4">
                <div className="text-white/40 text-[11px] mb-2">{locale === 'zh' ? '没有素材?点示例广告一键试用 👇' : 'No footage? Try an example ad 👇'}</div>
                <div className="grid grid-cols-2 gap-2">
                  {EXAMPLE_REF_VIDEOS.map((u) => (
                    <button key={u} type="button" onClick={() => setRefVideo({ url: u, preview: u })}
                      className="rounded-lg overflow-hidden border border-white/10 hover:border-[#7036F0] transition aspect-[9/16] bg-black">
                      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                      <video src={u} className="w-full h-full object-cover" muted loop autoPlay playsInline />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 右:结果区 */}
          <div className="rounded-2xl p-5 min-h-[420px]" style={{ background: 'linear-gradient(160deg,#1b1d21,#141517)' }}>
            {busy && <div className="text-white/60 text-sm">{busy}</div>}
            {error && <div className="mb-3 rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-sm text-red-300">{error}</div>}
            {isGenerating && (
              <div className="flex h-full min-h-[380px] flex-col items-center justify-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
                <div className="text-white/60 text-sm">{stepLabel[step]}</div>
              </div>
            )}
            {step === 'done' && result && (
              <div>
                <div className="text-white/60 text-xs uppercase tracking-wider mb-3" style={{ fontFamily: GROTESK }}>{locale === 'zh' ? '前 / 后对比' : 'Before / After'}</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <video src={refVideo?.preview} controls playsInline className="w-full rounded-xl bg-black" />
                    <div className="mt-1 text-center text-xs text-white/40">{locale === 'zh' ? '原始参考' : 'Original reference'}</div>
                  </div>
                  <div>
                    <video src={result} controls playsInline className="w-full rounded-xl bg-black" />
                    <div className="mt-1 text-center text-xs text-white/40">{locale === 'zh' ? '你的广告' : 'Your ad'}</div>
                  </div>
                </div>
                <a href={result} download className="mt-4 inline-block rounded-lg bg-white/10 px-4 py-2 text-sm text-white/80 hover:bg-white/15">{locale === 'zh' ? '下载视频' : 'Download video'}</a>
              </div>
            )}
            {step === 'idle' && !busy && !error && (
              <div className="flex h-full min-h-[380px] flex-col items-center justify-center text-white/30 text-sm">
                <div className="text-4xl mb-3">🎬</div>
                {locale === 'zh' ? '上传一条参考广告 + 产品/出镜人,你的复刻成片将显示在这里' : 'Upload a reference ad + product/talent, and your remake appears here'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
