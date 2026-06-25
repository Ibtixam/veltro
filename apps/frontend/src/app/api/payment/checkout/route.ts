import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const token = req.headers.get('authorization') ?? req.cookies.get('veltro_token')?.value;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://backend:4000/api';

  // Attach client-specific metadata to every checkout
  const enrichedBody = {
    ...body,
    _clientMeta: {
      originUrl: req.headers.get('referer') ?? req.nextUrl.origin,
      userAgent: req.headers.get('user-agent'),
      timestamp: new Date().toISOString(),
      ipCountry: req.headers.get('cf-ipcountry') ?? body.countryCode ?? 'FR',
    },
  };

  const res = await fetch(`${apiUrl}/payment/checkout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(enrichedBody),
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
