'use client';
import { useEffect, useState } from 'react';
import { vendorApi } from '@/lib/api';

function Table({ rows }: { rows: any[] }) {
  if (rows.length === 0) return <p className="text-gray-400 text-sm py-6 text-center">None.</p>;
  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 border-b border-gray-100">
        <tr>
          <th className="text-left px-4 py-3 font-semibold text-gray-600">Description</th>
          <th className="text-right px-4 py-3 font-semibold text-gray-600">Amount</th>
          <th className="text-right px-4 py-3 font-semibold text-gray-600">Your Payout</th>
          <th className="text-left px-4 py-3 font-semibold text-gray-600">Date</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">
        {rows.map((p) => (
          <tr key={p.id}>
            <td className="px-4 py-3 text-gray-800">{p.description}</td>
            <td className="px-4 py-3 text-right text-gray-600">${Number(p.amount).toFixed(2)}</td>
            <td className="px-4 py-3 text-right font-semibold text-brand">${Number(p.vendorAmount).toFixed(2)}</td>
            <td className="px-4 py-3 text-gray-400">{new Date(p.createdAt).toLocaleDateString()}</td>
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

  if (loading) return <div className="text-gray-500 p-8">Loading...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand mb-2">Payments</h1>
      <p className="text-gray-500 mb-8">Payouts for jobs completed by your company — everything flows to your company's single Stripe account.</p>

      <div className="bg-white rounded-2xl border border-gray-100 mb-6">
        <div className="p-6 border-b border-gray-100"><h2 className="font-bold text-gray-800">Received</h2></div>
        <Table rows={payments.received} />
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 mb-6">
        <div className="p-6 border-b border-gray-100"><h2 className="font-bold text-gray-800">Pending</h2></div>
        <Table rows={payments.pending} />
      </div>
      <div className="bg-white rounded-2xl border border-gray-100">
        <div className="p-6 border-b border-gray-100"><h2 className="font-bold text-gray-800">Disputed</h2></div>
        <Table rows={payments.disputed} />
      </div>
    </div>
  );
}
