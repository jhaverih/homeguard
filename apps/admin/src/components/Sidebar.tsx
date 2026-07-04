'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';

const links = [
  { href: '/', label: 'Dashboard', icon: '📊' },
  { href: '/calendar', label: 'Calendar', icon: '📅' },
  { href: '/pricing', label: 'Pricing', icon: '💰' },
  { href: '/vendors', label: 'Vendors', icon: '🔧' },
  { href: '/customers', label: 'Customers', icon: '🏠' },
  { href: '/subscriptions', label: 'Subscriptions', icon: '📋' },
  { href: '/payments', label: 'Payments', icon: '💳' },
  { href: '/disputes', label: 'Disputes', icon: '⚖️' },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-brand text-white flex flex-col min-h-screen">
      <div className="p-6 border-b border-brand-light">
        <h1 className="text-xl font-bold">🏠 HomeGuard</h1>
        <p className="text-sm text-blue-200 mt-1">Admin Dashboard</p>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={clsx(
              'flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors',
              pathname === link.href
                ? 'bg-white text-brand'
                : 'text-blue-100 hover:bg-brand-light',
            )}
          >
            <span>{link.icon}</span>
            {link.label}
          </Link>
        ))}
      </nav>
      <div className="p-4 border-t border-brand-light space-y-2">
        <p className="text-xs text-blue-200">HomeGuard Platform v1.0</p>
        <button
          onClick={() => {
            localStorage.removeItem('admin_token');
            window.location.replace('/login');
          }}
          className="w-full text-left text-xs text-blue-300 hover:text-white transition-colors"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
