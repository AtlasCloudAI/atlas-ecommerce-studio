'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Clock } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { useMounted } from '@/lib/use-mounted';

// 右上固定区的「我的作品」入口:登录后在所有沉浸页(含首页)显示,跳到独立的 /my-work 作品页。
export function HistoryButton() {
  const { data: session } = useSession();
  const { locale } = useI18n();
  const mounted = useMounted();
  if (!mounted || !session) return null;
  return (
    <Link
      href="/my-work"
      title={locale === 'zh' ? '我的作品' : 'My work'}
      className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/15"
    >
      <Clock className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">{locale === 'zh' ? '作品' : 'Work'}</span>
    </Link>
  );
}
