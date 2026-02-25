// =====================================================
// Leadflow Vloom - App layout (sidebar + main)
// Layout reference: wearevloom.com
// =====================================================
import React from 'react';
import { Sidebar, type SectionId, type DiscoverySubId } from './Sidebar';

export interface AppLayoutProps {
  activeSection: SectionId;
  activeDiscoverySub?: DiscoverySubId;
  onNavigate: (section: SectionId, discoverySub?: DiscoverySubId) => void;
  children: React.ReactNode;
  userEmail?: string | null;
  onSignOut?: () => void;
}

export function AppLayout({
  activeSection,
  activeDiscoverySub,
  onNavigate,
  children,
  userEmail,
  onSignOut,
}: AppLayoutProps) {
  return (
    <div className="flex min-h-screen bg-vloom-bg">
      <Sidebar
        activeSection={activeSection}
        activeDiscoverySub={activeDiscoverySub}
        onNavigate={onNavigate}
        userEmail={userEmail}
        onSignOut={onSignOut}
      />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
