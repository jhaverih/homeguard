import type { Metadata } from 'next';
// Bundled locally (./fonts) instead of next/font/google: the Google variant
// downloads the fonts during `next build`, and that download failing on the
// QNAP build host broke deploys. Same families, weights and CSS variables.
import localFont from 'next/font/local';
import './globals.css';
import { AuthGuard } from '@/components/AuthGuard';

const newsreader = localFont({ src: './fonts/Newsreader-Variable-latin.woff2', weight: '500 600', variable: '--font-display', display: 'swap' });
const karla = localFont({ src: './fonts/Karla-Variable-latin.woff2', weight: '400 700', variable: '--font-body', display: 'swap' });

export const metadata: Metadata = {
  title: 'Attenteve Vendor Portal',
  description: 'Attenteve Vendor Company Portal',
  icons: { icon: '/icon.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${newsreader.variable} ${karla.variable}`}>
      <body className="bg-canvas text-ink font-sans">
        <AuthGuard>{children}</AuthGuard>
      </body>
    </html>
  );
}
