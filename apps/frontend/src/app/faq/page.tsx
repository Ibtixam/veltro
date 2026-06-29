'use client';
import { useEffect, useState } from 'react';
import VideoPlaceholder from '../../components/video/VideoPlaceholder';

const API = process.env.NEXT_PUBLIC_API_URL ?? '';

interface Faq { id: string; category: string; question: string; answer: string; }

export default function FaqPage() {
  const [items, setItems] = useState<Faq[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [locale, setLocale] = useState('en');

  useEffect(() => {
    const l = (typeof document !== 'undefined' && document.documentElement.lang) || 'en';
    setLocale(l);
    fetch(`${API}/content/faq?locale=${l}`).then(r => r.ok ? r.json() : []).then(setItems).catch(() => setItems([]));
  }, []);

  const categories = [...new Set(items.map(i => i.category))];

  return (
    <main className="wrap section">
      <p className="folio">Questions &amp; Answers</p>
      <h1 style={{ marginBottom: 8 }}>Everything you need to know</h1>
      <p className="lead" style={{ marginBottom: 32 }}>Short answers, structured so AI engines can cite them too.</p>

      <div className="band" style={{ rowGap: 32 }}>
        <div className="c8">
          {categories.map(cat => (
            <section key={cat} style={{ marginBottom: 28 }}>
              <p className="folio" style={{ color: 'var(--swiss-red)', marginBottom: 12 }}>{cat}</p>
              <div className="stack">
                {items.filter(i => i.category === cat).map(i => (
                  <div key={i.id} style={{ borderBottom: '1px solid var(--hairline)' }}>
                    <button
                      onClick={() => setOpen(open === i.id ? null : i.id)}
                      aria-expanded={open === i.id}
                      style={{ width: '100%', textAlign: 'start', background: 'none', border: 0, padding: '14px 0', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'baseline' }}
                    >
                      <span style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 18 }}>{i.question}</span>
                      <span className="data" style={{ color: 'var(--swiss-red)' }}>{open === i.id ? '−' : '+'}</span>
                    </button>
                    {open === i.id && <p style={{ paddingBottom: 16, color: '#333' }}>{i.answer}</p>}
                  </div>
                ))}
              </div>
            </section>
          ))}
          {items.length === 0 && <p className="lead">Loading questions…</p>}
        </div>

        <aside className="c4 stack-lg">
          <VideoPlaceholder title="Veltro in 90 seconds" label="Tutorial · 90s" aspect="16/9" />
          <div className="card stack" style={{ borderColor: 'var(--swiss-red)' }}>
            <p className="folio">Still have questions?</p>
            <p style={{ fontSize: 14 }}>Start the 7-day free trial — no card required — and see your first analysis in 10 minutes.</p>
            <a className="btn btn--primary" href="/">Start free</a>
          </div>
        </aside>
      </div>
    </main>
  );
}
