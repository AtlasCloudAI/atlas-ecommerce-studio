'use client';

import Link from 'next/link';
import { useI18n } from '@/i18n/provider';
import {
  ArrowRight,
  Clapperboard,
  Zap,
  DollarSign,
  Percent,
} from 'lucide-react';
import { appTitle, appDesc, isFeatured } from '@/config/appCatalog';

type App = { id: string; href: string; icon: typeof Clapperboard; kind: string };

// 精简后首页只保留 4 个精品应用(其余应用页面已删)。
const APPS: App[] = [
  { id: 'marketing-studio', href: '/marketing-studio', icon: Clapperboard, kind: 'pipeline' },
  { id: 'ad-reference', href: '/ad-reference', icon: Clapperboard, kind: 'pipeline' },
  { id: 'drama-studio', href: '/drama-studio', icon: Clapperboard, kind: 'pipeline' },
  { id: 'ad-skit', href: '/ad-skit', icon: Clapperboard, kind: 'pipeline' },
];

export default function Home() {
  const { t, appText, locale } = useI18n();
  const appCount = APPS.length;

  const STATS = [
    { icon: Zap, value: '~$0.01-0.04', label: t('home.statCost') },
    { icon: DollarSign, value: '$0.50–1+', label: t('home.statCharge') },
    { icon: Percent, value: '~95%', label: t('home.statMargin') },
  ];

  const featured = APPS.filter((app) => isFeatured(app.href));

  const gridBg = {
    backgroundColor: '#131416',
    colorScheme: 'dark',
    backgroundImage:
      'radial-gradient(70% 55% at 50% -6%, rgba(112,54,240,0.12) 0%, rgba(112,54,240,0) 60%), linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)',
    backgroundSize: 'auto, 44px 44px, 44px 44px',
  } as React.CSSProperties;

  return (
    <main className="min-h-screen text-[#f7f7f8]" style={gridBg}>
      {/* 顶栏 */}
      <div className="px-6 sm:px-8 py-5">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3">
          <div className="w-7 h-7 rounded-lg grid place-items-center text-sm font-bold" style={{ background: '#7036F0', color: '#fff' }}>✦</div>
          <b className="text-sm tracking-tight">Marketing Studio</b>
          <a href="https://atlascloud.ai?utm_source=github&utm_campaign=ecommerce-studio" target="_blank" rel="noopener noreferrer"
             className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/45 transition hover:border-white/25 hover:text-white/80">
            <span>Powered by</span>
            <img src="/atlas-cloud-wordmark.png" alt="Atlas Cloud" className="h-3.5 w-auto opacity-90" />
            <span aria-hidden="true">↗</span>
          </a>
        </div>
      </div>

      {/* hero */}
      <div className="text-center pt-14 pb-12 px-6">
        <div className="text-[11px] uppercase tracking-[0.24em] text-white/50 font-medium mb-3" style={{ fontFamily: 'var(--font-grotesk), "Space Grotesk", sans-serif' }}>Marketing Studio</div>
        <h1 className="font-bold uppercase leading-[1.06] tracking-[-0.03em] text-[clamp(38px,5.2vw,56px)] text-white/90" style={{ fontFamily: 'var(--font-grotesk), "Space Grotesk", system-ui, sans-serif' }}>
          {locale === 'zh' ? (<>你的 AI<br /><span style={{ color: '#7036F0' }}>创作工作室</span></>) : (<>Your AI<br /><span style={{ color: '#7036F0' }}>Creative Studio</span></>)}
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-white/50">{locale === 'zh' ? `${featured.length} 个精品应用 · 上传即出片 · 每一步真调 Atlas` : `${featured.length} premium apps · upload and ship · every step powered by Atlas`}</p>
      </div>

      {/* 精品应用卡片 */}
      <div className="max-w-6xl mx-auto px-4 pb-24">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((app) => {
            const a = appText(app.id);
            const Icon = app.icon;
            return (
              <Link
                key={app.id}
                href={app.href}
                className="group rounded-2xl border border-white/8 bg-white/[0.03] p-6 transition hover:-translate-y-1 hover:border-[#7036F0]/50 hover:bg-white/[0.05]"
              >
                <div className="flex items-center justify-between">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl transition duration-300 group-hover:scale-110" style={{ background: 'rgba(112,54,240,0.15)', color: '#a78bfa' }}>
                    <Icon className="h-6 w-6" />
                  </span>
                  <span className="rounded-full px-2.5 py-1 text-[10px] font-semibold" style={{ background: 'rgba(112,54,240,0.15)', color: '#c4b5fd' }}>⭐ {locale === 'zh' ? '精品' : 'Featured'}</span>
                </div>
                <h3 className="mt-4 font-bold tracking-tight">{appTitle(app.id, a.title, locale)}</h3>
                <p className="mt-1 text-sm text-white/50 leading-relaxed">{appDesc(app.id, a.description, locale)}</p>
                <div className="mt-4 flex items-center gap-1 text-sm font-medium opacity-0 transition duration-300 group-hover:opacity-100" style={{ color: '#a78bfa' }}>
                  {t('home.tryIt')} <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </main>
  );
}
