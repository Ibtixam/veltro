'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

type PlanTier = 'STARTER' | 'PRO' | 'ENTERPRISE' | 'LIFETIME';
type BillingCycle = 'MONTHLY' | 'ANNUAL' | 'LIFETIME';
type PaymentMethod = 'PAYBRIDGE_AFRICA' | 'STRIPE' | 'ORANGE_MONEY' | 'MTN_MOMO';

interface PlanPricing {
  plan: PlanTier;
  currency: string;
  monthly: number;
  annual: number;
  monthlyFormatted: string;
  annualFormatted: string;
}

interface PaymentFormProps {
  plan: PlanTier;
  onSuccess?: () => void;
}

const PLANS_CONFIG: Record<PlanTier, { name: string; features: string[]; popular?: boolean }> = {
  STARTER: {
    name: 'Starter',
    features: ['5 audits/month', 'SEO + GEO scores', 'PDF report', 'Email support'],
  },
  PRO: {
    name: 'Pro',
    features: ['Unlimited audits', 'Keywords + competitors', 'RGPD compliance', 'White-label PDF', 'Programmatic SEO engine', 'Growth recommendations', 'Weekly report'],
    popular: true,
  },
  ENTERPRISE: {
    name: 'Enterprise',
    features: ['API access unlimited', '1M+ concurrent users', 'Custom AI prompts', 'Dedicated support', 'SLA 99.9%', 'Multi-domain dashboard'],
  },
  LIFETIME: {
    name: 'Lifetime',
    features: ['Everything in Pro', 'Future updates', 'Priority onboarding', '5 team seats'],
  },
};

const MOBILE_MONEY_COUNTRIES: Record<string, { label: string; providers: PaymentMethod[] }> = {
  CM: { label: 'Cameroun 🇨🇲', providers: ['ORANGE_MONEY', 'MTN_MOMO'] },
  GA: { label: 'Gabon 🇬🇦', providers: ['ORANGE_MONEY'] },
  SN: { label: 'Sénégal 🇸🇳', providers: ['ORANGE_MONEY', 'MTN_MOMO'] },
  CI: { label: "Côte d'Ivoire 🇨🇮", providers: ['ORANGE_MONEY', 'MTN_MOMO'] },
  GH: { label: 'Ghana 🇬🇭', providers: ['MTN_MOMO'] },
  NG: { label: 'Nigeria 🇳🇬', providers: ['MTN_MOMO'] },
};

