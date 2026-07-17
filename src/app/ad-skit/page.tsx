'use client';
import { byokHeaders, useByokActive } from '@/lib/byok';

import { useState } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { AlertCircle, Clapperboard, Download, ImageIcon, Loader2, Sparkles, UploadCloud, Video, Wand2 } from 'lucide-react';
import { mediaDownloadUrl } from '@/lib/media-url';
import { videoCredits } from '@/lib/video-pricing';
import { useI18n } from '@/i18n/provider';

const COSTS = { plan: 4, image: 2, video: 25 };
// 视频步骤动态计费(seedance ref-to-video 固定 720p/15s),与后端 ad-skit/video route 一致;plan/image 仍走固定 COST。
const VIDEO_COST = videoCredits('bytedance/seedance-2.0/reference-to-video', '720p', 15);
// 语言选择已移除:剧本语种自动跟随产品输入的语言(见 lib/ad-skit.ts planSkit)
const STYLES = [
  { key: 'funny', label: 'Funny meme' }, { key: 'reversal', label: 'Wild plot twist' }, { key: 'skit', label: 'Sitcom skit' },
  { key: 'warm', label: 'Heartwarming' }, { key: 'luxury', label: 'Luxe & premium' }, { key: 'urgent', label: 'Urgent hard sell' },
];
const STYLE_LABELS_ZH: Record<string, string> = {
  funny: '搞笑梗图', reversal: '神反转', skit: '情景喜剧',
  warm: '温情走心', luxury: '高奢质感', urgent: '紧迫硬广',
};
const PLAN_MODELS = [
  { key: 'deepseek-ai/deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
  { key: 'zai-org/glm-5.2', label: 'GLM-5.2' },
];
const SAMPLES = [
  { title: 'Insulated Tumbler', video: '/samples/ad-skit-demo-en.mp4' },
];

type Slot = { status: 'idle' | 'processing' | 'done' | 'failed'; url?: string };
type Plan = { idea: string; productImagePrompt: string; videoPrompt: string; caption: string };

async function imageToDataUrl(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const el = new Image(); el.onload = () => res(el); el.onerror = rej; el.src = objectUrl; });
    const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale)); canvas.height = Math.max(1, Math.round(img.height * scale));
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally { URL.revokeObjectURL(objectUrl); }
}
async function postJson(url: string, body: unknown) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...byokHeaders() }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ? `${j.error}${j.detail ? ': ' + String(j.detail).slice(0, 160) : ''}` : `HTTP ${r.status}`);
  return j;
}
function pollCreation(id: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let n = 0;
    const t = setInterval(async () => {
      n += 1;
      if (n > 240) { clearInterval(t); reject(new Error('timeout')); return; }
      try {
        const c = await (await fetch(`/api/creations/${id}`, { headers: byokHeaders() })).json();
        if (c.status === 'completed') { clearInterval(t); resolve((Array.isArray(c.outputs) ? c.outputs : [])[0] || ''); }
        else if (c.status === 'failed') { clearInterval(t); reject(new Error('failed')); }
      } catch { /* keep polling */ }
    }, 3000);
  });
}
function errText(code: string, locale: string) {
  if (code === 'insufficient_credits') return locale === 'zh' ? '积分不足，请前往定价页充值。' : 'Not enough credits. Please top up on the pricing page.';
  if (code === 'product_required') return locale === 'zh' ? '请先填写产品信息。' : 'Please enter a product first.';
  if (code.startsWith('plan_failed')) {
    if (/401|402|403|429|unauthorized|quota|invalid_api_key/i.test(code)) return locale === 'zh' ? '你的 Atlas Key 无效或额度不足，请检查 Key 后重试。' : 'Your Atlas key is invalid or out of quota — please check it and retry.';
    return locale === 'zh' ? '脚本生成失败，请重试或换种方式描述你的产品。' : 'Script generation failed. Please try again or reword your description.';
  }
  if (/401|402|403|429|unauthorized|quota|invalid_api_key/i.test(code)) return locale === 'zh' ? '你的 Atlas Key 无效或额度不足，请检查 Key 后重试。' : 'Your Atlas key is invalid or out of quota — please check it and retry.';
  if (code.startsWith('submit_failed') || code.startsWith('upload_failed')) return locale === 'zh' ? '生成失败，请重试。' : 'Generation failed. Please retry.';
  if (code === 'no_product_image') return locale === 'zh' ? '产品图生成失败，请重试或上传一张产品图。' : 'Product image failed. Retry or upload a product photo.';
  if (code === 'timeout' || code === 'failed') return locale === 'zh' ? '视频生成失败或超时，请重试。' : 'Video generation failed or timed out. Please retry.';
  return locale === 'zh' ? `出错了：${code}` : `Something went wrong: ${code}`;
}

