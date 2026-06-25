'use client';
import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? '';
const STAGES = ['LEAD','DISCOVERY','PROPOSAL','NEGOTIATION','CLOSED_WON','CLOSED_LOST'] as const;

async function authedGet<T>(path: string): Promise<T | null> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('veltro_token') : null;
    const res = await fetch(`${API}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    return res.ok ? res.json() : null;
  } catch { return null; }
}

export default function CrmPage() {
  const [metrics, setMetrics] = useState<any>(null);
  const [contacts, setContacts] = useState<any[]>([]);
  const [pipeline, setPipeline] = useState<any>(null);
  const [view, setView] = useState<'contacts' | 'pipeline'>('pipeline');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setMetrics(await authedGet('/api/crm/metrics'));
      setContacts((await authedGet('/api/crm/contacts')) ?? []);
      setPipeline(await authedGet('/api/crm/pipeline'));
      setLoading(false);
    })();
  }, []);

  return (
    <main className="wrap section">
      <p className="folio">Veltro · CRM</p>
      <h1 style={{ marginBottom: 24 }}>Pipeline</h1>

      {loading && <p className="lead">Loading…</p>}

      {metrics && (
        <section className="band" style={{ rowGap: 16, marginBottom: 40 }}>
          <Stat className="c3" label="Contacts" value={metrics.totalContacts} />
          <Stat className="c3" label="Open deals" value={metrics.openDeals} />
          <Stat className="c3" label="Pipeline value" value={`€${Number(metrics.pipelineValue).toLocaleString()}`} />
          <Stat className="c3" label="Win rate" value={`${metrics.winRate}%`} accent />
        </section>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button className="btn" onClick={() => setView('pipeline')} style={view === 'pipeline' ? { background: 'var(--ink)', color: '#fff' } : undefined}>Pipeline</button>
        <button className="btn" onClick={() => setView('contacts')} style={view === 'contacts' ? { background: 'var(--ink)', color: '#fff' } : undefined}>Contacts</button>
      </div>

      {view === 'pipeline' && pipeline && (
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 12 }}>
          {STAGES.map(stage => (
            <div key={stage} style={{ flex: '0 0 220px', borderTop: `3px solid ${stage === 'CLOSED_WON' ? 'var(--swiss-red)' : 'var(--ink)'}` }}>
              <div className="folio" style={{ padding: '8px 0' }}>{stage.replace('_', ' ')} · {pipeline[stage]?.deals.length ?? 0}</div>
              <div className="data" style={{ marginBottom: 8 }}>€{Number(pipeline[stage]?.total ?? 0).toLocaleString()}</div>
              <div className="stack">
                {(pipeline[stage]?.deals ?? []).map((d: any) => (
                  <div key={d.id} className="card" style={{ padding: 12 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{d.title}</div>
                    <div className="data" style={{ color: 'var(--muted)' }}>{d.contact?.company ?? d.contact?.name}</div>
                    <div className="data">€{Number(d.value).toLocaleString()} · {d.probability}%</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {view === 'contacts' && (
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr><th>name</th><th>company</th><th>status</th><th>source</th><th>country</th></tr></thead>
            <tbody>
              {contacts.length === 0 && <tr><td colSpan={5}>No contacts yet.</td></tr>}
              {contacts.map(c => (
                <tr key={c.id}>
                  <td>{c.name}</td><td>{c.company ?? '—'}</td>
                  <td><span className="tag">{c.status}</span></td>
                  <td>{c.source ?? '—'}</td><td>{c.country ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

function Stat({ label, value, accent, className }: { label: string; value: any; accent?: boolean; className?: string }) {
  return (
    <div className={className} style={{ borderTop: `3px solid ${accent ? 'var(--swiss-red)' : 'var(--ink)'}`, paddingTop: 12 }}>
      <div className="folio">{label}</div>
      <div style={{ fontFamily: 'var(--display)', fontWeight: 800, fontSize: 40, lineHeight: 1.1 }}>{value}</div>
    </div>
  );
}
