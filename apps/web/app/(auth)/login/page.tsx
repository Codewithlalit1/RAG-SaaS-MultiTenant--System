'use client';
import { useState, FormEvent, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { setToken, setApiKey, setTenant, isAuthenticated, Tenant } from '@/lib/auth';

export default function LoginPage() {
  const router  = useRouter();
  const [apiKey,   setKey]     = useState('');
  const [error,    setError]   = useState('');
  const [loading,  setLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated()) router.replace('/dashboard');
  }, [router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/auth/login', {
        method:      'POST',
        credentials: 'include',          // receive the httpOnly refresh cookie
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({ apiKey }),
      });

      const data = await res.json() as { accessToken?: string; tenant?: Tenant; error?: string };

      if (!res.ok) throw new Error(data.error ?? 'Login failed');

      setToken(data.accessToken!);
      setApiKey(apiKey);               // stored for document upload (x-api-key auth)
      setTenant(data.tenant!);
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Sign in</h1>
        <p className="text-sm text-gray-500 mb-6">
          Enter your API key to access the dashboard.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="apiKey" className="block text-sm font-medium text-gray-700 mb-1">
              API Key
            </label>
            <input
              id="apiKey"
              type="password"
              value={apiKey}
              onChange={(e) => setKey(e.target.value)}
              placeholder="rsk_…"
              required
              autoFocus
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm
                         focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !apiKey}
            className="w-full bg-indigo-600 text-white py-2.5 rounded-lg text-sm font-semibold
                       hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50
                       transition-colors"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>

      <p className="text-center text-xs text-gray-400 mt-4">
        No account?&nbsp;
        <a href="/register" className="text-indigo-600 hover:underline">
          Create an account
        </a>
      </p>
    </div>
  );
}
