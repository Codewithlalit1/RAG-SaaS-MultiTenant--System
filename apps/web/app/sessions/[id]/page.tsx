'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import ProtectedLayout from '@/components/ProtectedLayout';
import { api } from '@/lib/api';

interface Message {
  id:           string;
  role:         'user' | 'assistant';
  content:      string;
  tokens_used:  number | null;
  latency_ms:   number | null;
  created_at:   string;
}

interface MessagesResponse {
  messages:   Message[];
  hasMore:    boolean;
  nextCursor: string | null;
}

export default function SessionDetailPage() {
  const { id }                              = useParams<{ id: string }>();
  const [messages, setMessages]             = useState<Message[]>([]);
  const [cursor,   setCursor]               = useState<string | null>(null);
  const [hasMore,  setHasMore]              = useState(false);
  const [loading,  setLoading]              = useState(true);
  const [error,    setError]                = useState('');

  function load(next?: string) {
    setLoading(true);
    const qs = next ? `?cursor=${next}` : '';
    api
      .get<MessagesResponse>(`/api/chat/sessions/${id}/messages${qs}`)
      .then((d) => {
        // Messages arrive newest-first; prepend older pages to keep chronological order
        setMessages((prev) => next ? [...d.messages, ...prev] : d.messages.slice().reverse());
        setHasMore(d.hasMore);
        setCursor(d.nextCursor);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { if (id) load(); }, [id]);

  return (
    <ProtectedLayout>
      <div className="mb-6 flex items-center gap-3">
        <Link href="/sessions" className="text-sm text-gray-400 hover:text-gray-600">
          ← Sessions
        </Link>
        <h1 className="text-xl font-bold text-gray-900 truncate font-mono text-sm">{id}</h1>
      </div>

      {error && (
        <div className="mb-4 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {hasMore && !loading && (
        <div className="mb-4">
          <button
            onClick={() => load(cursor ?? undefined)}
            className="text-sm text-indigo-600 hover:text-indigo-800"
          >
            Load earlier messages
          </button>
        </div>
      )}

      <div className="space-y-3">
        {loading && messages.length === 0 && (
          <div className="flex justify-center py-12">
            <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && messages.length === 0 && (
          <p className="text-center text-sm text-gray-400 py-12">No messages in this session.</p>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-xl rounded-2xl px-4 py-3 text-sm ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white rounded-br-sm'
                  : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm'
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>
              <p className={`text-xs mt-1.5 ${msg.role === 'user' ? 'text-indigo-200' : 'text-gray-400'}`}>
                {new Date(msg.created_at).toLocaleTimeString()}
                {msg.tokens_used != null && ` · ${msg.tokens_used} tokens`}
                {msg.latency_ms  != null && ` · ${msg.latency_ms} ms`}
              </p>
            </div>
          </div>
        ))}
      </div>
    </ProtectedLayout>
  );
}
