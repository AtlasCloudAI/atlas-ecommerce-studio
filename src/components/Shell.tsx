'use client';

import { usePathname } from 'next/navigation';
import { Navbar } from '@/components/Navbar';
import { AppSidebar } from '@/components/AppSidebar';
import { Footer } from '@/components/Footer';
import { DeployButton } from '@/components/DeployButton';
import { UserMenu } from '@/components/UserMenu';
import { LangToggle } from '@/components/LangToggle';
import { CreditBadge } from '@/components/CreditBadge';
import { HistoryButton } from '@/components/HistoryButton';
import { ByokKey } from '@/components/ByokKey';

// marketing-studio 走全出血沉浸式(深色、无浅色 starter 外壳),完全复刻 Higgsfield。
// 其余页面保持 SaaS starter 的 Navbar + 侧栏 + Footer 外壳不变。
const IMMERSIVE = ['/', '/pricing', '/my-work', '/marketing-studio', '/ad-reference', '/drama-studio', '/ad-skit'];

export function Shell({ children }: { children: React.ReactNode }) {
  const p = usePathname() || '';
  if (IMMERSIVE.some((r) => p === r || p.startsWith(r + '/'))) {
    // 星标应用统一深色满屏壳(无浅色 Navbar/侧栏/Footer),各页面内容在此之上。
    return (
      <div className="min-h-screen bg-[#131416] text-[#f7f7f8]" style={{ colorScheme: 'dark' }}>
        {children}
        <div className="fixed top-3 right-4 z-50 flex items-center gap-2">
          <HistoryButton />
          <CreditBadge />
          <ByokKey />
          <LangToggle />
          <UserMenu />
          <DeployButton />
        </div>
      </div>
    );
  }
  return (
    <>
      <Navbar />
      <div className="mx-auto flex w-full max-w-[1440px] flex-1 gap-6 px-4 py-8 sm:py-10">
        <AppSidebar />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
      <Footer />
    </>
  );
}
