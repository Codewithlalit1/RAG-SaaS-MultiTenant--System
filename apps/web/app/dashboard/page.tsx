'use client';
import { useEffect, useState } from 'react';
import ProtectedLayout from '@/components/ProtectedLayout';
import { api } from '@/lib/api';

interface Overview {
  messages:     number;
  tokens:       number;
  sessions:     number;
  fallbacks:    number;
  avgLatencyMs: number;
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-1">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
      <p className="text-3xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error,    setError]    = useState('');

  useEffect(() => {
    api
      .get<{ overview: Overview }>('/api/analytics/overview')
      .then((d) => setOverview(d.overview))
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <ProtectedLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">Today&rsquo;s activity</p>
      </div>

      {error && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {!overview ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse h-28" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard label="Messages"      value={overview.messages} />
          <StatCard label="Tokens used"   value={overview.tokens.toLocaleString()} />
          <StatCard label="Sessions"      value={overview.sessions} />
          <StatCard label="Fallbacks"     value={overview.fallbacks} />
          <StatCard
            label="Avg latency"
            value={`${Math.round(overview.avgLatencyMs)} ms`}
            sub="per response"
          />
        </div>
      )}
    </ProtectedLayout>
  );
}
