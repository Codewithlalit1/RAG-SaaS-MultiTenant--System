'use client';
import { useState, FormEvent, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { setToken, setApiKey, setTenant, isAuthenticated } from '@/lib/auth';

type Step = 'form' | 'success';

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep]       = useState<Step>('form');
  const [name, setName]       = useState('');
  const [plan, setPlan]       = useState('starter');
  const [vertical, setVertical] = useState('generic');
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);
  const [apiKey, setCreatedApiKey] = useState('');
  const [copied, setCopied]   = useState(false);

  useEffect(() => {
    if (isAuthenticated()) router.replace('/dashboard');
  }, [router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/auth/register', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, plan, vertical }),
      });

      const data = await res.json() as {
        apiKey?: string;
        accessToken?: string;
        tenant?: { id: string; name: string; plan: string; vertical: string };
        error?: string;
      };

      if (!res.ok) throw new Error(data.error ?? 'Registration failed');

      setToken(data.accessToken!);
      setApiKey(data.apiKey!);
      setTenant(data.tenant!);
      setCreatedApiKey(data.apiKey!);
      setStep('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  async function copyKey() {
    await navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (step === 'success') {
    return (
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">🎉</span>
            <h1 className="text-2xl font-bold text-gray-900">Account created!</h1>
          </div>
          <p className="text-sm text-gray-500 mb-6">
            Save your API key — it is shown <strong>only once</strong> and cannot be recovered.
          </p>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-2 flex items-center gap-2">
            <code className="text-sm text-gray-800 flex-1 break-all">{apiKey}</code>
            <button
              onClick={copyKey}
              className="shrink-0 text-xs font-medium text-indigo-600 hover:text-indigo-800"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>

          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-6">
            Store this key somewhere safe. You will need it to log in.
          </p>

          <button
            onClick={() => router.replace('/dashboard')}
            className="w-full bg-indigo-600 text-white py-2.5 rounded-lg text-sm font-semibold
                       hover:bg-indigo-700 transition-colors"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Create account</h1>
        <p className="text-sm text-gray-500 mb-6">
          Set up your tenant to get started.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Company / Tenant name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Inc."
              required
              autoFocus
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm
                         focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Plan</label>
            <select
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm
                         focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="starter">Starter</option>
              <option value="growth">Growth</option>
              <option value="business">Business</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Vertical</label>
            <select
              value={vertical}
              onChange={(e) => setVertical(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm
                         focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="generic">Generic</option>
              <option value="ecommerce">E-commerce</option>
              <option value="tech">Tech</option>
              <option value="healthcare">Healthcare</option>
            </select>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !name}
            className="w-full bg-indigo-600 text-white py-2.5 rounded-lg text-sm font-semibold
                       hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>
      </div>

      <p className="text-center text-xs text-gray-400 mt-4">
        Already have an API key?{' '}
        <a href="/login" className="text-indigo-600 hover:underline">Sign in</a>
      </p>
    </div>
  );
}
