'use client';

import { Globe } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { LOCALES, LOCALE_NAMES, type Locale } from '@/i18n/messages';

export function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();
  return (
    <div className="relative">
      <Globe className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
      <select
        aria-label="Language"
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
        className="cursor-pointer appearance-none rounded-lg border border-neutral-200 bg-white py-2 pl-8 pr-6 text-sm font-medium text-neutral-600 outline-none transition hover:border-neutral-300 focus:border-brand-400"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_NAMES[l]}
          </option>
        ))}
      </select>
    </div>
  );
}
