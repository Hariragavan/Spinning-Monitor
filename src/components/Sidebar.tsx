import React, { useState } from 'react';
import {
  LayoutDashboard, FileUp, Settings, TrendingUp, Users, Coins, Trophy,
  Gauge, Monitor, BarChart3, Calendar, Database, Grid3X3, Wrench, UserCheck,
  FileText, Star, AlertTriangle, Search, Table, Menu, ArrowLeft, Layers, Activity,
  FileSpreadsheet
} from 'lucide-react';
import { cn } from '../lib/utils';

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  badge?: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onTvMode: () => void;
  onSeedData: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Daily Operations',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'all-data', label: 'All Data Master Table', icon: Table },
      { id: 'assignments', label: 'Machine Allocation', icon: UserCheck },
      { id: 'count-summary', label: 'Count Summary', icon: Layers },
      { id: 'reports', label: 'Daily Statement', icon: TrendingUp },
      { id: 'daily-incentive', label: 'Daily Incentive', icon: Coins },
      { id: 'daily-incentive-machine', label: 'Daily Incentive (Machine)', icon: Grid3X3 },
    ]
  },
  {
    title: 'Monthly Analytics',
    items: [
      { id: 'monthly-count-gpss', label: 'Monthly Count GPSS', icon: FileSpreadsheet },
      { id: 'month-view', label: 'Monthly Incentive Grid', icon: Calendar },
      { id: 'month-abstract', label: 'Monthly Abstract', icon: BarChart3 },
      { id: 'incentive-ledger-report', label: 'Incentive Ledger & Abstract', icon: FileText },
      { id: 'sider-monthly-performance', label: 'Sider Monthly Performance', icon: FileText },
      { id: 'operator-em-format', label: 'Operator EM Format', icon: FileText },
    ]
  },
  {
    title: 'AI & Maintenance',
    items: [
      { id: 'ai-month-view', label: 'AI Monthly Incentive', icon: Calendar },
      { id: 'ai-month-abstract', label: 'AI Monthly Abstract', icon: BarChart3 },
      { id: 'ai-monthly-performance', label: 'AI Monthly Performance', icon: FileText },
      { id: 'fitter-monthly-performance', label: 'Fitter Monthly Performance', icon: Wrench },
    ]
  },
  {
    title: 'Performance & Awards',
    items: [
      { id: 'running-count-incentives', label: 'Incentive Based in GPS', icon: Coins },
      { id: 'best-shift', label: 'Best Shift', icon: Star },
      { id: 'best', label: 'Best Sider of the Month', icon: Trophy },
      { id: 'best-operators-em', label: 'Best 2 Operators EM', icon: Trophy },
      { id: 'em-outliers-compare', label: 'EM Outliers Compare', icon: AlertTriangle },
    ]
  },
  {
    title: 'Master Data & System',
    items: [
      { id: 'workers', label: 'Employee Master', icon: Users },
      { id: 'machine-master', label: 'Machine Master', icon: Wrench },
      { id: 'counts', label: 'Count Master', icon: Gauge },
      { id: 'incentive-master', label: 'Incentive Master', icon: Coins },
      { id: 'upload', label: 'Upload Data', icon: FileUp },
      { id: 'settings', label: 'Settings', icon: Settings },
    ]
  }
];

