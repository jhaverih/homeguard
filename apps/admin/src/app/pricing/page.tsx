'use client';
import { useEffect, useState } from 'react';
import { pricingApi, subscriptionsApi } from '@/lib/api';

export default function PricingPage() {
  const [prices, setPrices] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [platformFee, setPlatformFee] = useState('15');

  useEffect(() => {
    Promise.all([pricingApi.getAll(), subscriptionsApi.getPlans()])
      .then(([p, s]) => { setPrices(p); setPlans(s); })
      .finally(() => setLoading(false));
  }, []);

  const savePrice = async (id: string) => {
    await pricingApi.update(id, { basePrice: parseFloat(editValue) });
    setPrices((prev) => prev.map((p) => p.id === id ? { ...p, basePrice: parseFloat(editValue) } : p));
    setEditingId(null);
  };

  const savePlanPrice = async (id: string, price: number) => {
    await subscriptionsApi.updatePlan(id, { price });
    setPlans((prev) => prev.map((p) => p.id === id ? { ...p, price } : p));
  };

  if (loading) return <div className="text-gray-500">Loading...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand mb-2">Pricing Management</h1>
      <p className="text-gray-500 mb-8">Set standard service prices that vendors must use. All prices are in USD.</p>

      <div className="bg-white rounded-2xl border border-gray-100 mb-8">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-lg font-bold text-brand">Platform Fee</h2>
          <p className="text-sm text-gray-500 mt-1">Percentage automatically deducted from each vendor payment via Stripe.</p>
        </div>
        <div className="p-6 flex items-center gap-4">
          <input
            type="number"
            value={platformFee}
            onChange={(e) => setPlatformFee(e.target.value)}
            className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-center text-lg font-bold"
            min="1"
            max="50"
          />
          <span className="text-lg text-gray-600">%</span>
          <span className="text-sm text-gray-400">(Set this value in your QNAP .env file as PLATFORM_FEE_PERCENT)</span>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 mb-8">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-lg font-bold text-brand">Subscription Plan Prices</h2>
        </div>
        <div className="divide-y divide-gray-50">
          {plans.map((plan: any) => (
            <div key={plan.id} className="p-6 flex items-center justify-between">
              <div>
                <div className="font-semibold text-gray-800">{plan.name}</div>
                <div className="text-sm text-gray-500">{plan.tier} tier</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-400">$</span>
                <input
                  type="number"
                  defaultValue={plan.price}
                  onBlur={(e) => savePlanPrice(plan.id, parseFloat(e.target.value))}
                  className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-right"
                />
                <span className="text-sm text-gray-400">/year</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-lg font-bold text-brand">Service Prices</h2>
          <p className="text-sm text-gray-500 mt-1">Standard prices visible to vendors for individual service items.</p>
        </div>
        <div className="divide-y divide-gray-50">
          {prices.map((price: any) => (
            <div key={price.id} className="p-6 flex items-center justify-between">
              <div>
                <div className="font-semibold text-gray-800">{price.name}</div>
                <div className="text-sm text-gray-500">{price.description}</div>
              </div>
              <div className="flex items-center gap-2">
                {editingId === price.id ? (
                  <>
                    <span className="text-sm text-gray-400">$</span>
                    <input
                      type="number"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="w-24 border border-brand rounded-lg px-3 py-2 text-right"
                      autoFocus
                    />
                    <button onClick={() => savePrice(price.id)} className="bg-brand text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-dark">Save</button>
                    <button onClick={() => setEditingId(null)} className="text-gray-400 px-3 py-2 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
                  </>
                ) : (
                  <>
                    <span className="font-bold text-brand text-lg">${price.basePrice}</span>
                    <button
                      onClick={() => { setEditingId(price.id); setEditValue(String(price.basePrice)); }}
                      className="text-sm text-gray-400 hover:text-brand ml-3 px-3 py-1 rounded border border-gray-200 hover:border-brand transition-colors"
                    >
                      Edit
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
