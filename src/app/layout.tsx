import './globals.css';
import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { cookies } from 'next/headers';
import { authOptions } from '@/lib/auth';
import { LOCALES, type Locale } from '@/i18n/messages';
import Providers from './providers';
import { Shell } from '@/components/Shell';


export const metadata: Metadata = {
  title: 'Marketing Studio — AI media SaaS',
  description:
    'Generate AI photos, videos, and podcasts. Open-source SaaS starter powered by Atlas Cloud.',
  // Atlas OSS force-downloads media when a Referer is sent — drop it so <img>/<video> render inline.
  referrer: 'no-referrer',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // 服务端读真实 session 作为 SessionProvider 的初始值:让 SSR 与 client 首帧的 session 状态
  // 完全一致(都用这份),从根上消除 next-auth 在登录态下的 SSR(loading) vs client(authenticated) 分歧(#418)。
  // catch→null:即便 SSR 读库失败也不让整页 500,退化为未登录 SSR(客户端会自行 fetch)。
  const session = await getServerSession(authOptions).catch(() => null);
  // 从 cookie 读用户语言,SSR 就渲染对应语言,并传给 client 作首帧初始值 → 语言层 SSR/client 一致。
  const localeCookie = cookies().get('locale')?.value;
  const initialLocale = ((LOCALES as readonly string[]).includes(localeCookie || '') ? localeCookie : 'en') as Locale;
  return (
    <html lang={initialLocale}>
      <head>
        {/* Space Grotesk 运行时经 CDN 加载(不在 build 期下载,避免离线/墙内构建失败);加载不到自动回退系统无衬线。 */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet" />
      </head>
      <body className="flex min-h-screen flex-col font-sans" style={{ ['--font-grotesk']: "'Space Grotesk', ui-sans-serif, system-ui, sans-serif" } as React.CSSProperties}>
        <Providers session={session} initialLocale={initialLocale}>
          <Shell>{children}</Shell>
        </Providers>
      </body>
    </html>
  );
}
