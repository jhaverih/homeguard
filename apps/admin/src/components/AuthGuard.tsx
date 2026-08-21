'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';

const PUBLIC_PATHS = ['/login', '/forgot-password', '/reset-password'];

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const isPublic = PUBLIC_PATHS.includes(pathname);

  useEffect(() => {
    const checkAuth = () => {
      const token = localStorage.getItem('admin_token');
      if (!token && !isPublic) {
        router.replace('/login');
      } else {
        setReady(true);
      }
    };

    checkAuth();
    // Handle bfcache: browser may restore a cached page without re-running effects
    window.addEventListener('pageshow', checkAuth);
    return () => window.removeEventListener('pageshow', checkAuth);
  }, [pathname]);

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas">
        <div className="text-steel text-base">Loading...</div>
      </div>
    );
  }

  if (isPublic) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      {/* max-w caps line/column widths on wide monitors so content reads
          like a dashboard instead of stretching into mostly-empty rows —
          gutters grow past ~1700px instead of every page's cards/tables. */}
      <main className="flex-1 overflow-y-auto p-10">
        <div className="max-w-[1700px] mx-auto">{children}</div>
      </main>
    </div>
  );
}
