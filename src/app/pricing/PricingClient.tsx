'use client';

import { useState } from 'react';
import { useSession, signIn } from 'next-auth/react';
import type { CreditPack } from '@/config/pricing';
import { useI18n } from '@/i18n/provider';
import { Check, Coins, Loader2, Gift } from 'lucide-react';

export default function PricingClient({
  packs,
  mode,
}: {
  packs: CreditPack[];
  mode: 'checkout' | 'redeem';
}) {
  const { data: session } = useSession();
  const { t, locale } = useI18n();
  const [busy, setBusy] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const zh = locale === 'zh';

  async function buy(packId: string) {
    if (!session) return signIn('google');
    setMsg(null);
    setBusy(packId);
    try {
      const r = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packId }),
      });
      const j = await r.json().catch(() => ({}));
      if (j.url) {
        window.location.href = j.url;
        return;
      }
      console.error('[pricing] checkout failed:', j);
      setMsg({
        text: zh
          ? `发起支付失败:${j.error || 'checkout_failed'}${j.detail ? ' — ' + String(j.detail).slice(0, 200) : ''}`
          : `Checkout failed: ${j.error || 'unknown'}${j.detail ? ' — ' + String(j.detail).slice(0, 200) : ''}`,
        ok: false,
      });
    } catch (e) {
      setMsg({ text: (zh ? '网络错误:' : 'Network error: ') + String(e), ok: false });
    } finally {
      setBusy(null);
    }
  }

  async function redeem() {
    if (!session) return signIn('google');
    setMsg(null);
    setBusy('redeem');
    try {
      const r = await fetch('/api/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        setMsg({ text: t('pricing.added', { n: j.amount }), ok: true });
        setCode('');
        window.dispatchEvent(new Event('atlas:credits'));
      } else {
        setMsg({ text: `${zh ? '兑换失败' : 'Error'}: ${j.error || 'invalid code'}`, ok: false });
      }
    } catch (e) {
      setMsg({ text: (zh ? '网络错误:' : 'Network error: ') + String(e), ok: false });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="min-h-screen text-[#f7f7f8]" style={{ backgroundColor: '#131416', colorScheme: 'dark' }}>
      {/* 顶栏:只放左侧 logo + 返回,右侧留给 Shell 的固定区(余额/语言/用户/部署),避免重叠 */}
      <div className="px-6 sm:px-8 py-5">
        <div className="flex items-center gap-4">
          <a href="/" className="flex items-center gap-2 hover:opacity-80 transition">
            <div className="w-7 h-7 rounded-lg grid place-items-center text-sm font-bold" style={{ background: '#7036F0', color: '#fff' }}>✦</div>
            <b className="text-sm tracking-tight">Marketing Studio</b>
          </a>
          <a href="/" className="text-xs text-white/60 hover:text-white transition">{zh ? '← 全部应用' : '← All apps'}</a>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 pb-24 space-y-8">
        <div className="text-center pt-6">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t('pricing.title')}</h1>
          <p className="mt-3 text-white/50">{t('pricing.subtitle')}</p>
        </div>

        {msg && (
          <p className={`text-center text-sm ${msg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{msg.text}</p>
        )}

        <div className="grid gap-6 sm:grid-cols-3">
          {packs.map((p) => (
            <div
              key={p.id}
              className={`relative flex flex-col rounded-2xl border p-7 ${p.highlight ? 'border-[#7036F0] ring-2 ring-[#7036F0]/40 bg-white/[0.04]' : 'border-white/[0.08] bg-white/[0.03]'}`}
            >
              {p.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-semibold text-white shadow-lg" style={{ background: '#7036F0' }}>
                  {t('pricing.popular')}
                </span>
              )}
              <div className="text-sm font-medium text-white/50">{p.name}</div>
              <div className="mt-2 text-4xl font-bold">${p.priceUsd}</div>
              <div className="mt-1 flex items-center gap-1.5 text-sm font-medium" style={{ color: '#a78bfa' }}>
                <Coins className="h-4 w-4" />
                {p.credits.toLocaleString()} {t('pricing.credits')}
              </div>
              <ul className="mt-5 space-y-2 text-sm text-white/60">
                <li className="flex gap-2"><Check className="h-4 w-4 shrink-0" style={{ color: '#7036F0' }} />~{Math.floor(p.credits / 5).toLocaleString()}{t('pricing.featGen')}</li>
                <li className="flex gap-2"><Check className="h-4 w-4 shrink-0" style={{ color: '#7036F0' }} />{t('pricing.featApps')}</li>
                <li className="flex gap-2"><Check className="h-4 w-4 shrink-0" style={{ color: '#7036F0' }} />{t('pricing.featExpire')}</li>
              </ul>
              {mode === 'checkout' && (
                <button
                  onClick={() => buy(p.id)}
                  disabled={busy === p.id}
                  className="mt-6 w-full rounded-xl px-4 py-2.5 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50"
                  style={{ background: p.highlight ? '#7036F0' : 'rgba(255,255,255,0.08)' }}
                >
                  {busy === p.id ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : t('pricing.buy')}
                </button>
              )}
            </div>
          ))}
        </div>

        {mode === 'redeem' && (
          <div className="mx-auto max-w-md rounded-2xl border border-white/[0.08] bg-white/[0.03] p-7 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl" style={{ background: 'rgba(112,54,240,0.15)' }}>
              <Gift className="h-5 w-5" style={{ color: '#7036F0' }} />
            </span>
            <h2 className="mt-3 font-semibold">{t('pricing.redeemTitle')}</h2>
            <p className="mb-4 mt-1 text-sm text-white/50">{t('pricing.redeemDesc')}</p>
            <div className="flex gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="ATLAS-XXXX-XXXX"
                className="flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white outline-none transition focus:border-[#7036F0] focus:ring-1 focus:ring-[#7036F0]"
              />
              <button onClick={redeem} disabled={busy === 'redeem' || !code} className="rounded-xl px-4 py-2.5 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50" style={{ background: '#7036F0' }}>
                {busy === 'redeem' ? <Loader2 className="h-4 w-4 animate-spin" /> : t('pricing.redeem')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
