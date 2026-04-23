'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clearAuth, getTenant } from '@/lib/auth';

const NAV = [
  { href: '/dashboard', label: 'Dashboard',  icon: '▦' },
  { href: '/documents', label: 'Documents',  icon: '⎗' },
  { href: '/chat',      label: 'Test Chat',  icon: '🤖' },
  { href: '/sessions',  label: 'Sessions',   icon: '💬' },
  { href: '/embed',     label: 'Embed Widget', icon: '⬡' },
  { href: '/settings',  label: 'Settings',   icon: '⚙' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();
  const tenant   = getTenant();

  function logout() {
    clearAuth();
    router.replace('/login');
  }

  return (
    <aside className="w-56 shrink-0 bg-white border-r border-gray-200 flex flex-col min-h-screen">
      {/* Branding */}
      <div className="px-5 py-4 border-b border-gray-100">
        <p className="text-xs font-bold text-indigo-600 uppercase tracking-widest">RAG Support</p>
        {tenant && (
          <>
            <p className="text-sm font-semibold text-gray-800 mt-1 truncate">{tenant.name}</p>
            <span className="inline-block mt-0.5 text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 capitalize">
              {tenant.plan}
            </span>
          </>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {NAV.map(({ href, label, icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <span className="text-base leading-none">{icon}</span>
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Sign out */}
      <div className="px-2 py-3 border-t border-gray-100">
        <button
          onClick={logout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
        >
          <span className="text-base leading-none">↩</span>
          Sign out
        </button>
      </div>
    </aside>
  );
}
