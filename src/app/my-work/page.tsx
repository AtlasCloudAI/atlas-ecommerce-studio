'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession, signIn } from 'next-auth/react';
import { Download, Loader2, Clock, Play, X, Film } from 'lucide-react';
import { useI18n } from '@/i18n/provider';

type DramaAssets = {
  kind: string;
  title?: string;
  characters?: { key: string; name: string; appearance?: string; portraitUrl?: string | null }[];
  sceneImageUrl?: string | null;
  productImageUrl?: string | null;
  scenes?: { i: number; scene?: string; dialogue?: string; frameUrl?: string | null; videoUrl?: string | null }[];
};
type Creation = {
  id: string;
  templateId: string;
  model?: string;
  prompt: string;
  inputImage: string | null;
  outputs: string[] | null;
  assets?: DramaAssets | null;
  status: string;
  createdAt: string;
};
type MediaKind = 'video' | 'image' | 'audio' | 'unknown';
type PlayTarget = { url: string; kind: MediaKind } | null;

// 只展示工作室级作品(逐镜/中间任务已由 /api/creations 在服务端排除)。
const SOURCE: Record<string, { zh: string; en: string }> = {
  'marketing-studio': { zh: '产品广告', en: 'Ad' },
  'drama-studio': { zh: 'AI 剧情', en: 'Drama' },
  'ad-reference': { zh: '爆款复刻', en: 'Remake' },
};

function firstOutput(c: Creation) {
  return Array.isArray(c.outputs) && typeof c.outputs[0] === 'string' ? c.outputs[0] : '';
}
function mediaKind(url: string, model?: string): MediaKind {
  const u = url.toLowerCase().split('?')[0];
  const m = (model || '').toLowerCase();
  if (/\.(mp4|webm|mov|m4v)$/.test(u) || m.includes('video') || m.includes('lipsync')) return 'video';
  if (/\.(png|jpe?g|webp|gif)$/.test(u) || m.includes('image')) return 'image';
  if (/\.(mp3|wav|m4a|aac|ogg)$/.test(u) || m.includes('speech') || m.includes('audio')) return 'audio';
  return 'unknown';
}

