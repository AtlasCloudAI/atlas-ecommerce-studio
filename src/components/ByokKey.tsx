'use client';
import { useEffect, useState } from 'react';
import { useI18n } from '@/i18n/provider';
import { getByokKey, setByokKey, BYOK_EVENT } from '@/lib/byok';

/**
 * Small toolbar button + modal for BYOK. Placed on each studio page and on
 * pricing. When a key is saved, generations bill the user's Atlas account and
 * deduct no site credits.
 */
export function ByokKey({ className = '' }: { className?: string }) {
  const { locale } = useI18n();
  const zh = locale === 'zh';
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [active, setActive] = useState(false);

  useEffect(() => {
    const sync = () => setActive(!!getByokKey());
    sync();
    window.addEventListener(BYOK_EVENT, sync);
    return () => window.removeEventListener(BYOK_EVENT, sync);
  }, []);

  const openModal = () => {
    setDraft(getByokKey());
    setOpen(true);
  };
  const save = () => {
    setByokKey(draft);
    setOpen(false);
  };
  const clear = () => {
    setByokKey('');
    setDraft('');
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        title={zh ? '用自己的 Atlas Key 运行(不扣积分)' : 'Run with your own Atlas key (no credits used)'}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition ${
          active
            ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300'
            : 'border-white/15 bg-white/5 text-white/70 hover:border-white/30 hover:text-white'
        } ${className}`}
      >
        🔑 {active ? (zh ? '已用自己的 Key' : 'Your key active') : zh ? '用自己的 Key' : 'Use your key'}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-white/10 bg-[#1a1b1e] p-6 text-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold">{zh ? '用自己的 Atlas Key 运行' : 'Bring your own Atlas key'}</h3>
            <p className="mt-2 text-sm leading-relaxed text-white/60">
              {zh
                ? '填入你的 AtlasCloud API Key 后,本站每次生成都会直接计费到你自己的 Atlas 账户,不消耗本站积分。Key 只保存在你当前浏览器,不会上传到我们的服务器。'
                : 'With your AtlasCloud API key set, every generation is billed directly to your own Atlas account and uses zero site credits. The key is stored only in this browser and is never sent to our servers.'}
            </p>
            <input
              type="password"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="apikey-..."
              autoFocus
              className="mt-4 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm outline-none focus:border-[#7036F0]"
            />
            <a
              href="https://atlascloud.ai?utm_source=github&utm_campaign=ecommerce-studio"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-xs text-[#a78bfa] hover:underline"
            >
              {zh ? '没有 Key?去 AtlasCloud 免费获取 ↗' : 'No key? Get one free at AtlasCloud ↗'}
            </a>
            <div className="mt-5 flex items-center justify-between gap-3">
              <button type="button" onClick={clear} className="text-xs text-white/40 hover:text-white/70">
                {zh ? '清除并改用积分' : 'Clear & use credits'}
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white/70 hover:text-white"
                >
                  {zh ? '取消' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={save}
                  className="rounded-lg bg-[#7036F0] px-4 py-1.5 text-sm font-medium text-white hover:opacity-90"
                >
                  {zh ? '保存' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
