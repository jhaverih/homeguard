'use client';
import { useState } from 'react';

// Test accounts (apps/api/src/common/test-accounts.ts): a test customer's
// jobs only go to test vendors, and a test vendor only sees test customers'
// jobs. Real vendors and customers never see test activity.

/** Small "TEST" tag shown next to a name. */
export function TestBadge({ className = '' }: { className?: string }) {
  return (
    <span
      title="Test account: kept apart from real customers and vendors"
      className={`inline-block align-middle rounded-full bg-purple-100 text-purple-800 text-[10px] font-bold tracking-wide px-2 py-0.5 ${className}`}
    >
      TEST
    </span>
  );
}

/** The "Test account" card on a customer or vendor detail page. */
export function TestAccountCard({
  kind,
  isTestAccount,
  canEdit,
  onChange,
}: {
  kind: 'customer' | 'vendor';
  isTestAccount: boolean;
  canEdit: boolean;
  onChange: (next: boolean) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const explain = kind === 'customer'
    ? "This customer's jobs only go to test vendors. Real vendors never see them, and this customer only sees services test vendors offer."
    : "This vendor's whole company only sees and is told about test customers' jobs, and is never offered to real customers.";

  const toggle = async () => {
    const next = !isTestAccount;
    if (!next && !confirm(
      kind === 'customer'
        ? "Make this a real customer? Their new jobs will go to real vendors."
        : "Make this a real vendor company? Its team will see real customers' jobs.",
    )) return;
    setSaving(true);
    try {
      await onChange(next);
    } catch (e: any) {
      alert(e?.response?.data?.message ?? 'Could not change the test tag.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`rounded-2xl border p-6 mb-6 ${isTestAccount ? 'bg-purple-50 border-purple-200' : 'bg-white border-mist-dim'}`}>
      <div className="flex items-start gap-4">
        <div className="flex-1">
          <h2 className="text-sm font-bold text-steel uppercase tracking-wide mb-1">
            Test account {isTestAccount && <TestBadge className="ml-1" />}
          </h2>
          <p className="text-xs text-steel">
            {isTestAccount ? explain : `Off: this is a real ${kind === 'customer' ? 'customer' : 'vendor company'}.`}
            {' '}Existing jobs keep the vendor they already have.
          </p>
        </div>
        {canEdit ? (
          <button
            role="switch"
            aria-checked={isTestAccount}
            aria-label="Test account"
            disabled={saving}
            onClick={toggle}
            className={`relative shrink-0 w-12 h-7 rounded-full transition-colors disabled:opacity-50 ${isTestAccount ? 'bg-purple-600' : 'bg-mist-dim'}`}
          >
            <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${isTestAccount ? 'translate-x-5' : ''}`} />
          </button>
        ) : (
          <span className="text-xs text-steel">Only a super user can change this.</span>
        )}
      </div>
    </div>
  );
}
