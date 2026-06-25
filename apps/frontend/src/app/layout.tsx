import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { Inter, Archivo, Space_Mono } from 'next/font/google';
import GridOverlay from '../components/layout/GridOverlay';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const archivo = Archivo({ subsets: ['latin'], weight: ['600','700','800'], variable: '--font-archivo', display: 'swap' });
const spaceMono = Space_Mono({ subsets: ['latin'], weight: ['400','700'], variable: '--font-space-mono', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'https://veltro.io'),
  title: { default: 'Veltro — Revenue Discovery Engine', template: '%s | Veltro' },
  description: 'What should you do today to generate the most revenue from search? Veltro answers every week — with working code, not reports.',
  keywords: ['SEO', 'GEO', 'AI search', 'revenue', 'keyword clusters', 'Africa', 'auto-deploy'],
  authors: [{ name: 'Veltro' }],
  openGraph: {
    type: 'website', siteName: 'Veltro',
    title: 'Veltro — Revenue Discovery Engine',
    description: 'Weekly SEO + GEO analysis → working pages → delivered automatically. Works on any stack.',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 5 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const h = await headers();
  const locale = h.get('x-veltro-locale') ?? 'en';
  const dir = h.get('x-veltro-dir') ?? 'ltr';

  return (
    <html lang={locale} dir={dir} className={`${inter.variable} ${archivo.variable} ${spaceMono.variable}`} suppressHydrationWarning>
      <head />
      <body>
        {children}
        <GridOverlay />
      </body>
    </html>
  );
}
