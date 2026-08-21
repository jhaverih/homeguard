'use client';
import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';

export default function DashboardPage() {
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    adminApi.getStats().then(setStats).catch(() => {});
  }, []);

  const cards = [
    { label: 'Total Customers', value: stats?.totalCustomers ?? '—', icon: '🏠', color: 'bg-blue-50 text-lantern-deep' },
    { label: 'Active Vendors', value: stats?.activeVendors ?? '—', icon: '🔧', color: 'bg-green-50 text-lantern-deep' },
    { label: 'Active Subscriptions', value: stats?.activeSubscriptions ?? '—', icon: '📋', color: 'bg-purple-50 text-purple-700' },
    {
      label: 'Revenue This Month',
      value: stats ? `$${stats.revenueThisMonth.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—',
      icon: '💰',
      color: 'bg-yellow-50 text-yellow-700',
    },
  ];

  return (
    <div>
      <h1 className="text-4xl font-bold text-lantern-deep mb-3">Dashboard</h1>
      <p className="text-steel text-lg mb-10">Welcome to the HomeGuard admin panel.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-10">
        {cards.map((card) => (
          <div key={card.label} className={`${card.color} rounded-3xl p-9 min-h-[220px] flex flex-col justify-between`}>
            <div className="text-6xl">{card.icon}</div>
            <div>
              <div className="text-5xl font-extrabold mb-2 tabular-nums">{card.value}</div>
              <div className="text-lg font-medium opacity-70">{card.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-3xl p-9 border border-mist-dim">
        <h2 className="text-2xl font-bold text-lantern-deep mb-6">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <a href="/pricing" className="flex items-center gap-5 p-6 rounded-2xl bg-canvas hover:bg-blue-50 transition-colors">
            <span className="text-5xl">💰</span>
            <div>
              <div className="font-semibold text-lg">Manage Services</div>
              <div className="text-sm text-steel mt-1">Update service prices and platform fee</div>
            </div>
          </a>
          <a href="/vendors" className="flex items-center gap-5 p-6 rounded-2xl bg-canvas hover:bg-green-50 transition-colors">
            <span className="text-5xl">🔧</span>
            <div>
              <div className="font-semibold text-lg">Manage Vendors</div>
              <div className="text-sm text-steel mt-1">Approve and manage service providers</div>
            </div>
          </a>
          <a href="/customers" className="flex items-center gap-5 p-6 rounded-2xl bg-canvas hover:bg-purple-50 transition-colors">
            <span className="text-5xl">🏠</span>
            <div>
              <div className="font-semibold text-lg">View Customers</div>
              <div className="text-sm text-steel mt-1">Browse subscriptions and activity</div>
            </div>
          </a>
        </div>
      </div>
    </div>
  );
}
