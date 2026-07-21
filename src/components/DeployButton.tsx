'use client';

import { useState } from 'react';
import { Rocket, X } from 'lucide-react';
import { useI18n } from '@/i18n/provider';

const REPO = 'https://github.com/AtlasCloudAI/atlas-marketing-studio';
const ENV_VARS = 'ATLASCLOUD_API_KEY,DATABASE_URL,DIRECT_URL,NEXTAUTH_SECRET,NEXTAUTH_URL,GOOGLE_CLIENT_ID,GOOGLE_CLIENT_SECRET,PAYMENT_PROVIDER';
const ENV_DESC = 'Atlas Cloud API key, Neon database URLs, NextAuth secret, Google OAuth credentials, and payment provider (see .dev.vars.example)';
const ENV_LINK = `${REPO}/blob/main/.dev.vars.example`;

const VERCEL_URL =
  `https://vercel.com/new/clone?repository-url=${encodeURIComponent(REPO)}` +
  `&env=${ENV_VARS}` +
  `&envDescription=${encodeURIComponent(ENV_DESC)}` +
  `&envLink=${encodeURIComponent(ENV_LINK)}` +
  `&project-name=atlas-marketing-studio&repository-name=atlas-marketing-studio`;
const CF_URL = `https://deploy.workers.cloudflare.com/?url=${encodeURIComponent(REPO)}`;

export function DeployButton() {
  const [open, setOpen] = useState(false);
  const { locale } = useI18n();
  const zh = locale === 'zh';
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold shadow-lg transition hover:brightness-110"
        style={{ background: '#7036F0', color: '#fff' }}
        title={zh ? '一键部署你自己的一份' : 'Deploy your own copy'}
      >
        <Rocket className="w-3.5 h-3.5" /> {zh ? '一键部署' : 'Deploy'}
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur grid place-items-center p-4" onClick={() => setOpen(false)}>
          <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#1c1e21] p-6 text-[#f7f7f8]" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setOpen(false)} className="absolute top-3 right-3 text-white/40 hover:text-white"><X className="w-5 h-5" /></button>
            <h3 className="text-lg font-bold mb-1">{zh ? '部署你自己的一份' : 'Deploy your own copy'}</h3>
            <p className="text-sm text-white/50 mb-5">{zh ? '一键把整套 Marketing Studio 克隆到你自己的账户,填入你的 Atlas Cloud key 就能上线运营。' : 'Clone the entire Marketing Studio to your own account — add your Atlas Cloud key and go live.'}</p>
            <div className="space-y-3">
              <a href={VERCEL_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 hover:border-[#7036F0]/60 hover:bg-white/[0.06] transition">
                <span className="text-2xl font-black leading-none">▲</span>
                <div><div className="font-semibold">{zh ? '部署到 Vercel' : 'Deploy to Vercel'}</div><div className="text-xs text-white/45">{zh ? 'Next.js 原生托管,最快,含自动 CI' : 'Native Next.js hosting, fastest, auto CI'}</div></div>
              </a>
              <a href={CF_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 hover:border-[#7036F0]/60 hover:bg-white/[0.06] transition">
                <span className="text-2xl leading-none">☁️</span>
                <div><div className="font-semibold">{zh ? '部署到 Cloudflare' : 'Deploy to Cloudflare'}</div><div className="text-xs text-white/45">{zh ? 'Workers 全球边缘,免费额度大' : 'Workers global edge, generous free tier'}</div></div>
              </a>
            </div>
            <p className="text-[11px] text-white/30 mt-4">{zh ? '部署后在平台填入环境变量(Atlas Cloud key / 数据库 / Google OAuth),详见 ' : 'After deploying, set env vars (Atlas Cloud key / database / Google OAuth) on the platform — see '}<a href={ENV_LINK} target="_blank" rel="noopener noreferrer" className="underline hover:text-white/60">.dev.vars.example</a></p>
          </div>
        </div>
      )}
    </>
  );
}