export function PaymentForm({ plan, onSuccess }: PaymentFormProps) {
  const router = useRouter();
  const [pricing, setPricing] = useState<PlanPricing | null>(null);
  const [billing, setBilling] = useState<BillingCycle>('MONTHLY');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('PAYBRIDGE_AFRICA');
  const [countryCode, setCountryCode] = useState('FR');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<'method' | 'details' | 'processing'>('method');

  // Auto-detect country from IP
  useEffect(() => {
    fetch('https://ipapi.co/json/')
      .then(r => r.json())
      .then(d => {
        if (d.country_code) setCountryCode(d.country_code);
      })
      .catch(() => {});
  }, []);

  // Fetch pricing for detected country
  useEffect(() => {
    fetch(`/api/payment/pricing/${countryCode}`)
      .then(r => r.json())
      .then((data: { plans: PlanPricing[] }) => {
        const found = data.plans.find(p => p.plan === plan);
        if (found) setPricing(found);
      })
      .catch(() => {});
  }, [countryCode, plan]);

  const isMobileMoneyCountry = countryCode in MOBILE_MONEY_COUNTRIES;
  const availableProviders = MOBILE_MONEY_COUNTRIES[countryCode]?.providers ?? [];
  const isCard = paymentMethod === 'PAYBRIDGE_AFRICA' || paymentMethod === 'STRIPE';
  const isMobile = paymentMethod === 'ORANGE_MONEY' || paymentMethod === 'MTN_MOMO';

  const displayPrice = pricing
    ? billing === 'ANNUAL'
      ? pricing.annualFormatted
      : billing === 'LIFETIME'
      ? pricing.monthlyFormatted // lifetime uses its own price
      : pricing.monthlyFormatted
    : '…';

  async function handleSubmit() {
    if (!email) { setError('Email requis'); return; }
    if (isMobile && !phoneNumber) { setError('Numéro de téléphone requis'); return; }

    setLoading(true);
    setError('');
    setStep('processing');

    try {
      const res = await fetch('/api/payment/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, billingCycle: billing, countryCode, phoneNumber, paymentMethod, email }),
      });

      const data = await res.json();

      if (data.error) {
        setError(typeof data.error === 'string' ? data.error : 'Erreur de paiement');
        setStep('details');
        return;
      }

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }

      if (data.type === 'mobile_money') {
        router.push(`/payment/mobile-money?ref=${data.reference}&instructions=${encodeURIComponent(data.instructions)}`);
        return;
      }

      onSuccess?.();
    } catch {
      setError('Erreur réseau. Veuillez réessayer.');
      setStep('details');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="payment-form-wrapper">
      <style>{`
        .payment-form-wrapper {
          background: #0A0D14;
          border: 1px solid #1E2840;
          border-radius: 16px;
          padding: 28px;
          max-width: 480px;
          width: 100%;
          font-family: 'DM Mono', 'Courier New', monospace;
          color: #E8EDF8;
        }
        .pf-title { font-size: 18px; font-weight: 700; color: #E8EDF8; margin-bottom: 4px; }
        .pf-sub { font-size: 12px; color: #6B7A99; margin-bottom: 20px; }
        .pf-section-label { font-size: 10px; letter-spacing: 1.5px; color: #6B7A99; margin-bottom: 8px; text-transform: uppercase; }
        .pf-billing-row { display: flex; gap: 8px; margin-bottom: 20px; }
        .pf-billing-btn { flex: 1; padding: 10px; border: 1px solid #1E2840; border-radius: 8px; background: transparent; color: #A8B4CC; cursor: pointer; font-size: 12px; font-family: inherit; transition: all 0.2s; text-align: center; }
        .pf-billing-btn.active { border-color: #00FFD1; color: #00FFD1; background: rgba(0,255,209,0.06); }
        .pf-method-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 20px; }
        .pf-method-card { padding: 12px; border: 1px solid #1E2840; border-radius: 10px; cursor: pointer; transition: all 0.2s; text-align: center; }
        .pf-method-card:hover { border-color: #2A3450; }
        .pf-method-card.active { border-color: #7C5CFC; background: rgba(124,92,252,0.08); }
        .pf-method-icon { font-size: 20px; margin-bottom: 4px; }
        .pf-method-name { font-size: 11px; color: #A8B4CC; font-weight: 600; }
        .pf-method-desc { font-size: 10px; color: #6B7A99; margin-top: 2px; }
        .pf-field { margin-bottom: 12px; }
        .pf-field label { display: block; font-size: 10px; letter-spacing: 1px; color: #6B7A99; margin-bottom: 5px; }
        .pf-field input, .pf-field select { width: 100%; background: #060910; border: 1px solid #1E2840; border-radius: 8px; padding: 10px 14px; color: #E8EDF8; font-family: inherit; font-size: 13px; outline: none; transition: border 0.2s; box-sizing: border-box; }
        .pf-field input:focus, .pf-field select:focus { border-color: #00FFD1; }
        .pf-field select option { background: #111520; }
        .pf-price-box { background: #060910; border: 1px solid #1E2840; border-radius: 10px; padding: 16px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
        .pf-price-label { font-size: 12px; color: #6B7A99; }
        .pf-price-amount { font-size: 22px; font-weight: 700; color: #00FFD1; }
        .pf-price-period { font-size: 11px; color: #6B7A99; }
        .pf-btn { width: 100%; background: #00FFD1; color: #060910; border: none; border-radius: 10px; padding: 14px; font-size: 14px; font-weight: 700; cursor: pointer; font-family: inherit; letter-spacing: 0.5px; transition: all 0.2s; }
        .pf-btn:hover:not(:disabled) { background: #00E0BC; transform: translateY(-1px); }
        .pf-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
        .pf-error { background: rgba(255,77,106,0.1); border: 1px solid rgba(255,77,106,0.3); border-radius: 8px; padding: 10px 14px; font-size: 12px; color: #FF4D6A; margin-bottom: 12px; }
        .pf-secure { display: flex; align-items: center; gap: 6px; font-size: 10px; color: #3D4E6B; text-align: center; justify-content: center; margin-top: 10px; }
        .pf-processing { text-align: center; padding: 20px 0; }
        .pf-spinner { width: 40px; height: 40px; border: 2px solid #1E2840; border-top-color: #00FFD1; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 16px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .pf-features { display: flex; flex-direction: column; gap: 4px; margin-bottom: 20px; padding: 14px; background: #060910; border-radius: 10px; border: 1px solid #1E2840; }
        .pf-feature { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #A8B4CC; }
        .pf-feature::before { content: ''; width: 5px; height: 5px; border-radius: 50%; background: #00FFD1; flex-shrink: 0; }
        .pf-country-row { display: flex; gap: 8px; }
        .pf-country-row .pf-field { flex: 1; }
      `}</style>

      <div className="pf-title">Plan {PLANS_CONFIG[plan].name}</div>
      <div className="pf-sub">Accès immédiat après paiement · RGPD conforme · Sans engagement (sauf Lifetime)</div>

      {step === 'processing' ? (
        <div className="pf-processing">
          <div className="pf-spinner" />
          <div style={{ fontSize: '14px', color: '#E8EDF8', marginBottom: 8 }}>Traitement en cours...</div>
          <div style={{ fontSize: '12px', color: '#6B7A99' }}>Redirection vers le prestataire de paiement sécurisé</div>
        </div>
      ) : (
        <>
          {/* Features */}
          <div className="pf-features">
            {PLANS_CONFIG[plan].features.map(f => (
              <div key={f} className="pf-feature">{f}</div>
            ))}
          </div>

          {/* Billing cycle */}
          {plan !== 'LIFETIME' && (
            <>
              <div className="pf-section-label">Période de facturation</div>
              <div className="pf-billing-row">
                <button className={`pf-billing-btn ${billing === 'MONTHLY' ? 'active' : ''}`} onClick={() => setBilling('MONTHLY')}>
                  Mensuel
                </button>
                <button className={`pf-billing-btn ${billing === 'ANNUAL' ? 'active' : ''}`} onClick={() => setBilling('ANNUAL')}>
                  Annuel <span style={{ color: '#00E5A0', fontSize: 10 }}>-17%</span>
                </button>
              </div>
            </>
          )}

          {/* Payment method */}
          <div className="pf-section-label">Méthode de paiement</div>
          <div className="pf-method-grid">
            <div className={`pf-method-card ${paymentMethod === 'PAYBRIDGE_AFRICA' ? 'active' : ''}`}
              onClick={() => setPaymentMethod('PAYBRIDGE_AFRICA')}>
              <div className="pf-method-icon">🌍</div>
              <div className="pf-method-name">PayBridge Africa</div>
              <div className="pf-method-desc">Carte · Afrique · EU</div>
            </div>
            <div className={`pf-method-card ${paymentMethod === 'STRIPE' ? 'active' : ''}`}
              onClick={() => setPaymentMethod('STRIPE')}>
              <div className="pf-method-icon">💳</div>
              <div className="pf-method-name">Stripe</div>
              <div className="pf-method-desc">Visa · MC · AMEX</div>
            </div>
            {isMobileMoneyCountry && availableProviders.includes('ORANGE_MONEY') && (
              <div className={`pf-method-card ${paymentMethod === 'ORANGE_MONEY' ? 'active' : ''}`}
                onClick={() => setPaymentMethod('ORANGE_MONEY')}>
                <div className="pf-method-icon">🟠</div>
                <div className="pf-method-name">Orange Money</div>
                <div className="pf-method-desc">Mobile · {MOBILE_MONEY_COUNTRIES[countryCode]?.label}</div>
              </div>
            )}
            {isMobileMoneyCountry && availableProviders.includes('MTN_MOMO') && (
              <div className={`pf-method-card ${paymentMethod === 'MTN_MOMO' ? 'active' : ''}`}
                onClick={() => setPaymentMethod('MTN_MOMO')}>
                <div className="pf-method-icon">💛</div>
                <div className="pf-method-name">MTN MoMo</div>
                <div className="pf-method-desc">Mobile · {MOBILE_MONEY_COUNTRIES[countryCode]?.label}</div>
              </div>
            )}
          </div>

          {/* Fields */}
          <div className="pf-field">
            <label>EMAIL</label>
            <input type="email" placeholder="vous@entreprise.com" value={email} onChange={e => setEmail(e.target.value)} />
          </div>

          <div className="pf-country-row">
            <div className="pf-field">
              <label>PAYS</label>
              <select value={countryCode} onChange={e => setCountryCode(e.target.value)}>
                <option value="CM">🇨🇲 Cameroun</option>
                <option value="GA">🇬🇦 Gabon</option>
                <option value="SN">🇸🇳 Sénégal</option>
                <option value="CI">🇨🇮 Côte d&apos;Ivoire</option>
                <option value="GH">🇬🇭 Ghana</option>
                <option value="NG">🇳🇬 Nigeria</option>
                <option value="FR">🇫🇷 France</option>
                <option value="BE">🇧🇪 Belgique</option>
                <option value="CA">🇨🇦 Canada</option>
                <option value="US">🇺🇸 USA</option>
                <option value="GB">🇬🇧 UK</option>
              </select>
            </div>
          </div>

          {isMobile && (
            <div className="pf-field">
              <label>NUMÉRO DE TÉLÉPHONE</label>
              <input type="tel" placeholder="+237 6XX XXX XXX" value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} />
            </div>
          )}

          {/* Price */}
          <div className="pf-price-box">
            <div>
              <div className="pf-price-label">Total</div>
              <div className="pf-price-period">
                {plan === 'LIFETIME' ? 'Paiement unique' : billing === 'ANNUAL' ? 'par an · 2 mois offerts' : 'par mois'}
              </div>
            </div>
            <div className="pf-price-amount">{displayPrice}</div>
          </div>

          {error && <div className="pf-error">{error}</div>}

          <button className="pf-btn" onClick={handleSubmit} disabled={loading}>
            {loading ? 'Traitement...' : isCard ? 'PAYER EN SÉCURITÉ →' : 'INITIER LE PAIEMENT →'}
          </button>

          <div className="pf-secure">
            🔒 Paiement sécurisé SSL · RGPD conforme · Aucune carte stockée · Annulable à tout moment
          </div>
        </>
      )}
    </div>
  );
}
