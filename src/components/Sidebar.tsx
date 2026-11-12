import React, { useState } from 'react';
import {
  LayoutDashboard, FileUp, Settings, TrendingUp, Users, Coins, Trophy,
  Gauge, Monitor, BarChart3, Calendar, Database, Grid3X3, Wrench, UserCheck,
  FileText, Star, AlertTriangle, Search, Table, Menu, ArrowLeft, Layers, Activity,
  FileSpreadsheet, Cpu, Clock
} from 'lucide-react';
import { cn } from '../lib/utils';

export interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  badge?: string;
  emoji?: string;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export interface SidebarProps {
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
    title: 'IOT Dashboard',
    items: [
      { id: 'iot-machine-dashboard', label: 'Machine Dashboard', icon: Cpu, badge: 'Live' },
      { id: 'iot-daily-production', label: 'Daily Production', icon: Layers },
      { id: 'iot-employee-dashboard', label: 'Employee Dashboard', icon: Users },
      { id: 'iot-reports', label: 'Reports (5)', icon: BarChart3 },
      { id: 'iot-maintenance', label: 'Maintenance Calendar', icon: Calendar },
      { id: 'iot-configuration', label: 'Configuration', icon: Settings },
      { id: 'iot-shifts', label: 'Shift Configuration', icon: Clock },
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
        "flex flex-col h-screen select-none transition-all duration-300 ease-in-out z-40 shrink-0 overflow-x-hidden bg-white text-stone-900 border-r border-stone-200/80 shadow-xs",
        isCollapsed ? "w-[68px]" : "w-[250px]"
      )}
    >
      {/* Brand Header */}
      <div className={cn(
        "h-16 shrink-0 flex items-center border-b border-stone-200/80 px-3 gap-2 transition-all duration-300",
        isCollapsed && "justify-center px-1.5"
      )}>
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="p-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 hover:text-stone-900 border border-stone-200/80 transition-all cursor-pointer active:scale-95 shrink-0 group"
            title={isCollapsed ? "Open menu" : "Close menu"}
          >
            {isCollapsed ? (
              <Menu size={16} className="transition-transform group-hover:scale-110" />
            ) : (
              <ArrowLeft size={16} className="transition-transform group-hover:-translate-x-0.5" />
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

      {/* Quick Search */}
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
        "flex-1 overflow-y-auto overflow-x-hidden no-scrollbar px-2.5 py-2 space-y-2.5",
        isCollapsed && "px-1.5 py-2 space-y-2"
      )}>
        {filteredSections.map((section, idx) => (
          <div key={section.title} className="space-y-1">
            {!isCollapsed ? (
              <div className="px-2.5 pb-1 text-[9.5px] font-extrabold uppercase tracking-[1.5px] text-stone-400 flex items-center justify-between">
                <span>{section.title}</span>
                {section.title === 'IOT Dashboard' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                )}
              </div>
            ) : (
              idx > 0 && <div className="w-5 h-px my-1.5 mx-auto bg-stone-200" />
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
                      {item.emoji ? (
                        <span className="text-base">{item.emoji}</span>
                      ) : (
                        <Icon
                          size={17}
                          className={cn(
                            "shrink-0 transition-colors",
                            isActive ? "text-emerald-400" : "text-stone-500 hover:text-stone-900"
                          )}
                        />
                      )}
                      {item.badge && (
                        <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white" />
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
                    "w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all duration-150 group text-left cursor-pointer",
                    isActive
                      ? "bg-stone-900 text-stone-50 shadow-sm font-black translate-x-0.5"
                      : "text-stone-600 hover:text-stone-900 hover:bg-stone-100 font-bold text-xs"
                  )}
                >
                  {item.emoji ? (
                    <span className="text-base shrink-0 leading-none">{item.emoji}</span>
                  ) : (
                    <Icon
                      size={16}
                      className={cn(
                        "shrink-0 transition-colors",
                        isActive ? "text-emerald-400" : "text-stone-400 group-hover:text-stone-800"
                      )}
                    />
                  )}
                  <span className="text-[13px] truncate leading-tight flex-1">
                    {item.label}
                  </span>
                  {item.badge && (
                    <span className={cn(
                      "text-[8px] font-black uppercase px-1.5 py-0.5 rounded",
                      isActive ? "bg-emerald-500/20 text-emerald-300" : "bg-emerald-100 text-emerald-800"
                    )}>
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

      {/* Sidebar Footer User Card */}
      <div className={cn(
        "border-t border-stone-200/80 bg-stone-50/50 shrink-0",
        isCollapsed ? "p-3 flex justify-center" : "p-3.5"
      )}>
        {isCollapsed ? (
          <div className="w-8 h-8 rounded-xl flex items-center justify-center overflow-hidden font-black text-xs uppercase shadow-2xs cursor-default bg-emerald-100 text-emerald-700 border border-emerald-200">
            AD
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center overflow-hidden shrink-0 font-black text-xs uppercase shadow-xs bg-emerald-100 text-emerald-700 border border-emerald-200">
              AD
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-black text-stone-900 truncate uppercase leading-tight">
                Direct Access
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full animate-pulse bg-emerald-500" />
                <p className="text-[9px] font-bold uppercase tracking-widest leading-none text-emerald-700">
                  Database Connected
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
