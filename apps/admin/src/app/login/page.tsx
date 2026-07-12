'use client';
import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

export default function LoginPage() {
  const [email, setEmail] = useState('admin@houmi.app');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { email, password });
      const { accessToken, user } = res.data;
      if (!user.roles?.includes('ADMIN')) {
        setError('Access denied. Admin accounts only.');
        return;
      }
      localStorage.setItem('admin_token', accessToken);
      router.replace('/');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Login failed. Check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <svg viewBox="0 0 520 160" width="160" height="49" xmlns="http://www.w3.org/2000/svg">
              <polygon points="75,20 20,72 130,72" fill="#0F6F66"/>
              <rect x="38" y="72" width="74" height="64" rx="10" fill="#0F6F66"/>
              <rect x="50" y="90" width="18" height="18" rx="5" fill="#FFFFFF"/>
              <circle cx="112" cy="118" r="25" fill="#FFFFFF"/>
              <circle cx="112" cy="118" r="20" fill="#FF7A45"/>
              <path d="M103,118 L110,125 L122,109" fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
              <text x="150" y="106" fontFamily="'Poppins','Segoe UI',Helvetica,Arial,sans-serif" fontSize="72" fontWeight="700" letterSpacing="-1" fill="#0B4A45">Houmi</text>
            </svg>
          </div>
          <p className="text-sm text-gray-400 mt-1">Admin Portal</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(''); }}
              required
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700">Password</label>
              <Link href="/forgot-password" className="text-xs font-medium text-brand hover:underline">
                Forgot password?
              </Link>
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              required
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
            />
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
            className="w-full bg-brand text-white rounded-xl py-3 text-sm font-semibold hover:bg-brand-light transition-colors disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">
          Default: admin@houmi.app / Admin@1234
        </p>
      </div>
    </div>
  );
}
