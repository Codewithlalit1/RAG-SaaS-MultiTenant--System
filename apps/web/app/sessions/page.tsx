'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import ProtectedLayout from '@/components/ProtectedLayout';
import { api } from '@/lib/api';

interface Session {
  id:             string;
  visitor_id:     string;
  last_active_at: string;
  created_at:     string;
}

interface SessionsResponse {
  sessions:   Session[];
  pagination: { hasMore: boolean; nextCursor: string | null };
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [cursor,   setCursor]   = useState<string | null>(null);
  const [hasMore,  setHasMore]  = useState(false);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');

  function load(next?: string) {
    setLoading(true);
    const qs = next ? `?cursor=${next}` : '';
    api
      .get<SessionsResponse>(`/api/chat/sessions${qs}`)
      .then((d) => {
        setSessions((prev) => next ? [...prev, ...d.sessions] : d.sessions);
        setHasMore(d.pagination.hasMore);
        setCursor(d.pagination.nextCursor);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  return (
    <ProtectedLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Sessions</h1>
        <p className="text-sm text-gray-500 mt-0.5">Chat sessions from the widget</p>
      </div>

      {error && (
        <div className="mb-4 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {!loading && sessions.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-16">No sessions yet.</p>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="text-left px-5 py-3">Visitor</th>
                  <th className="text-left px-5 py-3">Last active</th>
                  <th className="text-left px-5 py-3">Started</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sessions.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-mono text-xs text-gray-600 truncate max-w-xs">
                      {s.visitor_id}
                    </td>
                    <td className="px-5 py-3 text-gray-500">
                      {new Date(s.last_active_at).toLocaleString()}
                    </td>
                    <td className="px-5 py-3 text-gray-400">
                      {new Date(s.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        href={`/sessions/${s.id}`}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {loading && (
              <div className="flex justify-center py-6">
                <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {hasMore && !loading && (
              <div className="px-5 py-4 border-t border-gray-100">
                <button
                  onClick={() => load(cursor ?? undefined)}
                  className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  Load more
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </ProtectedLayout>
  );
}
