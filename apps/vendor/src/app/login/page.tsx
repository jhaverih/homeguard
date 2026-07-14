'use client';
import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Logo } from '@/components/Logo';

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

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { email, password });
      const { accessToken, user } = res.data;
      if (!user.roles?.includes('VENDOR')) {
        setError('Access denied. Vendor accounts only.');
        return;
      }
      localStorage.setItem('vendor_token', accessToken);
      localStorage.setItem('vendor_is_admin', String(!!user.vendorProfile?.isCompanyAdmin));
      router.replace('/');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Login failed. Check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas">
      <div className="bg-white rounded-2xl shadow-sm border border-mist-dim p-10 w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-2">
            <Logo size={40} />
          </div>
          <p className="text-sm text-steel mt-1">Vendor Portal</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(''); }}
              required
              className="w-full border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-lantern focus:border-transparent"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-ink">Password</label>
              <Link href="/forgot-password" className="text-xs font-medium text-lantern-deep hover:underline">
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                required
                autoComplete="current-password"
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
          </div>

          {error && (
            <div className="bg-red-50 border border-red-100 text-red-700 rounded-xl px-4 py-3 text-sm flex items-start justify-between gap-2">
              <span>{error}</span>
              <button type="button" onClick={() => setError('')} className="text-red-400 hover:text-red-600 font-bold leading-none shrink-0">✕</button>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-lantern text-ink rounded-xl py-3 text-sm font-semibold hover:bg-lantern-deep transition-colors disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
