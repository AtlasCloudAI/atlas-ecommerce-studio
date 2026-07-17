'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { LOCALES, type Locale, messages, appMessages } from './messages';

/* eslint-disable @typescript-eslint/no-explicit-any */
function get(obj: any, path: string): any {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

interface Ctx {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  appText: (id: string) => { title: string; description: string };
}

const I18nContext = createContext<Ctx | null>(null);

// initialLocale 由服务端(RootLayout)从 cookie 读好传入:SSR 与 client 首帧用同一 locale,
// 彻底消除 "SSR 英文 → client useEffect 切中文" 造成的 hydration mismatch(React #418)。
export function I18nProvider({ children, initialLocale }: { children: React.ReactNode; initialLocale?: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale || 'en');

  // 迁移老用户:只有 localStorage 有、cookie 没有(initialLocale 未传到期望值)时,采用并补写 cookie,
  // 使下次 SSR 就能读到 → 之后首帧完全一致。首帧仍 = initialLocale,不破坏本次 hydration。
  useEffect(() => {
    try {
      const saved = localStorage.getItem('locale') as Locale | null;
      if (saved && (LOCALES as readonly string[]).includes(saved)) {
        if (saved !== locale) setLocaleState(saved);
        if (typeof document !== 'undefined' && !document.cookie.includes(`locale=${saved}`)) {
          document.cookie = `locale=${saved}; path=/; max-age=31536000; samesite=lax`;
        }
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem('locale', l);
      document.cookie = `locale=${l}; path=/; max-age=31536000; samesite=lax`;
      document.documentElement.lang = l;
    } catch {
      /* ignore */
    }
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      let s = get(messages[locale], key) ?? get(messages.en, key) ?? key;
      if (typeof s === 'string' && vars) {
        for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
      }
      return s as string;
    },
    [locale],
  );

  const appText = useCallback(
    (id: string) => appMessages[locale]?.[id] ?? appMessages.en[id] ?? { title: id, description: '' },
    [locale],
  );

  return <I18nContext.Provider value={{ locale, setLocale, t, appText }}>{children}</I18nContext.Provider>;
}

export function useI18n(): Ctx {
  const c = useContext(I18nContext);
  if (!c) throw new Error('useI18n must be used inside I18nProvider');
  return c;
}
