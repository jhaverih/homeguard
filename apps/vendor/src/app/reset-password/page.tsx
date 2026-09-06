'use client';
import { Suspense, useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { PASSWORD_RULES, generateStrongPassword } from '@/lib/password-policy';

function EyeIcon({ off }: { off: boolean }) {
  return off ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.6 18.6 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const email = searchParams.get('email') ?? '';
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const router = useRouter();

  const allRulesMet = PASSWORD_RULES.every((r) => r.test(password));

  const handleGenerate = () => {
    const generated = generateStrongPassword();
    setPassword(generated);
    setConfirm(generated);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!allRulesMet) { setError('Password does not meet all requirements below.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }

    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token: token.trim(), password });
      setDone(true);
    } catch (err: any) {
      setError(err.response?.data?.message || 'The reset link may have expired. Request a new one.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas">
      <div className="bg-white rounded-2xl shadow-sm border border-mist-dim p-10 w-full max-w-sm">
        {done ? (
          <div className="text-center">
            <p className="text-4xl mb-4">✅</p>
            <h1 className="text-lg font-semibold text-ink mb-2">Password Updated</h1>
            <p className="text-sm text-steel mb-6">Your password has been reset. Sign in with your new password.</p>
            <button
              onClick={() => router.replace('/login')}
              className="w-full bg-lantern text-ink rounded-xl py-3 text-sm font-semibold hover:bg-lantern-deep transition-colors"
            >
              Sign In
            </button>
          </div>
        ) : (
          <>
            <h1 className="text-lg font-semibold text-ink mb-1">New Password</h1>
            <p className="text-sm text-steel mb-6">Check your email for a 6-digit code, enter it below, then choose a new password.</p>
            <form onSubmit={handleSubmit} className="space-y-4">
              {email && (
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">Account</label>
                  <input
                    type="email"
                    value={email}
                    readOnly
                    autoComplete="username"
                    className="w-full border border-mist-dim bg-canvas rounded-xl px-4 py-3 text-sm text-steel"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-ink mb-1">6-digit code</label>
                <input
                  value={token}
                  onChange={(e) => setToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  maxLength={6}
                  className="w-full border border-border rounded-xl px-4 py-3 text-2xl font-bold tracking-[0.5em] text-center focus:outline-none focus:ring-2 focus:ring-lantern focus:border-transparent"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-ink">New Password</label>
                  <button type="button" onClick={handleGenerate} className="text-xs font-semibold text-lantern-deep hover:underline">
                    Generate strong password
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    className="w-full border border-border rounded-xl px-4 py-3 pr-11 text-sm focus:outline-none focus:ring-2 focus:ring-lantern focus:border-transparent"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-steel hover:text-ink"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    <EyeIcon off={showPassword} />
                  </button>
                </div>
                <ul className="mt-2 space-y-1">
                  {PASSWORD_RULES.map((rule) => {
                    const met = rule.test(password);
                    return (
                      <li key={rule.label} className={`text-xs flex items-center gap-1.5 ${met ? 'text-green-600' : 'text-steel'}`}>
                        <span>{met ? '✓' : '✗'}</span>
                        {rule.label}
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1">Confirm Password</label>
                <div className="relative">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    autoComplete="new-password"
                    className="w-full border border-border rounded-xl px-4 py-3 pr-11 text-sm focus:outline-none focus:ring-2 focus:ring-lantern focus:border-transparent"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((v) => !v)}
                    tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-steel hover:text-ink"
                    aria-label={showConfirm ? 'Hide password' : 'Show password'}
                  >
                    <EyeIcon off={showConfirm} />
                  </button>
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-100 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>
              )}

              <button
                type="submit"
                disabled={loading || !allRulesMet || password !== confirm}
                className="w-full bg-lantern text-ink rounded-xl py-3 text-sm font-semibold hover:bg-lantern-deep transition-colors disabled:opacity-50"
              >
                {loading ? 'Resetting...' : 'Reset Password'}
              </button>
            </form>
            <p className="text-center text-xs text-steel mt-6">
              <Link href="/forgot-password" className="hover:underline">Need a new code?</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
