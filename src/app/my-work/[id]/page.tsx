'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useSession, signIn } from 'next-auth/react';
import { Loader2, ArrowLeft, Download, Film } from 'lucide-react';
import { useI18n } from '@/i18n/provider';

// drama 作品文件夹详情页:分区展示 角色定妆图 / 各场景(首帧+视频) / 最终成片。
// 数据来自 /api/creations/[id](GET 返回含 assets)。制作中会持续变化,故 15s 轮询刷新。
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
  prompt: string;
  outputs: string[] | null;
  assets?: DramaAssets | null;
  status: string;
  createdAt: string;
};

export default function WorkDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { status } = useSession();
  const { locale } = useI18n();
  const zh = locale === 'zh';
  const [c, setC] = useState<Creation | null | 'notfound'>(null);

  useEffect(() => {
    if (status !== 'authenticated') return;
    let alive = true;
    const load = () =>
      fetch(`/api/creations/${id}`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('not_ok'))))
        .then((j) => { if (alive) setC(j && j.id ? j : 'notfound'); })
        .catch(() => { if (alive) setC((prev) => (prev && prev !== 'notfound' ? prev : 'notfound')); });
    void load();
    const t = setInterval(load, 15_000); // 制作中持续更新
    return () => { alive = false; clearInterval(t); };
  }, [id, status]);

  const finalVideo = c && c !== 'notfound' && Array.isArray(c.outputs) ? c.outputs[0] : '';

  return (
    <div className="min-h-screen" style={{ background: '#131416' }}>
      <div className="px-6 sm:px-8 py-5">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/my-work')} className="inline-flex items-center gap-1.5 text-sm text-white/70 hover:text-white transition"><ArrowLeft className="h-4 w-4" />{zh ? '我的作品' : 'My work'}</button>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 sm:px-6 pb-24">
        {status === 'loading' || c === null ? (
          <div className="grid place-items-center py-32"><Loader2 className="h-7 w-7 animate-spin text-white/40" /></div>
        ) : status !== 'authenticated' ? (
          <div className="grid place-items-center gap-4 py-32 text-center">
            <div className="text-5xl">🔐</div>
            <p className="text-white/50">{zh ? '登录后查看作品。' : 'Sign in to view.'}</p>
            <button onClick={() => signIn('google')} className="rounded-xl px-5 py-2.5 text-sm font-bold text-white" style={{ background: '#7036F0' }}>{zh ? '登录' : 'Sign in'}</button>
          </div>
        ) : c === 'notfound' || !c.assets || c.assets.kind !== 'drama' ? (
          <div className="grid place-items-center gap-4 py-32 text-center">
            <div className="text-5xl">🗂️</div>
            <p className="text-white/50">{zh ? '这个作品没有文件夹视图。' : 'No folder view for this item.'}</p>
            <Link href="/my-work" className="rounded-xl px-5 py-2.5 text-sm font-bold text-white" style={{ background: '#7036F0' }}>{zh ? '返回作品' : 'Back to work'}</Link>
          </div>
        ) : (
          <DramaFolder c={c} zh={zh} finalVideo={finalVideo} />
        )}
      </div>
    </div>
  );
}

function DramaFolder({ c, zh, finalVideo }: { c: Creation; zh: boolean; finalVideo: string }) {
  const f = c.assets as DramaAssets;
  const chars = f.characters || [];
  const scenes = f.scenes || [];
  const doneVids = scenes.filter((s) => s.videoUrl).length;

  return (
    <div className="pt-4">
      <div className="flex items-center gap-2 mb-1"><Film className="h-5 w-5" style={{ color: '#a78bfa' }} /><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{f.title || c.prompt || (zh ? '短剧' : 'Drama')}</h1></div>
      <p className="mb-8 text-sm text-white/45">{zh ? `AI 剧情 · ${chars.length} 个角色 · ${scenes.length} 个场景 · ${doneVids}/${scenes.length} 镜已出片` : `Drama · ${chars.length} characters · ${scenes.length} scenes · ${doneVids}/${scenes.length} shots done`}</p>

      {/* 最终成片 */}
      <section className="mb-10">
        <h2 className="mb-3 text-sm font-semibold text-white/70">{zh ? '最终成片' : 'Final cut'}</h2>
        {finalVideo ? (
          <div className="relative w-full max-w-[300px]">
            <video src={finalVideo} controls playsInline poster={scenes.find((s) => s.frameUrl)?.frameUrl || undefined} className="w-full rounded-2xl border border-white/10 bg-black" />
            <a href={finalVideo} download className="absolute -right-3 -top-3 grid h-9 w-9 place-items-center rounded-full bg-white text-black shadow-lg"><Download className="h-4 w-4" /></a>
          </div>
        ) : (
          <div className="grid aspect-video max-w-[300px] place-items-center rounded-2xl border border-dashed border-white/15 bg-black/20 text-xs text-white/40">{zh ? '所有分镜出片后拼接成片会出现在这里' : 'Appears after all shots are stitched'}</div>
        )}
      </section>

      {/* 角色定妆图 */}
      <section className="mb-10">
        <h2 className="mb-3 text-sm font-semibold text-white/70">🎭 {zh ? '角色定妆图' : 'Cast portraits'}</h2>
        {chars.length ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {chars.map((ch) => (
              <div key={ch.key} className="overflow-hidden rounded-xl border border-white/10 bg-black/20">
                <div className="relative aspect-[3/4] w-full">
                  {ch.portraitUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={ch.portraitUrl} alt={ch.name} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-3xl opacity-50">🎭</div>
                  )}
                </div>
                <div className="p-2 text-xs font-medium text-white/85">{ch.name}</div>
              </div>
            ))}
          </div>
        ) : <div className="text-xs text-white/40">{zh ? '暂无角色' : 'No characters'}</div>}
      </section>

      {/* 产品参考图(带货剧:用户上传或自动生成,全剧锁同一件产品) */}
      {f.productImageUrl && (
        <section className="mb-10">
          <h2 className="mb-3 text-sm font-semibold text-white/70">🛍️ {zh ? '产品参考图' : 'Product reference'}</h2>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={f.productImageUrl} alt="product" className="h-40 rounded-xl border border-white/10 object-cover" referrerPolicy="no-referrer" />
        </section>
      )}

      {/* 各场景资产 */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-white/70">🎬 {zh ? '各场景(首帧 + 视频)' : 'Scenes (frame + video)'}</h2>
        <div className="space-y-4">
          {scenes.map((s) => (
            <div key={s.i} className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px]" style={{ color: '#a78bfa' }}>{zh ? `场景 ${s.i}` : `Scene ${s.i}`}</span>
                {s.dialogue && <span className="truncate text-[11px] text-white/50">「{s.dialogue}」</span>}
              </div>
              <div className="flex flex-wrap gap-3">
                {s.frameUrl && (
                  <div>
                    <div className="mb-1 text-[10px] text-white/40">{zh ? '首帧图' : 'First frame'}</div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.frameUrl} alt="" className="h-40 rounded-lg border border-white/10 object-cover" referrerPolicy="no-referrer" />
                  </div>
                )}
                {s.videoUrl ? (
                  <div>
                    <div className="mb-1 text-[10px] text-white/40">{zh ? '视频' : 'Video'}</div>
                    <video src={s.videoUrl} controls playsInline poster={s.frameUrl || undefined} className="h-40 rounded-lg border border-white/10 bg-black" />
                  </div>
                ) : (
                  <div className="grid h-40 w-24 place-items-center rounded-lg border border-dashed border-white/15 bg-black/20 text-[10px] text-white/40">{zh ? '未出片' : 'Pending'}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
