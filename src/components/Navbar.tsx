'use client';

import Link from 'next/link';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useCallback, useEffect, useState } from 'react';
import { Sparkles, Coins, LogOut } from 'lucide-react';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useI18n } from '@/i18n/provider';

export function Navbar() {
  const { data: session } = useSession();
  const { t } = useI18n();
  const [credits, setCredits] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/me');
      if (r.ok) setCredits((await r.json()).credits);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (session) refresh();
    else setCredits(null);
  }, [session, refresh]);

  useEffect(() => {
    const h = () => refresh();
    window.addEventListener('atlas:credits', h);
    return () => window.removeEventListener('atlas:credits', h);
  }, [refresh]);

  const navLink =
    'rounded-lg px-3 py-2 text-sm font-medium text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900';

  return (
    <header className="sticky top-0 z-40 border-b border-neutral-200/70 bg-white/80 backdrop-blur-lg">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-bold">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-gradient text-white shadow-glow">
            <Sparkles className="h-4 w-4" />
          </span>
          <span className="hidden text-[15px] tracking-tight sm:inline">Marketing Studio</span>
        </Link>
        <nav className="flex items-center gap-1">
          <Link href="/pricing" className={navLink}>
            {t('nav.pricing')}
          </Link>
          <Link href="/coverage" className={`hidden sm:inline-flex ${navLink}`}>
            Coverage
          </Link>
          {session ? (
            <>
              <Link href="/dashboard" className={`hidden sm:inline-flex ${navLink}`}>
                {t('nav.myWork')}
              </Link>
              <span className="ml-1 inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-700">
                <Coins className="h-3.5 w-3.5" />
                {credits === null ? '·' : credits.toLocaleString()}
              </span>
              {session.user?.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={session.user.image}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="hidden h-8 w-8 rounded-full border border-neutral-200 sm:block"
                />
              )}
              <button
                onClick={() => signOut()}
                title="Sign out"
                className="rounded-lg p-2 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </>
          ) : (
            <button onClick={() => signIn('google')} className="btn-brand ml-1 px-4 py-2 text-sm">
              {t('nav.signIn')}
            </button>
          )}
          <LanguageSwitcher />
        </nav>
      </div>
    </header>
  );
}
