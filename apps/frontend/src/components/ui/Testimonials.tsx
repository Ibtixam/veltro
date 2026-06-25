'use client';
import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? '';
interface T { id: string; name: string; role?: string; company?: string; country?: string; quote: string; rating: number; }

export default function Testimonials({ featuredOnly = false }: { featuredOnly?: boolean }) {
  const [items, setItems] = useState<T[]>([]);

  useEffect(() => {
    const l = (typeof document !== 'undefined' && document.documentElement.lang) || 'en';
    fetch(`${API}/api/content/testimonials?locale=${l}${featuredOnly ? '&featured=true' : ''}`)
      .then(r => r.ok ? r.json() : []).then(setItems).catch(() => setItems([]));
  }, [featuredOnly]);

  if (!items.length) return null;

  return (
    <section className="wrap section">
      <p className="folio">What teams say</p>
      <h2 style={{ marginBottom: 28 }}>Built for revenue, not vanity metrics</h2>
      <div className="band" style={{ rowGap: 20 }}>
        {items.map(t => (
          <figure key={t.id} className="c4 card stack" style={{ margin: 0 }}>
            <div aria-label={`${t.rating} out of 5`} style={{ color: 'var(--swiss-red)', letterSpacing: 2 }}>{'★'.repeat(t.rating)}</div>
            <blockquote style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 18, lineHeight: 1.3, margin: 0 }}>“{t.quote}”</blockquote>
            <figcaption className="data" style={{ color: 'var(--muted)' }}>
              {t.name}{t.role ? `, ${t.role}` : ''}{t.company ? ` · ${t.company}` : ''}{t.country ? ` (${t.country})` : ''}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
