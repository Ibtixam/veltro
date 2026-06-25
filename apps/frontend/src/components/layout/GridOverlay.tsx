'use client';
import { useEffect, useState } from 'react';

/**
 * GridOverlay — Müller-Brockmann grid debug overlay.
 * Press "G" to toggle the 12-column + 8px-baseline guides.
 * Renders inside a .wrap so guides align to the same column lines as content.
 */
export default function GridOverlay() {
  const [on, setOn] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ignore when typing in inputs
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'g' || e.key === 'G') setOn(v => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="wrap" aria-hidden="true" style={{ position: 'fixed', inset: 0, height: '100%' }}>
      <div className={`guides${on ? ' on' : ''}`}>
        {Array.from({ length: 12 }).map((_, i) => <span key={i} />)}
      </div>
    </div>
  );
}
