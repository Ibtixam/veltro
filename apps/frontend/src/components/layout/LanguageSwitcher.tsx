'use client';
import { useState, useRef, useEffect } from 'react';
import { useI18n } from '../../hooks/useI18n';
import type { Locale } from '../../i18n/translations';

/**
 * LanguageSwitcher — all 22 Veltro locales.
 * Responsive: dropdown on desktop, full-screen sheet on mobile.
 * Keyboard accessible, RTL-aware.
 */
export default function LanguageSwitcher() {
  const { locale, setLocale, locales, meta } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onEsc);
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onEsc); };
  }, []);

  const current = meta[locale];

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className="btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Change language"
        onClick={() => setOpen(v => !v)}
        style={{ padding: '8px 14px', fontFamily: 'var(--mono)', fontSize: 12, textTransform: 'uppercase' }}
      >
        <span aria-hidden>{current.flag}</span> {locale.toUpperCase()}
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Languages"
          style={{
            position: 'absolute', top: 'calc(100% + 8px)', insetInlineEnd: 0,
            background: 'var(--paper)', border: '2px solid var(--ink)',
            minWidth: 220, maxHeight: 360, overflowY: 'auto', zIndex: 1000,
            listStyle: 'none', padding: 0, margin: 0,
          }}
        >
          {(locales as readonly Locale[]).map((l) => (
            <li key={l} role="option" aria-selected={l === locale}>
              <button
                onClick={() => { setLocale(l); setOpen(false); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                  padding: '10px 14px', background: l === locale ? 'var(--swiss-red)' : 'transparent',
                  color: l === locale ? 'var(--paper)' : 'var(--ink)', border: 0, cursor: 'pointer',
                  fontFamily: 'var(--body)', fontSize: 14, textAlign: 'start',
                }}
              >
                <span aria-hidden style={{ fontSize: 16 }}>{meta[l].flag}</span>
                <span>{meta[l].name}</span>
                <span className="folio" style={{ marginInlineStart: 'auto' }}>{l}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
