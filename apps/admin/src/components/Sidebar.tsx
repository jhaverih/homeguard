'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { userApi } from '@/lib/api';

const links = [
  { href: '/', label: 'Dashboard', icon: '📊' },
  { href: '/calendar', label: 'Calendar', icon: '📅' },
  { href: '/pricing', label: 'Pricing', icon: '💰' },
  { href: '/vendors', label: 'Vendors', icon: '🔧' },
  { href: '/customers', label: 'Customers', icon: '🏠' },
  { href: '/subscriptions', label: 'Subscriptions', icon: '📋' },
  { href: '/payments', label: 'Payments', icon: '💳' },
  { href: '/disputes', label: 'Disputes', icon: '⚖️' },
  { href: '/events', label: 'Monitoring Events', icon: '🔔' },
];

export function Sidebar() {
  const pathname = usePathname();
  const [isSuperUser, setIsSuperUser] = useState(false);
  const [isAtLeastAdmin, setIsAtLeastAdmin] = useState(false);

  useEffect(() => {
    userApi.getMe().then((me: any) => {
      setIsSuperUser(me.adminLevel === 'SUPER_USER');
      setIsAtLeastAdmin(me.adminLevel === 'SUPER_USER' || me.adminLevel === 'ADMIN');
    }).catch(() => {});
  }, []);

  const visibleLinks = [
    ...links,
    ...(isAtLeastAdmin ? [{ href: '/monitoring-setup', label: 'Monitoring Setup', icon: '📡' }] : []),
    ...(isSuperUser ? [{ href: '/team', label: 'Team', icon: '👥' }] : []),
  ];

  return (
    <aside className="w-64 bg-brand text-white flex flex-col min-h-screen">
      <div className="p-6 border-b border-brand-light">
        <div className="flex items-center gap-3 mb-1">
          <svg viewBox="0 0 140 140" width="36" height="36" fill="none" xmlns="http://www.w3.org/2000/svg">
            <polygon points="70,8 18,54 122,54" fill="#FFFFFF"/>
            <rect x="32" y="54" width="76" height="72" rx="10" fill="#FFFFFF"/>
            <rect x="48" y="72" width="20" height="20" rx="5" fill="#0B4A45"/>
            <circle cx="104" cy="110" r="24" fill="#0B4A45"/>
            <circle cx="104" cy="110" r="19" fill="#FF7A45"/>
            <path d="M96,110 L103,117 L114,103" fill="none" stroke="#FFFFFF" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <h1 className="text-xl font-bold tracking-tight">Houmi</h1>
        </div>
        <p className="text-sm text-teal-200 mt-1 opacity-75">Admin Dashboard</p>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {visibleLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={clsx(
              'flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors',
              pathname === link.href
                ? 'bg-white text-brand'
                : 'text-teal-100 hover:bg-brand-light',
            )}
          >
            <span>{link.icon}</span>
            {link.label}
          </Link>
        ))}
      </nav>
      <div className="p-4 border-t border-brand-light space-y-2">
        <p className="text-xs text-teal-200 opacity-60">Houmi Platform v1.0</p>
        <button
          onClick={() => {
            localStorage.removeItem('admin_token');
            window.location.replace('/login');
          }}
          className="w-full text-left text-xs text-teal-300 hover:text-white transition-colors"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
