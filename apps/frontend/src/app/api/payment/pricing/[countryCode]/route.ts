import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ countryCode: string }> },
) {
  const { countryCode } = await params;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';
  // Respect Cloudflare country header over param
  const country = req.headers.get('cf-ipcountry') ?? countryCode ?? 'FR';

  try {
    const res = await fetch(`${apiUrl}/payment/pricing/${country}`);
    const data = await res.json();
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=3600' },
    });
  } catch {
    // Fallback pricing if backend unreachable
    return NextResponse.json({
      currency: 'EUR',
      countryCode: country,
      plans: [
        { plan: 'STARTER', currency: 'EUR', monthly: 2900, annual: 29000, monthlyFormatted: '29,00 €', annualFormatted: '290,00 €' },
        { plan: 'PRO',     currency: 'EUR', monthly: 4900, annual: 49000, monthlyFormatted: '49,00 €', annualFormatted: '490,00 €' },
        { plan: 'LIFETIME',currency: 'EUR', monthly: 49900, annual: 49900, monthlyFormatted: '499,00 €', annualFormatted: '499,00 €' },
      ],
    });
  }
}
