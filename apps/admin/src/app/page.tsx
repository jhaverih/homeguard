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
      <h1 className="text-2xl font-bold text-lantern-deep mb-2">Dashboard</h1>
      <p className="text-steel mb-8">Welcome to the HomeGuard admin panel.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {cards.map((card) => (
          <div key={card.label} className={`${card.color} rounded-2xl p-6`}>
            <div className="text-3xl mb-3">{card.icon}</div>
            <div className="text-3xl font-bold mb-1">{card.value}</div>
            <div className="text-sm font-medium opacity-70">{card.label}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl p-6 border border-mist-dim">
        <h2 className="text-lg font-bold text-lantern-deep mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <a href="/pricing" className="flex items-center gap-3 p-4 rounded-xl bg-canvas hover:bg-blue-50 transition-colors">
            <span className="text-2xl">💰</span>
            <div>
              <div className="font-semibold text-sm">Manage Services</div>
              <div className="text-xs text-steel">Update service prices and platform fee</div>
            </div>
          </a>
          <a href="/vendors" className="flex items-center gap-3 p-4 rounded-xl bg-canvas hover:bg-green-50 transition-colors">
            <span className="text-2xl">🔧</span>
            <div>
              <div className="font-semibold text-sm">Manage Vendors</div>
              <div className="text-xs text-steel">Approve and manage service providers</div>
            </div>
          </a>
          <a href="/customers" className="flex items-center gap-3 p-4 rounded-xl bg-canvas hover:bg-purple-50 transition-colors">
            <span className="text-2xl">🏠</span>
            <div>
              <div className="font-semibold text-sm">View Customers</div>
              <div className="text-xs text-steel">Browse subscriptions and activity</div>
            </div>
          </a>
        </div>
      </div>
    </div>
  );
}
