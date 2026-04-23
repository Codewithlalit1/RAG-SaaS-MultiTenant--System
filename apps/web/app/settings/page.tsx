'use client';
import { useEffect, useState, FormEvent } from 'react';
import ProtectedLayout from '@/components/ProtectedLayout';
import { api } from '@/lib/api';

interface WidgetConfig {
  tone?:            string;
  language?:        string;
  greeting?:        string;
  fallbackMessage?: string;
  primaryColor?:    string;
  position?:        string;
}

interface TenantConfigResponse {
  name:          string;
  vertical:      string;
  widget_config: WidgetConfig;
}

const TONES     = ['helpful-professional', 'friendly-professional', 'technical-precise', 'casual'];
const POSITIONS = ['bottom-right', 'bottom-left'];

export default function SettingsPage() {
  const [form,    setForm]    = useState<WidgetConfig>({});
  const [tenant,  setTenant]  = useState<{ name: string; vertical: string } | null>(null);
  const [saving,  setSaving]  = useState(false);
  const [success, setSuccess] = useState(false);
  const [error,   setError]   = useState('');

  useEffect(() => {
    api
      .get<TenantConfigResponse>('/api/tenant/config')
      .then((d) => {
        setTenant({ name: d.name, vertical: d.vertical });
        setForm(d.widget_config ?? {});
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  function patch(key: keyof WidgetConfig, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSuccess(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setSaving(true);
    try {
      await api.put('/api/tenant/config', { widget_config: form });
      setSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProtectedLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        {tenant && (
          <p className="text-sm text-gray-500 mt-0.5">
            {tenant.name} &middot; <span className="capitalize">{tenant.vertical}</span>
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="max-w-xl space-y-5">
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {/* Greeting */}
          <Field label="Greeting" hint="Shown when the widget opens">
            <input
              type="text"
              value={form.greeting ?? ''}
              onChange={(e) => patch('greeting', e.target.value)}
              placeholder="Welcome! How can I help you today?"
              className={inputCls}
            />
          </Field>

          {/* Fallback message */}
          <Field label="Fallback message" hint="Shown when no knowledge base match is found">
            <input
              type="text"
              value={form.fallbackMessage ?? ''}
              onChange={(e) => patch('fallbackMessage', e.target.value)}
              placeholder="I don't have information on that. Please contact support."
              className={inputCls}
            />
          </Field>

          {/* Tone */}
          <Field label="Tone">
            <select
              value={form.tone ?? ''}
              onChange={(e) => patch('tone', e.target.value)}
              className={inputCls}
            >
              <option value="">Default</option>
              {TONES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </Field>

          {/* Language */}
          <Field label="Language" hint="ISO 639-1 code, e.g. en, es, fr">
            <input
              type="text"
              value={form.language ?? ''}
              onChange={(e) => patch('language', e.target.value)}
              placeholder="en"
              maxLength={5}
              className={inputCls}
            />
          </Field>

          {/* Primary colour */}
          <Field label="Primary colour">
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={form.primaryColor ?? '#4f46e5'}
                onChange={(e) => patch('primaryColor', e.target.value)}
                className="h-9 w-14 rounded border border-gray-300 cursor-pointer p-0.5"
              />
              <span className="text-sm text-gray-500 font-mono">
                {form.primaryColor ?? '#4f46e5'}
              </span>
            </div>
          </Field>

          {/* Position */}
          <Field label="Widget position">
            <select
              value={form.position ?? ''}
              onChange={(e) => patch('position', e.target.value)}
              className={inputCls}
            >
              <option value="">Default</option>
              {POSITIONS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </Field>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
            {error}
          </p>
        )}

        {success && (
          <p className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-lg px-4 py-3">
            Settings saved.
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg text-sm font-semibold
                     hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : 'Save settings'}
        </button>
      </form>
    </ProtectedLayout>
  );
}

const inputCls =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent';

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-5 py-4">
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {hint && <p className="text-xs text-gray-400 mb-2">{hint}</p>}
      {children}
    </div>
  );
}