export const ALL_NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap(s => s.items);

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  onTvMode,
  onSeedData,
  isCollapsed = false,
  onToggleCollapse
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const activeItemLabel = NAV_SECTIONS
    .flatMap(s => s.items)
    .find(item => item.id === activeTab)?.label || activeTab;

  const filteredSections = NAV_SECTIONS.map(section => ({
    ...section,
    items: section.items.filter(item =>
      item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.id.toLowerCase().includes(searchQuery.toLowerCase())
    )
  })).filter(section => section.items.length > 0);

  return (
    <aside
      className={cn(
        "bg-white border-r border-stone-200/80 flex flex-col h-screen select-none transition-all duration-300 ease-in-out z-40 shrink-0 overflow-x-hidden",
        isCollapsed ? "w-[68px]" : "w-60"
      )}
    >
      {/* Brand Header */}
      <div className={cn(
        "h-14 border-b border-stone-200/80 bg-white shrink-0 flex items-center transition-all duration-300",
        isCollapsed ? "justify-center px-1.5" : "px-3 gap-2"
      )}>
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="p-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 hover:text-stone-900 border border-stone-200/80 transition-all cursor-pointer shadow-2xs active:scale-95 shrink-0 group"
            title={isCollapsed ? "Open menu" : "Close menu"}
          >
            {isCollapsed ? (
              <Menu size={17} className="transition-transform group-hover:scale-110" />
            ) : (
              <ArrowLeft size={17} className="transition-transform group-hover:-translate-x-0.5" />
            )}
          </button>
        )}

        {!isCollapsed && (
          <div className="flex items-center min-w-0 flex-1 overflow-hidden transition-all duration-300">
            <img 
              src="/scm-logo-horizontal.png" 
              alt="SCM Textile Spinners" 
              className="h-10.5 w-auto max-w-[195px] object-contain drop-shadow-2xs" 
            />
          </div>
        )}
      </div>

      {/* Quick Search (Only when expanded) */}
      {!isCollapsed && (
        <div className="px-3 pt-2.5 pb-1 shrink-0">
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              placeholder="Search views..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-stone-50 border border-stone-200/80 rounded-xl pl-7 pr-2.5 py-1 text-[11px] font-bold text-stone-700 placeholder-stone-400 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            />
          </div>
        </div>
      )}

      {/* Navigation Sections */}
      <nav className={cn(
        "flex-1 overflow-y-auto overflow-x-hidden no-scrollbar",
        isCollapsed ? "px-1.5 py-2.5 space-y-2" : "px-2.5 py-2.5 space-y-3"
      )}>
        {filteredSections.map((section, idx) => (
          <div key={section.title} className="space-y-0.5">
            {/* Section Title when Expanded or Divider when Collapsed */}
            {!isCollapsed ? (
              <div className="px-2.5 pt-1.5 pb-0.5 text-[8.5px] font-black uppercase tracking-[0.2em] text-stone-400">
                {section.title}
              </div>
            ) : (
              idx > 0 && <div className="w-5 h-px bg-stone-200 my-1.5 mx-auto" />
            )}

            {section.items.map((item) => {
              const isActive = activeTab === item.id;
              const Icon = item.icon;

              if (isCollapsed) {
                return (
                  <div key={item.id} className="flex justify-center w-full">
                    <button
                      onClick={() => setActiveTab(item.id)}
                      title={item.label}
                      className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-150 cursor-pointer relative",
                        isActive
                          ? "bg-stone-900 text-white shadow-md ring-2 ring-stone-900/10 font-bold"
                          : "text-stone-500 hover:text-stone-900 hover:bg-stone-100"
                      )}
                    >
                      <Icon
                        size={17}
                        className={cn(
                          "shrink-0 transition-colors",
                          isActive ? "text-emerald-400" : "text-stone-500 hover:text-stone-900"
                        )}
                      />
                      {isActive && (
                        <span className="absolute -left-1 top-2 bottom-2 w-1 bg-emerald-500 rounded-r-full" />
                      )}
                    </button>
                  </div>
                );
              }

              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all duration-150 group text-left cursor-pointer",
                    isActive
                      ? "bg-stone-900 text-stone-50 shadow-sm font-black translate-x-0.5"
                      : "text-stone-600 hover:text-stone-900 hover:bg-stone-100 font-bold text-xs"
                  )}
                >
                  <Icon
                    size={15}
                    className={cn(
                      "shrink-0 transition-colors",
                      isActive ? "text-emerald-400" : "text-stone-400 group-hover:text-stone-800"
                    )}
                  />
                  <span className="text-[11.5px] truncate leading-tight flex-1">
                    {item.label}
                  </span>
                  {item.badge && (
                    <span className="text-[7.5px] font-black uppercase px-1 py-0.5 rounded bg-emerald-100 text-emerald-800">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}

        {/* Action Buttons inside Nav */}
        <div className={cn("pt-2 border-t border-stone-100", isCollapsed ? "space-y-1.5 flex flex-col items-center" : "space-y-1.5")}>
          {isCollapsed ? (
            <>
              <div className="flex justify-center w-full">
                <button
                  onClick={() => {
                    if (window.confirm('Import historical data for April 2026? This will merge with Database history.')) {
                      onSeedData();
                    }
                  }}
                  title="Import History"
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-all cursor-pointer"
                >
                  <Database size={16} className="text-amber-600" />
                </button>
              </div>

              <div className="flex justify-center w-full">
                <button
                  onClick={onTvMode}
                  title="Play TV Mode"
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-all cursor-pointer shadow-2xs"
                >
                  <Monitor size={16} className="text-emerald-600" />
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                onClick={() => {
                  if (window.confirm('Import historical data for April 2026? This will merge with Database history.')) {
                    onSeedData();
                  }
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all text-left text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200/80 cursor-pointer font-black text-[10.5px] uppercase tracking-wider"
              >
                <Database size={15} className="shrink-0 text-amber-600" />
                <span>Import History</span>
              </button>

              <button
                onClick={onTvMode}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all text-left text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 shadow-2xs cursor-pointer font-black text-[10.5px] uppercase tracking-wider"
              >
                <Monitor size={15} className="shrink-0 text-emerald-600" />
                <span>Play TV Mode</span>
              </button>
            </>
          )}
        </div>
      </nav>

      {/* Sidebar Footer */}
      <div className={cn(
        "border-t border-stone-200/80 bg-stone-50/50 shrink-0",
        isCollapsed ? "p-3 flex justify-center" : "p-3.5"
      )}>
        {isCollapsed ? (
          <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700 overflow-hidden border border-emerald-200 font-black text-xs uppercase shadow-2xs cursor-default" title="Direct Access • Database Connected">
            AD
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700 overflow-hidden border border-emerald-200 shrink-0 font-black text-xs uppercase shadow-xs">
              AD
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-black text-stone-900 truncate uppercase leading-tight">Direct Access</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <p className="text-[9px] font-bold text-emerald-700 uppercase tracking-widest leading-none">Database Connected</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
