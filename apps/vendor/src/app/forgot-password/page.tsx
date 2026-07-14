'use client';
import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
    } catch {
      // Generic success regardless, to prevent email enumeration
    } finally {
      setLoading(false);
      setSent(true);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas">
      <div className="bg-white rounded-2xl shadow-sm border border-mist-dim p-10 w-full max-w-sm">
        {sent ? (
          <div className="text-center">
            <p className="text-4xl mb-4">📧</p>
            <h1 className="text-lg font-semibold text-ink mb-2">Check your email</h1>
            <p className="text-sm text-steel mb-6">
              If that email address is registered, we&apos;ve sent a 6-digit reset code. Check your inbox (and spam folder).
            </p>
            <Link href={`/reset-password?email=${encodeURIComponent(email)}`} className="block text-sm font-semibold text-lantern-deep hover:underline mb-3">
              Enter code &rarr;
            </Link>
            <Link href="/login" className="text-sm text-steel hover:underline">
              Back to Sign In
            </Link>
          </div>
        ) : (
          <>
            <h1 className="text-lg font-semibold text-ink mb-1">Reset Password</h1>
            <p className="text-sm text-steel mb-6">
              Enter your email address and we&apos;ll send you a 6-digit code to reset your password.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ink mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  className="w-full border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-lantern focus:border-transparent"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="w-full bg-lantern text-ink rounded-xl py-3 text-sm font-semibold hover:bg-lantern-deep transition-colors disabled:opacity-50"
              >
                {loading ? 'Sending...' : 'Send Reset Code'}
              </button>
            </form>
            <p className="text-center text-xs text-steel mt-6">
              <Link href="/login" className="hover:underline">Back to Sign In</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