export default function MyWorkPage() {
  const { status } = useSession();
  const router = useRouter();
  const { locale } = useI18n();
  const zh = locale === 'zh';
  const [items, setItems] = useState<Creation[] | null>(null);
  const [play, setPlay] = useState<PlayTarget>(null);

  useEffect(() => {
    if (status !== 'authenticated') return;
    setItems(null);
    const ac = new AbortController();
    const load = () =>
      fetch('/api/creations', { signal: ac.signal, cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : { creations: [] }))
        .then((j) => {
          const list = ((j.creations || []) as Creation[]).filter((c) => Boolean(SOURCE[c.templateId]));
          setItems(list);
          // 推进"生成中"的占位:触发后端完成检测 / 15 分钟超时兜底,下次刷新即生效(不阻塞渲染)。
          list
            .filter((c) => c.status === 'processing')
            .forEach((c) => fetch(`/api/creations/${c.id}`, { signal: ac.signal }).catch(() => {}));
        })
        .catch((e) => { if (e?.name !== 'AbortError') setItems((prev) => prev ?? []); });
    void load();
    // 每 15s 轻刷:生成中 → 成片 / 失败 会自动更新卡片状态
    const t = setInterval(() => void load(), 15_000);
    return () => { ac.abort(); clearInterval(t); };
  }, [status]);

  const generating = items?.filter((c) => c.status === 'processing').length || 0;

  return (
    <div className="min-h-screen" style={{ background: '#131416' }}>
      {/* 顶栏(右上固定区由 Shell 提供) */}
      <div className="px-6 sm:px-8 py-5">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition">
            <div className="w-7 h-7 rounded-lg grid place-items-center text-sm font-bold" style={{ background: '#7036F0', color: '#fff' }}>✦</div>
            <b className="text-sm tracking-tight">Marketing Studio</b>
          </Link>
          <Link href="/" className="text-xs text-white/60 hover:text-white transition">{zh ? '← 全部应用' : '← All apps'}</Link>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 sm:px-6 pb-24">
        <div className="pt-6 pb-8">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{zh ? '我的作品' : 'My work'}</h1>
          <p className="mt-2 text-sm text-white/50">
            {zh ? '你生成的所有成片,永久保存,可随时重看和下载。点击"一键生成"后,任务会立刻出现在这里。' : 'All your generated reels, saved permanently — replay or download anytime. Every generation shows up here instantly.'}
          </p>
          {generating > 0 && (
            <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-[#7036F0]/30 bg-[#7036F0]/[0.08] px-3 py-1 text-xs text-white/80">
              <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: '#a78bfa' }} />
              {zh ? `${generating} 个作品生成中` : `${generating} generating`}
            </div>
          )}
        </div>

        {status === 'loading' ? (
          <div className="grid place-items-center py-32"><Loader2 className="h-7 w-7 animate-spin text-white/40" /></div>
        ) : status !== 'authenticated' ? (
          <div className="grid place-items-center gap-4 py-32 text-center">
            <div className="text-5xl">🔐</div>
            <p className="text-white/50">{zh ? '登录后查看你的作品。' : 'Sign in to see your work.'}</p>
            <button onClick={() => signIn('google')} className="rounded-xl px-5 py-2.5 text-sm font-bold text-white" style={{ background: '#7036F0' }}>{zh ? '登录' : 'Sign in'}</button>
          </div>
        ) : items === null ? (
          <div className="grid place-items-center py-32"><Loader2 className="h-7 w-7 animate-spin text-white/40" /></div>
        ) : items.length === 0 ? (
          <div className="grid place-items-center gap-4 py-32 text-center">
            <div className="text-5xl">🎬</div>
            <p className="text-white/50">{zh ? '还没有作品。去生成你的第一个成片吧。' : 'No work yet. Go create your first reel.'}</p>
            <Link href="/" className="rounded-xl px-5 py-2.5 text-sm font-bold text-white" style={{ background: '#7036F0' }}>{zh ? '去创作' : 'Start creating'}</Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((c) => {
              const src = SOURCE[c.templateId];
              const badge = src ? (zh ? src.zh : src.en) : null;
              const title = c.prompt || (zh ? '未命名' : 'Untitled');
              const time = new Date(c.createdAt).toLocaleString();
              const url = firstOutput(c);

              // ★ drama 作品文件夹:点进独立详情页看 角色/各场景(首帧+视频)/成片。封面取首个定妆图→场景图→成片。
              if (c.assets && c.assets.kind === 'drama') {
                const f = c.assets;
                const cover = f.characters?.find((x) => x.portraitUrl)?.portraitUrl || f.sceneImageUrl || url || '';
                const total = f.scenes?.length || 0;
                const doneVids = f.scenes?.filter((s) => s.videoUrl).length || 0;
                const hasFinal = !!url;
                const stateLabel = hasFinal ? (zh ? '✓ 成片已完成' : '✓ Final ready') : total ? (zh ? `制作中 · ${doneVids}/${total} 镜` : `${doneVids}/${total} shots`) : (zh ? '制作中' : 'In progress');
                return (
                  <button key={c.id} onClick={() => router.push(`/my-work/${c.id}`)} className="group overflow-hidden rounded-2xl border border-white/10 bg-black/30 text-left">
                    <div className="relative aspect-[9/16] w-full">
                      {cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={cover} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="grid h-full w-full place-items-center text-4xl">🎬</div>
                      )}
                      <span className="absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white/90">{zh ? 'AI 剧情' : 'Drama'}</span>
                      <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white/90"><Film className="h-3 w-3" />{zh ? '文件夹' : 'Folder'}</span>
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-2">
                        <div className="text-[11px] font-medium text-white/90">{stateLabel}</div>
                      </div>
                      <div className="absolute inset-0 grid place-items-center bg-black/20 opacity-0 transition group-hover:opacity-100"><div className="rounded-full bg-black/60 px-3 py-1.5 text-xs text-white">{zh ? '打开文件夹' : 'Open folder'}</div></div>
                    </div>
                    <div className="p-3">
                      <div className="truncate text-xs font-medium">{f.title || title}</div>
                      <div className="mt-1 flex items-center gap-1 text-[10px] text-white/40"><Clock className="h-2.5 w-2.5" />{time}</div>
                    </div>
                  </button>
                );
              }

              // ① 生成中:占位卡(转圈),完成后自动变成片
              if (c.status === 'processing') {
                return (
                  <div key={c.id} className="overflow-hidden rounded-2xl border border-[#7036F0]/30 bg-black/30">
                    <div className="relative aspect-[9/16] w-full">
                      {c.inputImage && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.inputImage} alt="" className="h-full w-full object-cover opacity-40" referrerPolicy="no-referrer" />
                      )}
                      <div className="absolute inset-0 grid place-items-center gap-2 bg-black/50">
                        <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#a78bfa' }} />
                        <span className="text-xs font-medium text-white/85">{zh ? '生成中…' : 'Generating…'}</span>
                      </div>
                      {badge && <span className="absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white/90">{badge}</span>}
                    </div>
                    <div className="p-3">
                      <div className="truncate text-xs font-medium">{title}</div>
                      <div className="mt-1 flex items-center gap-1 text-[10px] text-white/40"><Clock className="h-2.5 w-2.5" />{time}</div>
                    </div>
                  </div>
                );
              }

              // ② 失败:占位卡(可去对应工作室重试)
              if (c.status === 'failed' || !url) {
                return (
                  <div key={c.id} className="overflow-hidden rounded-2xl border border-red-500/25 bg-black/30">
                    <div className="relative aspect-[9/16] w-full">
                      {c.inputImage && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.inputImage} alt="" className="h-full w-full object-cover opacity-25" referrerPolicy="no-referrer" />
                      )}
                      <div className="absolute inset-0 grid place-items-center gap-2 bg-black/40">
                        <div className="grid h-11 w-11 place-items-center rounded-full bg-red-500/15"><X className="h-5 w-5 text-red-400" /></div>
                        <span className="text-xs font-medium text-red-300/90">{zh ? '生成失败' : 'Failed'}</span>
                      </div>
                      {badge && <span className="absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white/90">{badge}</span>}
                    </div>
                    <div className="p-3">
                      <div className="truncate text-xs font-medium text-white/60">{title}</div>
                      <div className="mt-1 flex items-center gap-1 text-[10px] text-white/40"><Clock className="h-2.5 w-2.5" />{time}</div>
                    </div>
                  </div>
                );
              }

              // ③ 成片:可播放 + 下载
              const kind = mediaKind(url, c.model);
              return (
                <div key={c.id} className="overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                  <button onClick={() => setPlay({ url, kind })} className="group relative block aspect-[9/16] w-full">
                    {c.inputImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.inputImage} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                    ) : kind === 'image' ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={url} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-4xl">{kind === 'audio' ? '♪' : '🎬'}</div>
                    )}
                    {badge && <span className="absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white/90">{badge}</span>}
                    <div className="absolute inset-0 grid place-items-center bg-black/20 opacity-0 transition group-hover:opacity-100">
                      <div className="grid h-12 w-12 place-items-center rounded-full bg-black/60"><Play className="h-5 w-5 text-white" /></div>
                    </div>
                  </button>
                  <div className="p-3">
                    <div className="truncate text-xs font-medium">{title}</div>
                    <div className="mt-1 flex items-center gap-1 text-[10px] text-white/40"><Clock className="h-2.5 w-2.5" />{time}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {play && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/90 p-4" onClick={() => setPlay(null)}>
          <button onClick={() => setPlay(null)} className="absolute right-5 top-5 text-white/60 hover:text-white"><X className="h-6 w-6" /></button>
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            {play.kind === 'image' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={play.url} alt="" className="max-h-[85vh] w-auto rounded-xl border border-white/10" referrerPolicy="no-referrer" />
            ) : play.kind === 'audio' ? (
              <div className="rounded-xl border border-white/10 bg-[#1c1e21] p-6"><audio src={play.url} controls autoPlay className="w-[min(80vw,420px)]" /></div>
            ) : (
              <video src={play.url} controls autoPlay className="max-h-[85vh] w-auto rounded-xl border border-white/10" />
            )}
            <a href={play.url} download className="absolute -top-3 -right-3 grid h-9 w-9 place-items-center rounded-full bg-white text-black shadow-lg"><Download className="h-4 w-4" /></a>
          </div>
        </div>
      )}
    </div>
  );
}
