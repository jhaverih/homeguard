'use client';
import { useEffect, useState } from 'react';
import { vendorApi } from '@/lib/api';

function Table({ rows }: { rows: any[] }) {
  if (rows.length === 0) return <p className="text-steel text-sm py-6 text-center">None.</p>;
  return (
    <table className="w-full text-sm">
      <thead className="bg-canvas border-b border-mist-dim">
        <tr>
          <th className="text-left px-4 py-3 font-semibold text-steel">Description</th>
          <th className="text-right px-4 py-3 font-semibold text-steel">Amount</th>
          <th className="text-right px-4 py-3 font-semibold text-steel">Your Payout</th>
          <th className="text-left px-4 py-3 font-semibold text-steel">Date</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-canvas">
        {rows.map((p) => (
          <tr key={p.id}>
            <td className="px-4 py-3 text-ink">{p.description}</td>
            <td className="px-4 py-3 text-right text-steel">${Number(p.amount).toFixed(2)}</td>
            <td className="px-4 py-3 text-right font-semibold text-lantern-deep">${Number(p.vendorAmount).toFixed(2)}</td>
            <td className="px-4 py-3 text-steel">{new Date(p.createdAt).toLocaleDateString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function PaymentsPage() {
  const [payments, setPayments] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    vendorApi.getPayments().then(setPayments).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-steel p-8">Loading...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-lantern-deep mb-2">Payments</h1>
      <p className="text-steel mb-8">Payouts for jobs completed by your company — everything flows to your company's single Stripe account.</p>

      <div className="bg-white rounded-2xl border border-mist-dim mb-6">
        <div className="p-6 border-b border-mist-dim"><h2 className="font-bold text-ink">Received</h2></div>
        <Table rows={payments.received} />
      </div>
      <div className="bg-white rounded-2xl border border-mist-dim mb-6">
        <div className="p-6 border-b border-mist-dim"><h2 className="font-bold text-ink">Pending</h2></div>
        <Table rows={payments.pending} />
      </div>
      <div className="bg-white rounded-2xl border border-mist-dim">
        <div className="p-6 border-b border-mist-dim"><h2 className="font-bold text-ink">Disputed</h2></div>
        <Table rows={payments.disputed} />
      </div>
    </div>
  );
}
