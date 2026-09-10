'use client';

import React, { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { AppShell } from '@/components/layout/app-shell';
import { Loader2 } from 'lucide-react';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { session, isLoading, isAuthenticated } = useAuth();

  const isDesignSystemPreview = pathname === '/design-system';

  useEffect(() => {
    if (isDesignSystemPreview) return;

    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isLoading, isAuthenticated, router, isDesignSystemPreview]);

  if (isLoading && !isDesignSystemPreview) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex justify-center items-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-[#1D71CB] animate-spin" />
          <p className="text-sm font-medium text-slate-500">
            Cargando entorno de trabajo...
          </p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated && !isDesignSystemPreview) {
    return null;
  }

  return <AppShell>{children}</AppShell>;
}
