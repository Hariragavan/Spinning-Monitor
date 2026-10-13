import React from 'react';
import { IncentiveRule, DailyReport } from '../types';
import { Coins, HelpCircle, FileText, Printer, CheckCircle, Info, ChevronDown, Download, FileSpreadsheet } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import * as XLSX from 'xlsx';
import { CalendarDatePicker } from './CalendarPickers';

interface RunningCountIncentivesProps {
  rules: IncentiveRule[];
  isTvMode?: boolean;
  report?: DailyReport;
  history?: DailyReport[];
  onSelectDate?: (date: string) => void;
}

// Robust helper to compare count names
const isCountMatching = (ruleCount: string, activeCount: string) => {
  const rc = ruleCount.trim().toLowerCase();
  const ac = activeCount.trim().toLowerCase();
  if (rc === ac) return true;
  // Normalized match (ignoring dashes, slashes, underscores, and spaces)
  const normRc = rc.replace(/[-/\s_]/g, '');
  const normAc = ac.replace(/[-/\s_]/g, '');
  return normRc === normAc || rc.includes(ac) || ac.includes(rc);
};

export const RunningCountIncentives: React.FC<RunningCountIncentivesProps> = ({ 
  rules, 
  isTvMode = false, 
  report,
  history = [],
  onSelectDate
}) => {
  const [showOnlyActive, setShowOnlyActive] = React.useState(true);

  // Helper to get first numeric value from count string for sorting
  const getNumericValue = (countStr: string) => {
    const match = countStr.match(/\d+/);
    return match ? parseInt(match[0], 10) : 0;
  };

  // Get active counts running on the 6 machines (K01 to K06)
  const activeCountsOnMachines = React.useMemo(() => {
    if (!report) return null;
    
    const counts = new Set<string>();
    const targetMachines = ['K01', 'K02', 'K03', 'K04', 'K05', 'K06', 'K1', 'K2', 'K3', 'K4', 'K5', 'K6'];
    
    // Check summaries
    if (report.summaries && report.summaries.length > 0) {
      report.summaries.forEach(s => {
        if (targetMachines.includes(s.frameNo) && s.count) {
          counts.add(s.count.trim());
        }
      });
    }
    
    // Check entries as well
    if (report.entries && report.entries.length > 0) {
      report.entries.forEach(e => {
        if (targetMachines.includes(e.frameNo) && e.count) {
          counts.add(e.count.trim());
        }
      });
    }
    
    return counts;
  }, [report]);

  // Filter standard (non-AI Linkconer) rules based on active running counts
  const standardRules = React.useMemo(() => {
    const allStd = rules.filter(r => r.department !== 'AI Linkconer');
    const activeList = activeCountsOnMachines ? Array.from(activeCountsOnMachines) : [];
    
    // Find active counts that are standard (do not contain 'ai' or 'cone')
    const activeStdCounts = activeList.filter(ac => {
      const isAi = ac.toLowerCase().includes('ai') || ac.toLowerCase().includes('cone') || ac.toLowerCase().includes('link');
      return !isAi;
    });

    if (!showOnlyActive) {
      // Return all standard rules, marked as active if running
      return allStd.map(rule => ({
        ...rule,
        isActive: activeStdCounts.some(ac => isCountMatching(rule.count, ac)),
        isPlaceholder: false
      }));
    }

    // Otherwise, filter to only active standard counts
    // 1. Matched standard rules
    const matched = allStd.filter(rule => 
      activeStdCounts.some(ac => isCountMatching(rule.count, ac))
    ).map(rule => ({ ...rule, isActive: true, isPlaceholder: false }));

    // 2. Unmatched active standard counts (virtual placeholders)
    const missing = activeStdCounts.filter(ac => 
      !allStd.some(rule => isCountMatching(rule.count, ac))
    );

    const placeholders = missing.map(ac => ({
      id: `placeholder-std-${ac}`,
      count: ac,
      department: 'Sider',
      payouts: [],
      isPlaceholder: true,
      isActive: true
    }));

    return [...matched, ...placeholders];
  }, [rules, activeCountsOnMachines, showOnlyActive]);

  const sortedStandardRules = [...standardRules].sort((a, b) => getNumericValue(a.count) - getNumericValue(b.count));

  // Define standard columns (INR payout amounts) dynamically from the active standard rules
  const payoutColumns = React.useMemo(() => {
    const nonPlaceholderRules = sortedStandardRules.filter(r => !r.isPlaceholder);
    if (nonPlaceholderRules.length > 0) {
      return Array.from(new Set(nonPlaceholderRules.flatMap(r => r.payouts.map(p => p.amount)))).sort((a, b) => a - b);
    }
    return [80, 85, 95, 100, 110];
  }, [sortedStandardRules]);

  // AI Linkconer always uses the same rules statically (no count filtering)
  const sortedAiRules = React.useMemo(() => {
    return rules
      .filter(r => r.department === 'AI Linkconer')
      .sort((a, b) => getNumericValue(a.count) - getNumericValue(b.count));
  }, [rules]);

  // Define AI Linkconer columns dynamically from active AI rules
  const aiLinkconerPayoutColumns = React.useMemo(() => {
    if (sortedAiRules.length > 0) {
      return Array.from(new Set(sortedAiRules.flatMap(r => r.payouts.map(p => p.amount)))).sort((a, b) => b - a);
    }
    return [100, 90, 80];
  }, [sortedAiRules]);

  // Helper to get GPS threshold for a static payout amount from a rule
  const getGpsThreshold = (rule: any, targetAmount: number) => {
    if (!rule || rule.isPlaceholder) return null;
    // Find precise match for payout amount
    const match = rule.payouts.find((p: any) => p.amount === targetAmount);
    return match ? match.gpsThreshold : null;
  };

  const handlePrint = () => {
    window.print();
  };

  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();
    const rows = sortedStandardRules.map(rule => {
      const obj: any = {
        'Yarn Count': rule.count
      };
      payoutColumns.forEach(amount => {
        const threshold = getGpsThreshold(rule, amount);
        obj[`₹${amount}`] = threshold !== null ? threshold : '—';
      });
      return obj;
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'GPS Incentive Matrix');
    XLSX.writeFile(wb, `Incentive_Matrix_Based_On_GPS.xlsx`);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Printable Sheet Header */}
      <div className="hidden print-only mb-6 border-b-2 border-black pb-3 text-center">
        <h1 className="text-xl font-black uppercase tracking-tight text-black keep-size">KTTM SPINNING MILLS - UNIT 01</h1>
        <h2 className="text-base font-extrabold uppercase tracking-wider text-black keep-size mt-0.5">Incentive Amount Matrix Based in GPS</h2>
        <div className="flex justify-between items-center text-xs font-bold mt-2 pt-1 border-t border-stone-300 text-black">
          <span>Department: <strong>Ringframe Spinning</strong></span>
          <span>Standard Slots: <strong>₹60 to ₹120</strong></span>
          <span>Status: <strong>Active Matrix</strong></span>
        </div>
      </div>

      {/* Page Header */}
      {!isTvMode && (
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 bg-white p-8 rounded-[2.5rem] border border-stone-200 shadow-sm no-print">
          <div className="text-left">
            <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 px-4 py-2 rounded-2xl border border-emerald-100 mb-4">
              <Coins size={18} />
              <span className="text-xs font-black uppercase tracking-widest">Digital Display Table</span>
            </div>
            <h2 className="text-4xl font-black text-stone-900 tracking-tight uppercase leading-none">
              Incentive Amount Based in GPS
            </h2>
            <p className="text-[11px] font-bold text-stone-400 uppercase tracking-widest mt-3">
              Quick reference matrix showing GPS targets to achieve standard incentive slots
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button 
              onClick={handlePrint}
              className="flex items-center gap-2 bg-stone-900 text-white px-6 py-3.5 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-stone-800 transition-all shadow-xl shadow-stone-200 active:scale-95 whitespace-nowrap cursor-pointer"
            >
              <Printer size={16} /> Print Matrix
            </button>
            <button 
              onClick={exportToExcel}
              className="flex items-center gap-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 px-6 py-3.5 rounded-2xl font-black uppercase tracking-widest text-xs transition-all shadow-sm active:scale-95 whitespace-nowrap cursor-pointer"
              title="Download as Excel (.xlsx)"
            >
              <FileSpreadsheet size={16} /> Export Excel
            </button>
          </div>
        </div>
      )}

      {/* Control Panel: Date Picker & Filter Toggle */}
      {!isTvMode && (
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 bg-stone-50 border border-stone-200 rounded-[2.5rem] p-6 no-print">
          {/* Left Side: Date Calendar Picker */}
          {onSelectDate && report && (
            <div className="flex items-center gap-3">
              <span className="text-xs font-black text-stone-500 uppercase tracking-wider">Active Statement Date:</span>
              <CalendarDatePicker
                value={report.date}
                onChange={(d) => {
                  if (d && d !== report.date) {
                    onSelectDate(d);
                  }
                }}
              />
            </div>
          )}

          {/* Right Side: Toggle Switch */}
          <div className="flex items-center gap-4">
            <span className="text-xs font-black text-stone-500 uppercase tracking-widest">
              {showOnlyActive ? "Showing Only Running Counts" : "Showing All Configured Counts"}
            </span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer"
                checked={showOnlyActive}
                onChange={(e) => setShowOnlyActive(e.target.checked)}
              />
              <div className="w-14 h-7 bg-stone-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-6 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>
        </div>
      )}

      <div className="bg-white p-4 md:p-6 rounded-2xl border border-stone-200 shadow-md overflow-hidden relative">
        <div className="max-w-[100%] mx-auto">
          {/* Centered Table Title */}
          <div className="text-center mb-6">
            <h1 className="text-xl md:text-2xl font-black text-stone-950 uppercase tracking-wider leading-none pb-2 inline-block">
              Running Count incentive Master
            </h1>
            <div className="bg-gradient-to-r from-transparent via-emerald-600 to-transparent h-1 w-64 mx-auto rounded-full mt-0.5" />
          </div>

          {/* Matrix Table */}
          <div className="overflow-x-auto rounded-xl border-2 border-emerald-950 shadow-md">
            <table className="w-full text-center border-collapse table-fixed">
              <thead>
                <tr className="bg-emerald-950 text-white border-b-2 border-emerald-950 h-14">
                  {/* First cell with high-contrast text */}
                  <th className="w-44 px-3 border-r border-emerald-900 bg-emerald-900 text-white">
                    <div className="text-yellow-300 tracking-wider uppercase text-[11px] font-black leading-tight">Incentive Amount</div>
                    <div className="text-emerald-100 uppercase tracking-wider text-[9px] font-bold">(in Rupees / Rs)</div>
                  </th>
                  {payoutColumns.map(amount => (
                    <th key={amount} className="px-3 border-r border-emerald-900 bg-emerald-950 text-white last:border-r-0">
                      <div className="flex flex-col items-center justify-center">
                        <span className="text-lg md:text-xl font-black tabular-nums tracking-tight text-yellow-300">₹{amount}</span>
                        <span className="text-[9px] font-bold text-emerald-200 uppercase tracking-wider">Payout Amt</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedStandardRules.map((matchedRule, idx) => {
                  const count = matchedRule.count;
                  const isPlaceholder = !!(matchedRule as any).isPlaceholder;
                  const isActive = !!(matchedRule as any).isActive;
                  
                  return (
                    <tr key={`std-rule-${count}-${idx}`} className={cn(
                      "border-b last:border-b-0 border-emerald-950/80 h-12 hover:bg-emerald-50/20 transition-colors",
                      isActive && "bg-emerald-50/10"
                    )}>
                      {/* Count Name Column */}
                      <td className="px-3 py-2 text-xs md:text-sm font-black text-white border-r border-emerald-950 bg-emerald-900 sticky left-0 z-10 font-mono text-left uppercase">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5">
                            <div className={cn(
                              "w-2 h-2 rounded-full shrink-0",
                              isActive ? "bg-yellow-300 animate-pulse animate-duration-1000" : "bg-stone-500"
                            )} />
                            <span>{count}</span>
                          </div>
                          {isActive && (
                            <span className="text-[8px] font-black text-yellow-300 tracking-wider uppercase ml-3.5 leading-none">
                              ● Live
                            </span>
                          )}
                          {isPlaceholder && (
                            <span className="text-[8px] font-black text-orange-300 tracking-wider uppercase ml-3.5 leading-none animate-pulse">
                              ⚠️ Missing
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Threshold cells or Placeholder warning */}
                      {isPlaceholder ? (
                        <td 
                          colSpan={payoutColumns.length} 
                          className="px-3 py-2 text-left bg-orange-50/40 border-r border-emerald-200/60 font-black text-orange-950 uppercase tracking-wider text-[10px]"
                        >
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5">
                              <Info size={14} className="text-orange-600 shrink-0" />
                              Active count on machine but no payouts configured.
                            </span>
                            <span className="bg-orange-600 text-white px-2 py-1 rounded text-[8px] font-black uppercase tracking-wider shrink-0 shadow-xs">
                              Setup in Master
                            </span>
                          </div>
                        </td>
                      ) : (
                        payoutColumns.map(amount => {
                          const threshold = getGpsThreshold(matchedRule, amount);
                          
                          return (
                            <td 
                              key={amount} 
                              className="px-2 py-2 text-xs font-bold text-stone-900 border-r border-emerald-200/60 last:border-r-0 bg-white tabular-nums font-mono"
                            >
                              {threshold !== null ? (
                                <div className="flex flex-col items-center justify-center">
                                  <span className="text-sm md:text-base font-black text-emerald-950 tracking-tight">{threshold}</span>
                                  <span className="text-[8px] font-bold tracking-wider text-emerald-700 uppercase">GPS Min</span>
                                </div>
                              ) : (
                                <span className="text-stone-300 font-bold text-sm">—</span>
                              )}
                            </td>
                          );
                        })
                      )}
                    </tr>
                  );
                })}
                {sortedStandardRules.length === 0 && (
                  <tr>
                    <td colSpan={payoutColumns.length + 1} className="py-14 text-stone-400 font-black uppercase text-lg tracking-widest bg-stone-50/50 italic">
                      No Sider counts running on {report?.date || 'this date'}. Toggle "Showing All" to inspect all rules.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* AI Linkconer Section */}
          <div className="mt-8 text-center mb-4">
            <h2 className="text-xl font-black text-purple-950 uppercase tracking-wider leading-none pb-2 inline-block">
              AI Linkconer Incentive Master
            </h2>
            <div className="bg-gradient-to-r from-transparent via-purple-600 to-transparent h-1 w-64 mx-auto rounded-full mt-0.5" />
          </div>

          <div className="overflow-x-auto rounded-xl border-2 border-purple-950 shadow-md mb-6">
            <table className="w-full text-center border-collapse table-fixed">
              <thead>
                <tr className="bg-purple-950 text-white border-b-2 border-purple-950 h-14">
                  {/* First cell with the split content */}
                  <th className="w-44 px-3 border-r border-purple-900 bg-purple-900 text-white">
                    <div className="text-amber-300 tracking-wider uppercase text-[11px] font-black leading-tight">Incentive Amount</div>
                    <div className="text-purple-100 uppercase tracking-wider text-[9px] font-bold">(in Rupees / Rs)</div>
                  </th>
                  {aiLinkconerPayoutColumns.map(amount => (
                    <th key={amount} className="px-3 border-r border-purple-900 bg-purple-950 text-white last:border-r-0">
                      <div className="flex flex-col items-center justify-center">
                        <span className="text-lg md:text-xl font-black tabular-nums tracking-tight text-amber-300">₹{amount}</span>
                        <span className="text-[9px] font-bold text-purple-200 uppercase tracking-wider">Payout Amt</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedAiRules.map((rule, idx) => {
                  const displayCount = rule.count || 'AI LINKCONER';
                  return (
                    <tr key={`ai-rule-${rule.count || 'ai'}-${idx}`} className="border-b last:border-b-0 border-purple-950/80 h-12 hover:bg-purple-50/20 transition-colors">
                      {/* Count Name Column */}
                      <td className="px-3 py-2 text-xs md:text-sm font-black text-white border-r border-purple-950 bg-purple-900 sticky left-0 z-10 font-mono text-left uppercase">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full shrink-0 bg-purple-400" />
                            <span>{displayCount}</span>
                          </div>
                        </div>
                      </td>

                      {/* Threshold cells */}
                      {aiLinkconerPayoutColumns.map(amount => {
                        const threshold = getGpsThreshold(rule, amount);
                        
                        return (
                          <td 
                            key={amount} 
                            className="px-2 py-2 text-xs font-bold text-stone-900 border-r border-purple-200/60 last:border-r-0 bg-white tabular-nums font-mono"
                          >
                            {threshold !== null ? (
                              <div className="flex flex-col items-center justify-center">
                                <span className="text-sm md:text-base font-black text-purple-950 tracking-tight">{threshold}%</span>
                                <span className="text-[8px] font-bold tracking-wider text-purple-700 uppercase">Util Min</span>
                              </div>
                            ) : (
                              <span className="text-stone-300 font-bold text-sm">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {sortedAiRules.length === 0 && (
                  <tr>
                    <td colSpan={aiLinkconerPayoutColumns.length + 1} className="py-8 text-stone-400 font-bold uppercase text-xs tracking-wider bg-stone-50/50 italic">
                      No AI Linkconer rules defined in Incentive Master.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Reference guidelines */}
          <div className="mt-14 bg-stone-50 rounded-3xl p-8 border border-stone-200">
            <h4 className="text-lg font-black uppercase text-stone-800 tracking-wider flex items-center gap-2 mb-3">
              <CheckCircle size={20} className="text-emerald-600" />
              Dynamic Sync with Incentive Master
            </h4>
            <p className="text-sm font-bold text-stone-500 leading-relaxed uppercase tracking-normal">
              This quick display references your official active rules inside the <span className="text-emerald-700">Incentive Master</span>. If you update or modify payouts in the settings, this running count matrix updates automatically of all matching criteria.
            </p>
          </div>
        </div>
      </div>

      {/* Print Signature Footer Block */}
      <div className="hidden print-signatures">
        <div className="print-signature-box">
          Prepared By
        </div>
        <div className="print-signature-box">
          Technical / Spinning Master
        </div>
        <div className="print-signature-box">
          General Manager
        </div>
      </div>
    </div>
  );
};
