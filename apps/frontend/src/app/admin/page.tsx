'use client';
import { useEffect, useState } from 'react';

// VELTRO Admin Dashboard — metrics, users, payments, subscriptions.
// Gated server-side by /api/admin/* (JwtAuthGuard + RolesGuard ADMIN).

interface Metrics { totalUsers: number; activeSubscriptions: number; lifetimeRevenue: number; totalSites: number; pendingApprovals: number; }
interface Row { [k: string]: any; }

const API = process.env.NEXT_PUBLIC_API_URL ?? '';

async function authedGet<T>(path: string): Promise<T | null> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('veltro_token') : null;
    const res = await fetch(`${API}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

export default function AdminPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [users, setUsers] = useState<Row[]>([]);
  const [tab, setTab] = useState<'users' | 'payments' | 'subscriptions'>('users');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const m = await authedGet<Metrics>('/admin/metrics');
      setMetrics(m);
      setUsers((await authedGet<Row[]>('/admin/users')) ?? []);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      if (tab === 'users') { setRows(users); return; }
      const data = await authedGet<Row[]>(`/admin/${tab}`);
      setRows(data ?? []);
    })();
  }, [tab, users]);

  return (
    <main className="wrap section">
      <p className="folio">Veltro · Admin</p>
      <h1 style={{ marginBottom: 32 }}>Control room</h1>

      {loading && <p className="lead">Loading metrics…</p>}
      {!loading && !metrics && (
        <div className="stack">
          <p className="lead">No admin data. Sign in with an admin account to view the control room.</p>
          <a className="btn btn--primary" href="/">Back to site</a>
        </div>
      )}

      {metrics && (
        <>
          <section className="band" style={{ rowGap: 16, marginBottom: 48 }}>
            <Stat className="c3" label="Users" value={metrics.totalUsers} />
            <Stat className="c3" label="Active subscriptions" value={metrics.activeSubscriptions} />
            <Stat className="c3" label="Lifetime revenue" value={metrics.lifetimeRevenue.toLocaleString()} />
            <Stat className="c3" label="Pending approvals" value={metrics.pendingApprovals} accent />
          </section>

          <hr className="rule rule--red" />

          <nav style={{ display: 'flex', gap: 8, margin: '24px 0' }}>
            {(['users', 'payments', 'subscriptions'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className="btn" aria-pressed={tab === t}
                style={tab === t ? { background: 'var(--ink)', color: 'var(--paper)' } : undefined}>
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </nav>

          <DataTable rows={rows} />
        </>
      )}
    </main>
  );
}

function Stat({ label, value, accent, className }: { label: string; value: number | string; accent?: boolean; className?: string }) {
  return (
    <div className={className} style={{ borderTop: `3px solid ${accent ? 'var(--swiss-red)' : 'var(--ink)'}`, paddingTop: 12 }}>
      <div className="folio">{label}</div>
      <div style={{ fontFamily: 'var(--display)', fontWeight: 800, fontSize: 44, lineHeight: 1.1 }}>{value}</div>
    </div>
  );
}

function DataTable({ rows }: { rows: Row[] }) {
  if (!rows.length) return <p className="lead">No records.</p>;
  const cols = Object.keys(rows[0]);
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr>{cols.map(c => <th key={c} className="folio" style={{ textAlign: 'start', padding: '8px 12px', borderBottom: '2px solid var(--ink)' }}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{cols.map(c => <td key={c} style={{ padding: '8px 12px', borderBottom: '1px solid var(--hairline)' }}>{String(r[c] ?? '—')}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
