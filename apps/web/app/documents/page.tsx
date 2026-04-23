'use client';
import { useCallback, useEffect, useRef, useState, DragEvent } from 'react';
import ProtectedLayout from '@/components/ProtectedLayout';
import { api, ApiError, DIRECT_API } from '@/lib/api';
import { getToken, getApiKey } from '@/lib/auth';

interface Doc {
  id:          string;
  filename:    string;
  status:      'processing' | 'indexed' | 'failed';
  chunk_count: number | null;
  token_count: number | null;
  created_at:  string;
}

interface DocListResponse {
  data:       Doc[];
  pagination: { hasMore: boolean; nextCursor: string | null };
}

const STATUS_STYLES: Record<string, string> = {
  processing: 'bg-amber-50  text-amber-700  border-amber-200',
  indexed:    'bg-green-50  text-green-700  border-green-200',
  failed:     'bg-red-50    text-red-700    border-red-200',
};

function Badge({ status }: { status: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border capitalize ${STATUS_STYLES[status] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>
      {status}
    </span>
  );
}

export default function DocumentsPage() {
  const [docs,      setDocs]      = useState<Doc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver,  setDragOver]  = useState(false);
  const [error,     setError]     = useState('');
  const [progress,  setProgress]  = useState<Record<string, number>>({});

  const inputRef    = useRef<HTMLInputElement>(null);
  // AbortControllers keyed by docId for the fetch-based SSE streams
  const controllers = useRef<Record<string, AbortController>>({});

  const fetchDocs = useCallback(() => {
    api
      .get<DocListResponse>('/api/documents')
      .then((d) => {
        setDocs(d.data);
        d.data.filter((doc) => doc.status === 'processing').forEach(startSse);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchDocs();
    return () => {
      Object.values(controllers.current).forEach((c) => c.abort());
    };
  }, [fetchDocs]);

  // Fetch-based SSE — EventSource cannot send Authorization headers.
  function startSse(doc: Doc) {
    if (controllers.current[doc.id]) return;
    const ctrl  = new AbortController();
    controllers.current[doc.id] = ctrl;
    const token = getToken();

    fetch(`${DIRECT_API}/api/documents/${doc.id}/status`, {
      headers: { Authorization: `Bearer ${token}` },
      signal:  ctrl.signal,
    })
      .then(async (res) => {
        if (!res.body) return;
        const reader  = res.body.getReader();
        const decoder = new TextDecoder();
        let   buffer  = '';

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split('\n\n');
          buffer = blocks.pop() ?? '';

          for (const block of blocks) {
            const line = block.trim();
            if (!line.startsWith('data: ')) continue;
            try {
              const data = JSON.parse(line.slice(6)) as { status?: string; progress?: number };
              setProgress((prev) => ({ ...prev, [doc.id]: data.progress ?? 0 }));
              if (data.status === 'indexed' || data.status === 'failed') {
                ctrl.abort();
                delete controllers.current[doc.id];
                fetchDocs();
                return;
              }
            } catch { /* ignore malformed SSE line */ }
          }
        }
      })
      .catch(() => {
        delete controllers.current[doc.id];
      });
  }

  async function uploadFile(file: File) {
    setError('');
    const apiKey = getApiKey();
    if (!apiKey) {
      setError('API key not found — please sign out and sign back in.');
      return;
    }

    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);

      const res = await fetch(`${DIRECT_API}/api/documents/upload`, {
        method:  'POST',
        headers: { 'x-api-key': apiKey },
        body:    form,
      });

      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Upload failed');

      fetchDocs();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  }

  async function handleDelete(id: string) {
    try {
      await api.delete(`/api/documents/${id}`);
      setDocs((prev) => prev.filter((d) => d.id !== id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Delete failed');
    }
  }

  return (
    <ProtectedLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
        <p className="text-sm text-gray-500 mt-0.5">PDF, DOCX, and Markdown — max 10 MB</p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !uploading && inputRef.current?.click()}
        className={`mb-6 border-2 border-dashed rounded-xl p-12 text-center cursor-pointer
                    transition-colors select-none ${
                      dragOver
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-gray-300 bg-white hover:border-indigo-400'
                    }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.md,.txt"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); }}
        />
        <p className="text-sm font-medium text-gray-600">
          {uploading ? 'Uploading…' : 'Drop a file here, or click to browse'}
        </p>
      </div>

      {error && (
        <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
          {error}
        </p>
      )}

      {/* Document table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {docs.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-16">No documents yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="text-left px-5 py-3">File</th>
                <th className="text-left px-5 py-3">Status</th>
                <th className="text-left px-5 py-3">Chunks</th>
                <th className="text-left px-5 py-3">Uploaded</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {docs.map((doc) => (
                <tr key={doc.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-800 max-w-xs truncate">
                    {doc.filename}
                  </td>
                  <td className="px-5 py-3">
                    <Badge status={doc.status} />
                    {doc.status === 'processing' && (
                      <div className="mt-1.5 h-1 w-28 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-500 transition-all duration-300"
                          style={{ width: `${progress[doc.id] ?? 0}%` }}
                        />
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3 text-gray-500">{doc.chunk_count ?? '—'}</td>
                  <td className="px-5 py-3 text-gray-400">
                    {new Date(doc.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => handleDelete(doc.id)}
                      className="text-xs text-red-400 hover:text-red-600 transition-colors"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </ProtectedLayout>
  );
}
