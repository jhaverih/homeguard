export default function CustomersPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-brand mb-2">Customers</h1>
      <p className="text-gray-500 mb-8">View all homeowners and their subscription status.</p>
      <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
        <div className="text-4xl mb-4">🏠</div>
        <h2 className="text-lg font-semibold text-gray-700 mb-2">Customer Management</h2>
        <p className="text-gray-400 text-sm">Customer list with subscription details will be available here.<br />Customers register through the mobile app.</p>
      </div>
    </div>
  );
}
