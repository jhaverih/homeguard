'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { userApi } from '@/lib/api';
import { Logo } from './Logo';

const links = [
  { href: '/', label: 'Dashboard', icon: '📊' },
  { href: '/calendar', label: 'Calendar', icon: '📅' },
  { href: '/pricing', label: 'Services', icon: '💰' },
  { href: '/marketplace', label: 'Marketplace', icon: '🧺' },
  { href: '/vendors', label: 'Vendors', icon: '🔧' },
  { href: '/customers', label: 'Customers', icon: '🏠' },
  { href: '/subscriptions', label: 'Subscriptions', icon: '📋' },
  { href: '/payments', label: 'Payments', icon: '💳' },
  { href: '/disputes', label: 'Disputes', icon: '⚖️' },
  { href: '/events', label: 'Monitoring Events', icon: '🔔' },
  { href: '/waitlist', label: 'Waitlist', icon: '📍' },
];

export function Sidebar() {
  const pathname = usePathname();
  const [isAtLeastAdmin, setIsAtLeastAdmin] = useState(false);
  const [userName, setUserName] = useState('');

  useEffect(() => {
    userApi.getMe().then((me: any) => {
      setIsAtLeastAdmin(me.adminLevel === 'SUPER_USER' || me.adminLevel === 'ADMIN');
      setUserName(`${me.firstName} ${me.lastName}`.trim());
    }).catch(() => {});
  }, []);

  const visibleLinks = [
    ...links,
    ...(isAtLeastAdmin ? [{ href: '/monitoring-setup', label: 'Monitoring Setup', icon: '📡' }] : []),
    ...(isAtLeastAdmin ? [{ href: '/vendor-applications', label: 'Vendor Applications', icon: '📄' }] : []),
    ...(isAtLeastAdmin ? [{ href: '/team', label: 'Team', icon: '👥' }] : []),
  ];

  return (
    <aside className="w-64 bg-ink text-white flex flex-col min-h-screen">
      <div className="p-6 border-b border-slate">
        <div className="mb-1">
          <Logo size={30} onDark />
        </div>
        <p className="text-sm text-mist mt-1 opacity-75">Admin Dashboard</p>
        {userName && <p className="text-xs text-mist mt-0.5">{userName}</p>}
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {visibleLinks.map((link) => (
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
            localStorage.removeItem('admin_token');
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
