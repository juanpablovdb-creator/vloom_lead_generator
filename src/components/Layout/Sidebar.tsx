// =====================================================
// Leadflow Vloom - Sidebar (layout wearevloom.com)
// =====================================================
import React, { useState } from 'react';
import {
  CheckSquare,
  Search,
  FolderOpen,
  List,
  LayoutGrid,
  BarChart3,
  ChevronDown,
  ChevronRight,
  LogOut,
} from 'lucide-react';

export type SectionId = 'tasks' | 'discovery' | 'crm' | 'kpis';
export type DiscoverySubId = 'new-search' | 'saved-searches' | 'leads-lists';

export interface SidebarProps {
  activeSection: SectionId;
  activeDiscoverySub?: DiscoverySubId;
  onNavigate: (section: SectionId, discoverySub?: DiscoverySubId) => void;
  userEmail?: string | null;
  onSignOut?: () => void;
}

const DISCOVERY_SUBS: { id: DiscoverySubId; label: string; icon: React.ReactNode }[] = [
  { id: 'new-search', label: 'New Search', icon: <Search className="w-4 h-4" /> },
  { id: 'saved-searches', label: 'Saved searches', icon: <FolderOpen className="w-4 h-4" /> },
  { id: 'leads-lists', label: 'Leads', icon: <List className="w-4 h-4" /> },
];

export function Sidebar({ activeSection, activeDiscoverySub, onNavigate, userEmail, onSignOut }: SidebarProps) {
  const [discoveryOpen, setDiscoveryOpen] = useState(activeSection === 'discovery');

  const navItem = (
    section: SectionId,
    label: string,
    icon: React.ReactNode,
    sub?: DiscoverySubId
  ) => {
    const isActive =
      section === activeSection && (section !== 'discovery' || sub === activeDiscoverySub);
    return (
      <button
        key={section + (sub ?? '')}
        onClick={() => onNavigate(section, sub)}
        className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors ${
          isActive
            ? 'bg-vloom-accent/15 text-vloom-accent'
            : 'text-vloom-muted hover:text-vloom-text hover:bg-vloom-border/50'
        }`}
      >
        {icon}
        <span>{label}</span>
      </button>
    );
  };

  return (
    <aside className="w-56 flex-shrink-0 border-r border-vloom-border bg-vloom-surface flex flex-col min-h-screen">
      {/* Logo - alineado a wearevloom.com */}
      <div className="p-4 border-b border-vloom-border">
        <a
          href="https://wearevloom.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-vloom-text hover:opacity-90 transition-opacity"
          aria-label="Vloom – Lead Generator"
        >
          <img
            src="/logo-vloom.svg"
            alt="Vloom"
            className="h-5 w-auto"
          />
          <span className="text-[11px] text-vloom-muted font-normal hidden sm:inline">Lead Generator</span>
        </a>
      </div>

      <nav className="flex-1 p-3 space-y-0.5">
        {/* Tasks */}
        {navItem('tasks', 'Tasks', <CheckSquare className="w-4 h-4" />)}

        {/* Discovery (expandible) */}
        <div>
          <button
            onClick={() => {
              setDiscoveryOpen(!discoveryOpen);
              if (!discoveryOpen) onNavigate('discovery', activeDiscoverySub ?? 'new-search');
            }}
            className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors ${
              activeSection === 'discovery'
                ? 'bg-vloom-accent/15 text-vloom-accent'
                : 'text-vloom-muted hover:text-vloom-text hover:bg-vloom-border/50'
            }`}
          >
            <span className="flex items-center gap-3">
              <LayoutGrid className="w-4 h-4" />
              Discovery
            </span>
            {discoveryOpen ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
          {discoveryOpen && (
            <div className="ml-4 mt-0.5 space-y-0.5 border-l border-vloom-border pl-2">
              {DISCOVERY_SUBS.map(({ id, label, icon }) =>
                navItem('discovery', label, icon, id)
              )}
            </div>
          )}
        </div>

        {/* CRM */}
        {navItem('crm', 'CRM', <LayoutGrid className="w-4 h-4" />)}

        {/* KPIs */}
        {navItem('kpis', 'KPIs', <BarChart3 className="w-4 h-4" />)}
      </nav>

      <div className="p-3 border-t border-vloom-border space-y-2">
        {userEmail != null && (
          <p className="text-xs text-vloom-muted truncate" title={userEmail}>
            {userEmail}
          </p>
        )}
        {onSignOut && (
          <button
            type="button"
            onClick={onSignOut}
            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium text-vloom-muted hover:text-vloom-text hover:bg-vloom-border/50 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        )}
        <p className="text-xs text-vloom-muted">
          <a href="https://wearevloom.com" target="_blank" rel="noopener noreferrer" className="hover:text-vloom-text transition-colors">
            wearevloom.com
          </a>
        </p>
      </div>
    </aside>
  );
}
