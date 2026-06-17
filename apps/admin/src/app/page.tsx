export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-brand mb-2">Dashboard</h1>
      <p className="text-gray-500 mb-8">Welcome to the HomeGuard admin panel.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {[
          { label: 'Total Customers', value: '—', icon: '🏠', color: 'bg-blue-50 text-brand' },
          { label: 'Active Vendors', value: '—', icon: '🔧', color: 'bg-green-50 text-vendor' },
          { label: 'Active Subscriptions', value: '—', icon: '📋', color: 'bg-purple-50 text-purple-700' },
          { label: 'Revenue This Month', value: '—', icon: '💰', color: 'bg-yellow-50 text-yellow-700' },
        ].map((card) => (
          <div key={card.label} className={`${card.color} rounded-2xl p-6`}>
            <div className="text-3xl mb-3">{card.icon}</div>
            <div className="text-3xl font-bold mb-1">{card.value}</div>
            <div className="text-sm font-medium opacity-70">{card.label}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl p-6 border border-gray-100">
        <h2 className="text-lg font-bold text-brand mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <a href="/pricing" className="flex items-center gap-3 p-4 rounded-xl bg-gray-50 hover:bg-blue-50 transition-colors">
            <span className="text-2xl">💰</span>
            <div>
              <div className="font-semibold text-sm">Manage Pricing</div>
              <div className="text-xs text-gray-500">Update service prices and platform fee</div>
            </div>
          </a>
          <a href="/vendors" className="flex items-center gap-3 p-4 rounded-xl bg-gray-50 hover:bg-green-50 transition-colors">
            <span className="text-2xl">🔧</span>
            <div>
              <div className="font-semibold text-sm">Manage Vendors</div>
              <div className="text-xs text-gray-500">Approve and manage service providers</div>
            </div>
          </a>
          <a href="/customers" className="flex items-center gap-3 p-4 rounded-xl bg-gray-50 hover:bg-purple-50 transition-colors">
            <span className="text-2xl">🏠</span>
            <div>
              <div className="font-semibold text-sm">View Customers</div>
              <div className="text-xs text-gray-500">Browse subscriptions and activity</div>
            </div>
          </a>
        </div>
      </div>
    </div>
  );
}
