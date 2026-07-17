'use client';

import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useState } from 'react';
import { Coins } from 'lucide-react';
import { useMounted } from '@/lib/use-mounted';

// 沉浸式深色壳右上角的积分余额徽章:读 /api/me,监听 'atlas:credits' 事件在每次扣费后刷新。
// 未登录不显示。点击进 pricing 充值。
export function CreditBadge() {
  const { data: session } = useSession();
  const [credits, setCredits] = useState<number | null>(null);
  const mounted = useMounted();

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

  if (!mounted || !session) return null;
  return (
    <a
      href="/pricing"
      title="Credits"
      className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/15"
    >
      <Coins className="h-3.5 w-3.5" style={{ color: '#d1fe17' }} />
      {credits === null ? '·' : credits.toLocaleString()}
    </a>
  );
}
