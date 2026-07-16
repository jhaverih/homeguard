'use client';
import { useEffect, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { paymentsApi } from '@/lib/api';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PK || '');

type Method = { id: string; brand: string; last4: string; isDefault: boolean };

function AddCardForm({ onDone }: { onDone: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);
    const { error: confirmError } = await stripe.confirmSetup({ elements, redirect: 'if_required' });
    if (confirmError) {
      setError(confirmError.message || 'Could not save card.');
      setSubmitting(false);
      return;
    }
    onDone();
  };

  return (
    <form onSubmit={submit} className="mt-4">
      <PaymentElement />
      {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
      <button
        type="submit"
        disabled={!stripe || submitting}
        className="mt-4 bg-lantern text-ink px-4 py-2 rounded-lg text-sm font-semibold hover:bg-lantern-deep hover:text-white disabled:opacity-50 transition-colors"
      >
        {submitting ? 'Saving…' : 'Save Card'}
      </button>
    </form>
  );
}

// Card-on-file management for the Elite membership fee. Reuses the same
// Stripe Customer + saved-card endpoints the mobile customer app already
// uses for subscription billing — this is the vendor-portal counterpart,
// the first Stripe Elements integration on the Next.js side of the app.
export default function PaymentMethodCard({ onMethodsChange }: { onMethodsChange?: (methods: Method[]) => void }) {
  const [methods, setMethods] = useState<Method[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  const load = async () => {
    const m = await paymentsApi.listMethods();
    setMethods(m);
    onMethodsChange?.(m);
    return m;
  };

  useEffect(() => { load(); }, []);

  const startAddCard = async () => {
    const { setupIntentClientSecret } = await paymentsApi.createSetupIntent();
    setClientSecret(setupIntentClientSecret);
    setAdding(true);
  };

  const finishAddCard = async () => {
    setAdding(false);
    setClientSecret(null);
    const updated = await load();
    // Auto-default the first card added, matching the mobile customer flow.
    if (updated.length === 1) {
      await paymentsApi.setDefaultMethod(updated[0].id);
      await load();
    }
  };

  if (methods === null) return <p className="text-steel text-sm">Loading payment method…</p>;

  return (
    <div className="bg-white rounded-2xl border border-mist-dim p-6">
      <p className="text-xs font-semibold text-steel uppercase tracking-wide mb-2">Payment Method</p>
      {methods.length === 0 ? (
        <p className="text-sm text-steel mb-2">No card on file. A payment method is required before Elite can be activated.</p>
      ) : (
        <div className="flex flex-wrap gap-2 mb-2">
          {methods.map((m) => (
            <span key={m.id} className="bg-canvas border border-border rounded-lg px-3 py-1.5 text-sm text-ink">
              {m.brand.toUpperCase()} •••• {m.last4}{m.isDefault ? ' (default)' : ''}
            </span>
          ))}
        </div>
      )}

      {adding && clientSecret ? (
        <Elements stripe={stripePromise} options={{ clientSecret }}>
          <AddCardForm onDone={finishAddCard} />
        </Elements>
      ) : (
        <button
          onClick={startAddCard}
          className="mt-2 bg-white border border-border text-steel px-4 py-2 rounded-lg text-sm font-semibold hover:bg-canvas transition-colors"
        >
          {methods.length === 0 ? '+ Add Payment Method' : '+ Add Another Card'}
        </button>
      )}
    </div>
  );
}
