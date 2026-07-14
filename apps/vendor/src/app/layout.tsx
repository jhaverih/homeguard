import type { Metadata } from 'next';
import { Newsreader, Karla } from 'next/font/google';
import './globals.css';
import { AuthGuard } from '@/components/AuthGuard';

const newsreader = Newsreader({ subsets: ['latin'], weight: ['500', '600'], variable: '--font-display' });
const karla = Karla({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-body' });

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
