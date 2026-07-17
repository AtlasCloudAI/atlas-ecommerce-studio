'use client';

import { useEffect, useState } from 'react';

/**
 * 避免依赖 client-only 状态(next-auth session / localStorage locale 等)的组件在 hydration
 * 首帧与 SSR 渲染不一致(React #418/#423)。首帧统一返回 false(与 SSR 对齐渲染占位/null),
 * mounted 之后(useEffect 只在客户端跑)才渲染真实状态。
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
