'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { usePermissions } from '@/lib/permissions';
import { Logo } from './Logo';

const baseLinks = [
  { href: '/', label: 'Dashboard', icon: '📊' },
  { href: '/jobs', label: 'Jobs', icon: '🧰' },
  { href: '/customers', label: 'Customers', icon: '🏠' },
  { href: '/payments', label: 'Payments', icon: '💳' },
  { href: '/disputes', label: 'Disputes', icon: '⚖️' },
  { href: '/capabilities', label: 'My Capabilities', icon: '🎓' },
  { href: '/status', label: 'Status & Plan', icon: '⭐' },
];

export function Sidebar() {
  const pathname = usePathname();
  const { isCompanyAdmin } = usePermissions();
  const links = [
    ...baseLinks,
    ...(isCompanyAdmin ? [
      { href: '/team', label: 'Team', icon: '👥' },
      { href: '/company', label: 'Company', icon: '🏢' },
    ] : []),
  ];

  return (
    <aside className="w-64 bg-ink text-white flex flex-col min-h-screen">
      <div className="p-6 border-b border-slate">
        <Logo size={30} onDark />
        <p className="text-sm text-mist mt-1 opacity-75">Vendor Portal</p>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={clsx(
              'flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors',
              pathname === link.href
                ? 'bg-mist text-ink'
                : 'text-mist-dim hover:bg-slate',
            )}
          >
            <span>{link.icon}</span>
            {link.label}
          </Link>
        ))}
      </nav>
      <div className="p-4 border-t border-slate space-y-2">
        <p className="text-xs text-mist opacity-60">Attenteve Platform v1.0</p>
        <button
          onClick={() => {
            localStorage.removeItem('vendor_token');
            localStorage.removeItem('vendor_is_admin');
            window.location.replace('/login');
          }}
          className="w-full text-left text-xs text-mist-dim hover:text-white transition-colors"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
