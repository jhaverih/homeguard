import type { Metadata } from 'next';
import './globals.css';
import { Sidebar } from '@/components/Sidebar';

export const metadata: Metadata = {
  title: 'HomeGuard Admin',
  description: 'HomeGuard Platform Administration',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 flex h-screen">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-8">
          {children}
        </main>
      </body>
    </html>
  );
}
