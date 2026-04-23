'use client';
import { useEffect, useState } from 'react';
import ProtectedLayout from '@/components/ProtectedLayout';
import { getApiKey } from '@/lib/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export default function EmbedPage() {
  const [apiKey,   setApiKey]   = useState('');
  const [copied,   setCopied]   = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);

  useEffect(() => {
    setApiKey(getApiKey() ?? '');
  }, []);

  const snippet = `<script
  src="${API_URL}/widget.js"
  data-api-url="${API_URL}"
  data-api-key="${apiKey || 'YOUR_API_KEY'}"
  data-title="Support Chat"
  data-position="bottom-right"
  data-primary-color="#6366f1"
></script>`;

  async function copySnippet() {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function copyKey() {
    await navigator.clipboard.writeText(apiKey);
    setKeyCopied(true);
    setTimeout(() => setKeyCopied(false), 2000);
  }

  return (
    <ProtectedLayout>
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold text-gray-900">Embed Widget</h1>
        <p className="text-sm text-gray-500 mt-1">
          Paste the snippet below into any webpage to add a live AI chat bubble.
        </p>

        {/* Security notice */}
        <div className="mt-5 flex gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <span className="text-amber-500 text-lg leading-none mt-0.5">⚠</span>
          <div className="text-sm text-amber-800">
            <p className="font-semibold">Keep this snippet private.</p>
            <p className="mt-0.5 text-amber-700">
              It contains your API key. Do not commit it to public repositories or
              share it publicly. It is safe to embed on your own website.
            </p>
          </div>
        </div>

        {/* API key display */}
        <div className="mt-6">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
            Your API Key
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-sm bg-gray-100 rounded-lg px-3 py-2 font-mono text-gray-800 truncate">
              {apiKey || '—'}
            </code>
            <button
              onClick={copyKey}
              disabled={!apiKey}
              className="px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white text-gray-700
                hover:bg-gray-50 transition-colors disabled:opacity-40 whitespace-nowrap"
            >
              {keyCopied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
        </div>

        {/* Snippet editor */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Embed Snippet
            </p>
            <button
              onClick={copySnippet}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg
                bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
            >
              {copied ? '✓ Copied!' : '⎘ Copy snippet'}
            </button>
          </div>
          <pre className="bg-gray-900 text-green-400 text-sm rounded-xl p-4 overflow-x-auto
            font-mono leading-relaxed whitespace-pre select-all">
            {snippet}
          </pre>
        </div>

        {/* Step-by-step instructions */}
        <div className="mt-8">
          <h2 className="text-base font-semibold text-gray-800 mb-4">How to install</h2>
          <ol className="space-y-4">
            {[
              {
                n: '1',
                title: 'Copy the snippet above',
                body: 'Click "Copy snippet" — your API key and URL are already filled in.',
              },
              {
                n: '2',
                title: 'Paste it into your website',
                body: 'Add it just before the closing </body> tag of every page where you want the chat bubble to appear.',
                code: '<body>\n  <!-- your page content -->\n\n  <!-- paste here ↓ -->\n  <script src="…"></script>\n</body>',
              },
              {
                n: '3',
                title: 'Upload your documents',
                body: 'Go to Documents and upload your support PDFs, Word docs, or Markdown files. The widget will answer questions using that knowledge.',
              },
              {
                n: '4',
                title: 'Customise (optional)',
                body: 'Change the bubble colour, position, greeting, or title by editing the data-* attributes in the snippet.',
                code: 'data-primary-color="#0ea5e9"\ndata-position="bottom-left"\ndata-title="Ask us anything"\ndata-greeting="Hi 👋 How can I help?"',
              },
              {
                n: '5',
                title: "You're live!",
                body: 'Visit your website. The chat bubble should appear immediately. Chat history from your visitors will appear in Sessions.',
              },
            ].map(({ n, title, body, code }) => (
              <li key={n} className="flex gap-4">
                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-100 text-indigo-700
                  text-sm font-bold flex items-center justify-center">{n}</span>
                <div className="pt-0.5">
                  <p className="text-sm font-semibold text-gray-800">{title}</p>
                  <p className="text-sm text-gray-500 mt-0.5">{body}</p>
                  {code && (
                    <pre className="mt-2 bg-gray-900 text-green-400 text-xs rounded-lg px-3 py-2
                      font-mono overflow-x-auto whitespace-pre">{code}</pre>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* Supported attributes reference */}
        <div className="mt-10 mb-4">
          <h2 className="text-base font-semibold text-gray-800 mb-3">Script tag attributes</h2>
          <div className="rounded-xl border border-gray-200 overflow-hidden text-sm">
            <table className="w-full">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-4 py-2.5 font-semibold text-gray-600 w-48">Attribute</th>
                  <th className="px-4 py-2.5 font-semibold text-gray-600">Description</th>
                  <th className="px-4 py-2.5 font-semibold text-gray-600 w-32">Default</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[
                  ['data-api-key',       'Your API key (required)',                             '—'],
                  ['data-api-url',       'Your API server URL (required)',                      '—'],
                  ['data-title',         'Header title in the chat window',                    '"Support Chat"'],
                  ['data-greeting',      'First bot message shown when widget opens',          '"Hi! How can I help?"'],
                  ['data-position',      'Bubble position: bottom-right / bottom-left',        '"bottom-right"'],
                  ['data-primary-color', 'Hex colour for bubble and user messages',            '"#6366f1"'],
                ].map(([attr, desc, def]) => (
                  <tr key={attr} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-mono text-indigo-700 text-xs">{attr}</td>
                    <td className="px-4 py-2.5 text-gray-600">{desc}</td>
                    <td className="px-4 py-2.5 text-gray-400 font-mono text-xs">{def}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </ProtectedLayout>
  );
}
