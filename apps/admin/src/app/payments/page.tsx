export default function PaymentsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-lantern-deep mb-2">Payments</h1>
      <p className="text-steel mb-8">View all transactions processed through the platform.</p>
      <div className="bg-white rounded-2xl border border-mist-dim p-12 text-center">
        <div className="text-4xl mb-4">💳</div>
        <p className="text-steel text-sm">Payment history and revenue analytics coming soon.<br />All payments are processed automatically via Stripe Connect.</p>
      </div>
    </div>
  );
}
