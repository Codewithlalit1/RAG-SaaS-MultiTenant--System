import { redirect } from 'next/navigation';

// Root path → dashboard (ProtectedLayout handles the auth check client-side).
export default function RootPage() {
  redirect('/dashboard');
}
