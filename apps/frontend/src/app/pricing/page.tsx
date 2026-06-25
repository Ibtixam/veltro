'use client';
import { useState, useEffect } from 'react';
import { PaymentForm } from '../../components/payment/PaymentForm';

const PLANS = [
  { id: 'STARTER' as const, name: 'Starter', basePrice: '$29', period: '/mo', color: '#6B7280', features: ['5 audits/month', 'SEO + GEO scores', 'Keyword clusters (up to 20)', 'PDF report', 'Email support'] },
  { id: 'PRO' as const, name: 'Pro', basePrice: '$49', period: '/mo', color: '#4F46E5', popular: true, features: ['Unlimited audits', 'Full cluster engine', 'Video Agent (10 videos/mo)', 'RGPD compliance check', 'White-label PDF', 'Weekly growth reports', 'PayBridge + Stripe + Mobile Money', 'Priority support'] },
  { id: 'LIFETIME' as const, name: 'Lifetime', basePrice: '$499', period: ' once', color: '#059669', features: ['Everything in Pro', 'Future updates included', '5 team seats', 'Priority onboarding', 'No recurring fees — ever'] },
];

export default function PricingPage() {
  const [selected, setSelected] = useState<'STARTER'|'PRO'|'LIFETIME' | null>(null);
  const [country, setCountry] = useState('FR');

  useEffect(() => {
    fetch('https://ipapi.co/json/').then(r => r.json()).then(d => { if (d.country_code) setCountry(d.country_code); }).catch(() => {});
  }, []);

  return (
    <main style={{ minHeight: '100vh', background: '#F7F8FC', padding: '60px 20px' }}>
      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <h1 style={{ fontSize: 36, fontWeight: 800, color: '#1A1D2E', letterSpacing: -1, marginBottom: 8 }}>Simple, results-based pricing</h1>
        <p style={{ fontSize: 16, color: '#6B7280' }}>Pay in your currency · PayBridge Africa · Stripe · Orange Money · MTN MoMo</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, maxWidth: 900, margin: '0 auto 40px' }}>
        {PLANS.map(plan => (
          <div key={plan.id} onClick={() => setSelected(plan.id)}
            style={{ background: '#fff', border: selected === plan.id ? `2px solid ${plan.color}` : plan.popular ? `2px solid #C7D2FE` : '1px solid #E8EBF4', borderRadius: 14, padding: 24, cursor: 'pointer', position: 'relative', transition: 'all 0.2s' }}>
            {plan.popular && <div style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)', background: '#4F46E5', color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 12px', borderRadius: 20, letterSpacing: 0.5 }}>MOST POPULAR</div>}
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1A1D2E', marginBottom: 4 }}>{plan.name}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: plan.color, marginBottom: 16 }}>{plan.basePrice}<span style={{ fontSize: 13, color: '#9CA3AF', fontWeight: 400 }}>{plan.period}</span></div>
            {plan.features.map(f => (
              <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#374151', marginBottom: 6 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: plan.color, flexShrink: 0 }} />{f}
              </div>
            ))}
            <button onClick={() => setSelected(plan.id)} style={{ width: '100%', marginTop: 20, background: selected === plan.id ? plan.color : 'transparent', color: selected === plan.id ? '#fff' : plan.color, border: `1px solid ${plan.color}`, borderRadius: 8, padding: '10px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              {selected === plan.id ? 'Selected ✓' : 'Choose plan'}
            </button>
          </div>
        ))}
      </div>

      {selected && (
        <div style={{ maxWidth: 480, margin: '0 auto' }}>
          <PaymentForm plan={selected} onSuccess={() => { window.location.href = '/dashboard?payment=success'; }} />
        </div>
      )}
    </main>
  );
}
