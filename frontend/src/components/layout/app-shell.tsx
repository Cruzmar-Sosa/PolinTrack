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
    <div className="min-h-screen flex bg-[#F8FAFC] print:bg-white print:min-h-0 print:h-auto print:block">
      {/* 1. Sidebar Fijo de Escritorio (>=1024px) */}
      <div id="dashboard-sidebar" className="print:hidden">
        <Sidebar isCollapsed={isSidebarCollapsed} />
      </div>

      {/* 2. Drawer Deslizante Móvil (<1024px) */}
      <div className="print:hidden">
        <MobileDrawer
          isOpen={isMobileDrawerOpen}
          onClose={() => setIsMobileDrawerOpen(false)}
        />
      </div>

      {/* 3. Área de Contenido Principal + Header Superior */}
      <div className="flex-1 flex flex-col min-w-0 transition-all duration-300 print:w-full print:block print:m-0 print:p-0">
        <div id="dashboard-topbar" className="print:hidden">
          <Header
            isSidebarCollapsed={isSidebarCollapsed}
            onToggleSidebarCollapse={() =>
              setIsSidebarCollapsed(!isSidebarCollapsed)
            }
            onToggleMobileDrawer={() =>
              setIsMobileDrawerOpen(!isMobileDrawerOpen)
            }
          />
        </div>

        {/* 4. Contenedor de Scroll Vertical Independiente */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 print:p-0 print:m-0 print:overflow-visible print:block print:w-full">
          <div className="max-w-7xl mx-auto print:max-w-none print:w-full print:p-0 print:m-0">{children}</div>
        </main>
      </div>
    </div>
  );
}
