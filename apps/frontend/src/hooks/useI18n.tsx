'use client';
import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { T, t as translate, detectLocale, LOCALE_META, RTL_LOCALES, SUPPORTED_LOCALES, type Locale } from '../i18n/translations';

interface I18nCtx {
  locale: Locale;
  dir: 'ltr' | 'rtl';
  setLocale: (l: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  locales: typeof SUPPORTED_LOCALES;
  meta: typeof LOCALE_META;
}

const Ctx = createContext<I18nCtx | null>(null);
const STORAGE_KEY = 'veltro_locale';

export function I18nProvider({ children, initial }: { children: React.ReactNode; initial?: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(initial ?? 'fr');
  // Cache of dynamically fetched locales (Tier-2, not embedded in T)
  const [remote, setRemote] = useState<Record<string, Record<string, string>>>({});

  // On mount: prefer stored choice, else browser language
  useEffect(() => {
    const stored = (typeof window !== 'undefined' && window.localStorage.getItem(STORAGE_KEY)) as Locale | null;
    const next = stored && (SUPPORTED_LOCALES as readonly string[]).includes(stored)
      ? stored
      : detectLocale(typeof navigator !== 'undefined' ? navigator.language : undefined);
    setLocaleState(next);
  }, []);

  // Apply dir + lang to <html> and persist
  useEffect(() => {
    const dir = RTL_LOCALES.has(locale) ? 'rtl' : 'ltr';
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale;
      document.documentElement.dir = dir;
    }
    if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, locale);

    // If locale has no embedded dictionary, fetch it from backend (dynamic AI i18n)
    if (!T[locale] && !remote[locale]) {
      fetch(`/api/i18n?locale=${locale}`)
        .then(r => (r.ok ? r.json() : null))
        .then(data => { if (data?.translations) setRemote(prev => ({ ...prev, [locale]: data.translations })); })
        .catch(() => { /* fall back to fr/en in t() */ });
    }
  }, [locale, remote]);

  const setLocale = useCallback((l: Locale) => setLocaleState(l), []);

  const t = useCallback((key: string, vars?: Record<string, string | number>) => {
    const r = remote[locale]?.[key];
    if (r) {
      let v = r;
      if (vars) for (const [k, val] of Object.entries(vars)) v = v.replace(new RegExp(`\\{\\{${k}\\}}`, 'g'), String(val));
      return v;
    }
    return translate(locale, key, vars);
  }, [locale, remote]);

  const value = useMemo<I18nCtx>(() => ({
    locale, dir: RTL_LOCALES.has(locale) ? 'rtl' : 'ltr', setLocale, t,
    locales: SUPPORTED_LOCALES, meta: LOCALE_META,
  }), [locale, setLocale, t]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