export default function AdSkitPage() {
  const { data: session } = useSession();
  const { locale } = useI18n();
  const byokActive = useByokActive();
  const [product, setProduct] = useState('');
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  // 语言选择已移除:自动跟随产品输入的语种
  const [style, setStyle] = useState('funny');
  const [llm, setLlm] = useState(PLAN_MODELS[0].key);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [productImg, setProductImg] = useState<Slot>({ status: 'idle' });
  const [video, setVideo] = useState<Slot>({ status: 'idle' });

  async function genPlan() {
    if (!session) return signIn('google');
    if (product.trim().length < 2) return setErr(locale === 'zh' ? '请先填写产品信息（名称 / 卖点，一行就够）。' : 'Please enter a product first (name / selling point, one line is enough).');
    setErr(null); setBusy('plan'); setPlan(null); setProductImg({ status: 'idle' }); setVideo({ status: 'idle' });
    try {
      const j = await postJson('/api/ad-skit/plan', { product, styleKey: style, llmModel: llm });
      setPlan(j.plan);
      window.dispatchEvent(new Event('atlas:credits'));
    } catch (e) { setErr(errText(e instanceof Error ? e.message : 'failed', locale)); }
    setBusy(null);
  }

  async function genVideo() {
    if (!plan) return;
    setErr(null); setBusy('video');
    try {
      let productUrls: string[] = [];
      setProductImg({ status: 'processing' });
      if (uploadedImages.length) {
        const r = await postJson('/api/ad-skit/image', { uploadedImages });
        productUrls = (r.productUrls || []).filter(Boolean);
      } else {
        const ij = await postJson('/api/ad-skit/image', { imagePrompt: plan.productImagePrompt });
        const u = await pollCreation(ij.id);
        if (u) productUrls = [u];
      }
      if (!productUrls.length) throw new Error('no_product_image');
      setProductImg({ status: 'done', url: productUrls[0] });
      setVideo({ status: 'processing' });
      const vj = await postJson('/api/ad-skit/video', { productUrls, videoPrompt: plan.videoPrompt, duration: 15, title: plan.idea });
      const vidUrl = await pollCreation(vj.id);
      setVideo({ status: 'done', url: vidUrl });
      window.dispatchEvent(new Event('atlas:credits'));
    } catch (e) {
      setProductImg((s) => (s.status === 'processing' ? { status: 'failed' } : s));
      setVideo({ status: 'failed' });
      setErr(errText(e instanceof Error ? e.message : 'failed', locale));
    }
    setBusy(null);
  }

  const dl = mediaDownloadUrl;

  return (
    <div className="min-h-screen bg-[#131416] text-white" style={{ colorScheme: 'dark' }}>
      <div className="px-6 sm:px-8 py-5">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3">
          <a href="/" className="text-sm text-white/60 hover:text-white transition">{locale === 'zh' ? '← 全部应用' : '← All apps'}</a>
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl space-y-8 px-6 pb-16 sm:px-8">
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#7036F0]/15 text-[#7036F0]"><Clapperboard className="h-6 w-6" /></span>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-white">{locale === 'zh' ? '搞笑带货小剧场' : 'Ad Skit'}</h1>
            <span className="rounded-full bg-amber-400/15 px-2 py-1 text-xs font-semibold text-amber-300">{locale === 'zh' ? '⭐ 精选' : '⭐ Featured'}</span>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-white/60">
            {locale === 'zh' ? <>丢进一个产品 → 开源大模型化身创意导演，写出一段<b>双人搞笑小剧场</b>（3 秒钩子 + 反转笑点）→ seedance-2.0 用你的产品照渲染出 15 秒带声广告。多语言、多风格。</> : <>Drop in a product → an open-source LLM plays creative director and writes a <b>two-hander comedy skit</b> (3-second hook + twist punchline) → seedance-2.0 uses your product photo to render a 15s ad with sound. Multi-language, multi-style.</>}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
        {/* 左:输入 */}
        <section className="space-y-5">
          <div className="rounded-2xl border border-white/10 bg-[#1c1e21] p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#7036F0] text-xs text-white">1</span>{locale === 'zh' ? '产品 + 设置' : 'Product + settings'}
            </h2>
            <textarea value={product} onChange={(e) => setProduct(e.target.value)} rows={3}
              placeholder={locale === 'zh' ? '产品名 + 卖点，一行就够。例如：康师傅红烧牛肉面 / 便携榨汁杯，USB 充电几秒打出果昔' : 'Product name + selling point, one line is enough. E.g. Master Kong beef noodles / portable blender bottle, USB-charged smoothies in seconds'}
              className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-[#7036F0] focus:ring-2 focus:ring-[#7036F0]/30" />
            <div className="mt-3">
              <div className="flex flex-wrap items-center gap-2">
                {uploadedImages.map((u, i) => (
                  <div key={i} className="relative h-14 w-14 overflow-hidden rounded-lg border border-white/10">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={u} alt={locale === 'zh' ? '产品照片' : 'product photo'} className="h-full w-full object-cover" />
                    <button type="button" onClick={() => setUploadedImages((a) => a.filter((_, j) => j !== i))} className="absolute right-0 top-0 flex h-4 w-4 items-center justify-center bg-black/60 text-[10px] leading-none text-white">×</button>
                  </div>
                ))}
                {uploadedImages.length < 4 && (
                  <label className="flex h-14 w-14 shrink-0 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-white/15 bg-white/[0.04] hover:border-[#7036F0]/60">
                    <input type="file" accept="image/*" multiple className="hidden" onChange={async (e) => {
                      const files = Array.from(e.target.files || []);
                      const urls = await Promise.all(files.map(imageToDataUrl));
                      setUploadedImages((a) => [...a, ...urls].slice(0, 4));
                    }} />
                    <UploadCloud className="h-5 w-5 text-white/40" />
                  </label>
                )}
              </div>
              <span className="mt-1 block text-xs text-white/50">{locale === 'zh' ? '可选：上传 1-4 张真实产品照（多角度 / 多款式，原样保留你的产品，全部作为 seedance 参考图）。不传则按描述生成。' : 'Optional: upload 1-4 real product photos (multiple angles / variants — keeps your product exactly as-is, all used as seedance references). Skip it to generate from your description.'}</span>
            </div>
            <label className="mt-3 block"><span className="mb-1 block text-xs font-medium text-white/60">{locale === 'zh' ? '风格' : 'Style'}</span>
              <select value={style} onChange={(e) => setStyle(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-[#7036F0]">
                {STYLES.map((s) => <option key={s.key} value={s.key}>{locale === 'zh' ? STYLE_LABELS_ZH[s.key] : s.label}</option>)}
              </select>
            </label>
            <label className="mt-3 block"><span className="mb-1 block text-xs font-medium text-white/60">{locale === 'zh' ? '创意大模型' : 'Creative LLM'}</span>
              <select value={llm} onChange={(e) => setLlm(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-[#7036F0]">
                {PLAN_MODELS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
            </label>
            <button onClick={genPlan} disabled={busy !== null} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#7036F0] px-5 py-3 font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
              {busy === 'plan' ? <><Loader2 className="h-4 w-4 animate-spin" /> {locale === 'zh' ? '导演正在头脑风暴…' : 'Director brainstorming…'}</> : <><Wand2 className="h-4 w-4" /> {byokActive ? (locale === 'zh' ? '生成脚本' : 'Generate script') : (locale === 'zh' ? `生成脚本 · ${COSTS.plan} 积分` : `Generate script · ${COSTS.plan} credits`)}</>}
            </button>
            {err && <p className="mt-3 flex items-center gap-1.5 text-sm text-red-400"><AlertCircle className="h-4 w-4 shrink-0" /> {err}</p>}
          </div>

          {plan && (
            <div className="space-y-3 rounded-2xl border border-white/10 bg-[#1c1e21] p-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-white"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#7036F0] text-xs text-white">2</span>{locale === 'zh' ? '脚本确认' : 'Script review'}</h2>
              <div className="rounded-lg bg-white/[0.04] p-3 text-sm leading-6 text-white/80"><b>{locale === 'zh' ? '创意：' : 'Idea: '}</b>{plan.idea}</div>
              {plan.caption && <p className="text-xs text-white/50">{locale === 'zh' ? '文案：' : 'Caption: '}{plan.caption}</p>}
              <button onClick={genVideo} disabled={busy !== null} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#7036F0] px-5 py-3 font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
                {busy === 'video' ? <><Loader2 className="h-4 w-4 animate-spin" /> {locale === 'zh' ? '渲染产品照 + 视频，约 1-3 分钟…' : 'Rendering product photo + video ~1-3 min…'}</> : <><Sparkles className="h-4 w-4" /> {byokActive ? (locale === 'zh' ? '生成广告视频' : 'Generate ad video') : (locale === 'zh' ? `生成广告视频 · ${COSTS.image + VIDEO_COST} 积分` : `Generate ad video · ${COSTS.image + VIDEO_COST} credits`)}</>}
              </button>
            </div>
          )}
        </section>

        {/* 右:输出 */}
        <section className="space-y-5">
          {plan ? (
            <>
              <div className="rounded-2xl border border-white/10 bg-[#1c1e21] p-5">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white"><ImageIcon className="h-4 w-4 text-[#7036F0]" /> {locale === 'zh' ? '产品照片' : 'Product photo'}</h3>
                <div className="flex aspect-video items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
                  {productImg.status === 'done' && productImg.url ? (/* eslint-disable-next-line @next/next/no-img-element */ <img src={productImg.url} alt={locale === 'zh' ? '产品' : 'product'} className="h-full w-full object-contain" />)
                    : productImg.status === 'processing' ? <Loader2 className="h-6 w-6 animate-spin text-[#7036F0]" />
                    : productImg.status === 'failed' ? <span className="text-sm text-red-400">{locale === 'zh' ? '产品照生成失败' : 'Product photo failed'}</span>
                    : <span className="text-sm text-white/30">{locale === 'zh' ? '点击“生成广告视频”后在此显示' : 'Appears after you click "Generate ad video"'}</span>}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-[#1c1e21] p-5">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white"><Video className="h-4 w-4 text-[#7036F0]" /> {locale === 'zh' ? '成片广告（15 秒）' : 'Finished ad (15s)'}</h3>
                <div className="flex aspect-video items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
                  {video.status === 'done' && video.url ? <video src={video.url} controls className="h-full w-full object-contain" />
                    : video.status === 'processing' ? <div className="flex flex-col items-center gap-2 text-white/40"><Loader2 className="h-7 w-7 animate-spin text-[#7036F0]" /><span className="text-xs">{locale === 'zh' ? 'seedance 渲染中，约 1-3 分钟' : 'seedance rendering ~1-3 min'}</span></div>
                    : video.status === 'failed' ? <span className="text-sm text-red-400">{locale === 'zh' ? '渲染失败' : 'Render failed'}</span>
                    : <span className="text-sm text-white/30">{locale === 'zh' ? '产品照生成后自动渲染' : 'Renders automatically after the product photo'}</span>}
                </div>
                {video.status === 'done' && video.url && <a href={dl(video.url)} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-5 py-3 font-medium text-white transition hover:border-white/20 hover:bg-white/[0.08]"><Download className="h-4 w-4" /> {locale === 'zh' ? '下载视频' : 'Download video'}</a>}
              </div>
            </>
          ) : (
            <div className="flex min-h-[240px] flex-col items-center justify-center gap-2 rounded-2xl border border-white/10 bg-[#1c1e21] p-8 text-center text-white/30">
              <Clapperboard className="h-10 w-10" /><p className="text-sm">{locale === 'zh' ? '在左侧填写产品、选好风格，导演会先写出一段双人搞笑小剧场，再渲染成视频。' : 'Fill in a product on the left, pick a style, and the director will write a two-hander comedy skit before rendering the video.'}</p>
            </div>
          )}

          {/* 示例 */}
          <div className="rounded-2xl border border-white/10 bg-[#1c1e21] p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white"><Sparkles className="h-4 w-4 text-[#7036F0]" /> {locale === 'zh' ? '示例成片（搞笑风格）' : 'Sample outputs (funny style)'}</h3>
            <div className="flex flex-wrap gap-4">
              {SAMPLES.map((s) => (
                <div key={s.title} className="w-[220px] overflow-hidden rounded-xl border border-white/10">
                  <video src={s.video} controls preload="metadata" playsInline className="aspect-[9/16] w-full bg-neutral-900 object-cover" />
                  <div className="px-2.5 py-1.5 text-xs font-medium text-white/60">{s.title}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
      </div>
    </div>
  );
}
