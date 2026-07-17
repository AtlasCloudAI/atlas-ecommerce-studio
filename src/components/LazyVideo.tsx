'use client';

import { useRef } from 'react';

/**
 * 卡片预览视频。之前的实现:一进视口就 preload='auto' + play(),一屏十几张卡 → 十几个视频
 * 同时全量加载(还都走 worker R2 代理)→ 页面直接卡死。
 *
 * 现在:默认 preload='metadata' + `#t=0.1` 只取首帧当封面(不空白、几乎不占带宽),
 * 鼠标悬停才真正加载并播放(同一时刻通常只有 1 个在播)。src 缺失则渲染占位(不产生 404)。
 */
export function LazyVideo({ src, className }: { src?: string; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  if (!src) return <div className={className} style={{ background: '#17181b' }} aria-hidden />;
  return (
    <video
      ref={ref}
      src={`${src}#t=0.1`}
      muted
      loop
      playsInline
      preload="metadata"
      className={className}
      onMouseEnter={() => ref.current?.play().catch(() => {})}
      onMouseLeave={() => ref.current?.pause()}
    />
  );
}
