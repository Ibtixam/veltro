'use client';
import { useState } from 'react';

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<'audit'|'clusters'|'video'|'reports'>('audit');

  return (
    <main style={{ minHeight: '100vh', background: '#F7F8FC' }}>
      <nav style={{ background: '#fff', borderBottom: '1px solid #E8EBF4', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56 }}>
        <span style={{ fontWeight: 700, fontSize: 16, color: '#1A1D2E' }}>Veltro Dashboard</span>
        <span style={{ fontSize: 12, color: '#6B7280' }}>Pro Plan · Active</span>
      </nav>

      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #E8EBF4', background: '#fff', overflowX: 'auto' }}>
        {(['audit', 'clusters', 'video', 'reports'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            style={{ padding: '12px 20px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12, fontWeight: 600, letterSpacing: 0.5, color: activeTab === tab ? '#4F46E5' : '#9CA3AF', borderBottom: activeTab === tab ? '2px solid #4F46E5' : '2px solid transparent', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
            {tab === 'audit' ? 'SEO Audit' : tab === 'clusters' ? 'Keyword Clusters' : tab === 'video' ? 'Video Studio' : 'Reports'}
          </button>
        ))}
      </div>

      <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
        {activeTab === 'audit' && (
          <div>
            <p style={{ color: '#6B7280', marginBottom: 16, fontSize: 14 }}>Enter any URL to run a full SEO + GEO + Conversion audit.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <input type="url" placeholder="https://yourwebsite.com" style={{ flex: 1, border: '1px solid #D1D5DB', borderRadius: 8, padding: '10px 14px', fontSize: 14, outline: 'none' }} />
              <button style={{ background: '#4F46E5', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>RUN AUDIT →</button>
            </div>
          </div>
        )}
        {activeTab === 'clusters' && (
          <p style={{ color: '#6B7280', fontSize: 14 }}>Keyword cluster analysis loads here. Enter a URL or seed keywords to generate Veltro cluster scores.</p>
        )}
        {activeTab === 'video' && (
          <p style={{ color: '#6B7280', fontSize: 14 }}>Video Studio: generate scripts, fetch stock footage, synthesize voice, render and publish — all from one interface.</p>
        )}
        {activeTab === 'reports' && (
          <p style={{ color: '#6B7280', fontSize: 14 }}>Weekly growth reports: sessions, leads, conversions, revenue deltas. Sent every Monday 8AM. View history here.</p>
        )}
      </div>
    </main>
  );
}
