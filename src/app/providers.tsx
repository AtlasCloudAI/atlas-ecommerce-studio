'use client';

import { SessionProvider } from 'next-auth/react';
import type { Session } from 'next-auth';
import { I18nProvider } from '@/i18n/provider';
import type { Locale } from '@/i18n/messages';

export default function Providers({
  children,
  session,
  initialLocale,
}: {
  children: React.ReactNode;
  session: Session | null;
  initialLocale?: Locale;
}) {
  // session + initialLocale 均由 RootLayout 在服务端读好传入,让 SSR 与 client 首帧的
  // session 状态和语言都一致 → 消除 hydration mismatch(#418)。
  return (
    <SessionProvider session={session} refetchOnWindowFocus={false}>
      <I18nProvider initialLocale={initialLocale}>{children}</I18nProvider>
    </SessionProvider>
  );
}
