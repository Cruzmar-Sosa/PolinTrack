'use client';

import React, { useState } from 'react';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { MobileDrawer } from './mobile-drawer';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  return (
    <div className="min-h-screen flex bg-[#F8FAFC]">
      {/* 1. Sidebar Fijo de Escritorio (>=1024px) */}
      <Sidebar isCollapsed={isSidebarCollapsed} />

      {/* 2. Drawer Deslizante Móvil (<1024px) */}
      <MobileDrawer
        isOpen={isMobileDrawerOpen}
        onClose={() => setIsMobileDrawerOpen(false)}
      />

      {/* 3. Área de Contenido Principal + Header Superior */}
      <div className="flex-1 flex flex-col min-w-0 transition-all duration-300">
        <Header
          isSidebarCollapsed={isSidebarCollapsed}
          onToggleSidebarCollapse={() =>
            setIsSidebarCollapsed(!isSidebarCollapsed)
          }
          onToggleMobileDrawer={() =>
            setIsMobileDrawerOpen(!isMobileDrawerOpen)
          }
        />

        {/* 4. Contenedor de Scroll Vertical Independiente */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}
