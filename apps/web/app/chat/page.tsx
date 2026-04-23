'use client';
import { useState, useRef, useEffect, FormEvent } from 'react';
import ProtectedLayout from '@/components/ProtectedLayout';
import { getApiKey } from '@/lib/auth';
import { DIRECT_API } from '@/lib/api';
import { v4 as uuidv4 } from 'uuid';

interface Message {
  id:      string;
  role:    'user' | 'assistant';
  content: string;
}

export default function ChatPage() {
  const [messages,  setMessages]  = useState<Message[]>([]);
  const [input,     setInput]     = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const sessionId   = useRef<string>(uuidv4());
  const bottomRef   = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    const apiKey = getApiKey();
    if (!apiKey) {
      setError('API key not found. Please log in again.');
      return;
    }

    const userMsg: Message = { id: uuidv4(), role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setError('');

    const assistantId = uuidv4();
    setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '' }]);

    try {
      const res = await fetch(`${DIRECT_API}/api/chat/message`, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key':    apiKey,
        },
        body: JSON.stringify({ message: text, sessionId: sessionId.current }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? `Error ${res.status}`);
      }

      const reader  = res.body!.getReader();
      const decoder = new TextDecoder();
      let   buffer  = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') break;

          try {
            const { token } = JSON.parse(payload) as { token: string };
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: m.content + token } : m
              )
            );
          } catch { /* skip malformed */ }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
    } finally {
      setLoading(false);
    }
  }

  return (
    <ProtectedLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Test Chatbot</h1>
        <p className="text-sm text-gray-500 mt-0.5">Chat with your uploaded documents</p>
      </div>

      <div className="flex flex-col bg-white rounded-xl border border-gray-200 overflow-hidden" style={{ height: 'calc(100vh - 180px)' }}>
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-gray-400">Ask anything about your documents…</p>
            </div>
          )}

          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-indigo-600 text-white rounded-br-sm'
                    : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                }`}
              >
                {m.content || (
                  <span className="flex gap-1 items-center py-0.5">
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
                  </span>
                )}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Error */}
        {error && (
          <div className="px-5 py-2 text-xs text-red-600 bg-red-50 border-t border-red-100">
            {error}
          </div>
        )}

        {/* Input */}
        <form onSubmit={send} className="flex gap-2 p-4 border-t border-gray-200">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message…"
            disabled={loading}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                       disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold
                       hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            Send
          </button>
        </form>
      </div>
    </ProtectedLayout>
  );
}
