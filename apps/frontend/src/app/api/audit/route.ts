import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { url, lang } = body;

  if (!url) return NextResponse.json({ error: 'URL required' }, { status: 400 });

  let domain: string;
  try {
    domain = new URL(url).hostname.replace('www.', '');
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  // Forward to NestJS backend
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://backend:4000/api';
  const token = req.headers.get('authorization');

  try {
    const res = await fetch(`${apiUrl}/audit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: token } : {}),
      },
      body: JSON.stringify({ url, domain, lang: lang ?? 'auto' }),
    });

    const data = await res.json();

    // Client-specific customization: attach domain + timestamp to all results
    return NextResponse.json({
      ...data,
      _meta: {
        domain,
        url,
        analyzedAt: new Date().toISOString(),
        reportVersion: 'veltro-v2',
        clientUrl: url,
      },
    });
  } catch {
    // Fallback: return mock scores if backend unreachable
    return NextResponse.json({
      domain,
      url,
      seoScore: 0,
      status: 'backend_unavailable',
      message: 'Start backend with: npm run dev in apps/backend',
      _meta: { domain, url, analyzedAt: new Date().toISOString(), reportVersion: 'veltro-v2' },
    });
  }
}
