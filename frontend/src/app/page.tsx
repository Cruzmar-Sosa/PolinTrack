'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Loader2 } from 'lucide-react';

export default function HomePage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    if (isAuthenticated) {
      router.replace('/dashboard');
    } else {
      router.replace('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 text-center bg-[#F8FAFC]">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 text-[#1D71CB] animate-spin" />
        <p className="text-sm font-medium text-slate-500">
          Iniciando PolinTrack...
        </p>
      </div>
    </main>
  );
}
