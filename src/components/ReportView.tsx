import React, { useState, useMemo } from 'react';
import { DailyReport, Shed, Shift } from '../types';
import { cn, parseUniversalDateParts } from '../lib/utils';
import { Printer, Download, FileSpreadsheet, Calendar, ChevronDown, Check, Building2, Layers } from 'lucide-react';
import * as XLSX from 'xlsx';

export interface ReportViewProps {
  report: DailyReport;
  isTvMode?: boolean;
  allReports?: DailyReport[];
  currentShed?: Shed | string;
  onSelectShed?: (shed: any) => void;
  onSelectDate?: (date: string) => void;
  availableDates?: string[];
}

export interface ShedProductionRow {
  shedKey: Shed;
  displayName: string;
  rfCount: number;
  stdKg: number;
  achievedKg: number;
  effPercent: number;
  report?: DailyReport;
}

export interface AllShedReportData {
  date: string;
  rows: ShedProductionRow[];
  kttmRow: ShedProductionRow;
  groupedRowSpan3Subtotal: number;
  totalRf: number;
  totalStd: number;
  totalAchieved: number;
  totalEff: number;
}

export const SHED_CONFIGS: { shedKey: Shed; displayName: string; shortName: string }[] = [
  { shedKey: 'KTTM', displayName: 'KTTM', shortName: 'KTTM' },
  { shedKey: 'Shed 1', displayName: '1st Shed', shortName: '1st Shed' },
  { shedKey: 'Shed 2', displayName: '2nd Shed', shortName: '2nd Shed' },
  { shedKey: 'Shed 3', displayName: 'PC Shed', shortName: 'PC Shed' },
];

/**
 * Calculates the exact All-Sheds Spinning Production Report matching the user's executive format.
 */
export function computeAllShedReport(
  targetDate: string,
  primaryReport: DailyReport,
  allReports?: DailyReport[]
): AllShedReportData {
  const targetParts = parseUniversalDateParts(targetDate);

  // Pool of all reports prioritizing primaryReport
  const pool: DailyReport[] = [
    ...(primaryReport ? [primaryReport] : []),
    ...(allReports && allReports.length > 0 ? allReports : [])
  ];

  const rows: ShedProductionRow[] = SHED_CONFIGS.map(conf => {
    // Find matching report strictly for this shed on this date
    const match = pool.find(r => {
      const rShed = r.shed || 'Shed 1';
      if (rShed !== conf.shedKey) return false;
      if (r.date === targetDate) return true;
      if (targetParts) {
        const rp = parseUniversalDateParts(r.date);
        return rp && rp.year === targetParts.year && rp.month === targetParts.month && rp.day === targetParts.day;
      }
      return false;
    });

    const summaries = match?.summaries || [];
    const entries = match?.entries || [];

    const rfCount = summaries.length > 0
      ? summaries.length
      : (entries.length > 0 ? new Set(entries.map(e => e.frameNo)).size : 0);

    const stdKg = Math.round(
      match?.totalProductionTarget
      || summaries.reduce((a, b) => a + (b.targetProd || 0), 0)
      || entries.reduce((a, b) => a + (b.productionTarget || 0), 0)
      || 0
    );

    const achievedKg = Math.round(
      match?.totalProductionActual
      || summaries.reduce((a, b) => a + (b.actualProd || 0), 0)
      || entries.reduce((a, b) => a + (b.productionActual || 0), 0)
      || 0
    );

    const effPercent = stdKg > 0 ? Math.round((achievedKg / stdKg) * 100) : 0;

    return {
      shedKey: conf.shedKey,
      displayName: conf.displayName,
      rfCount,
      stdKg,
      achievedKg,
      effPercent,
      report: match
    };
  });

  const kttmRow = rows.find(r => r.shedKey === 'KTTM') || rows[0];
  const firstShed = rows.find(r => r.shedKey === 'Shed 1') || rows[1];
  const secondShed = rows.find(r => r.shedKey === 'Shed 2') || rows[2];
  const pcShed = rows.find(r => r.shedKey === 'Shed 3') || rows[3];

  // Grouped sub-total for 1st Shed + 2nd Shed + PC Shed
  const groupedRowSpan3Subtotal = (firstShed?.achievedKg || 0) + (secondShed?.achievedKg || 0) + (pcShed?.achievedKg || 0);

  const totalRf = rows.reduce((sum, r) => sum + r.rfCount, 0);
  const totalStd = rows.reduce((sum, r) => sum + r.stdKg, 0);
  const totalAchieved = rows.reduce((sum, r) => sum + r.achievedKg, 0);
  const totalEff = totalStd > 0 ? Math.round((totalAchieved / totalStd) * 100) : 0;

  return {
    date: targetDate,
    rows,
    kttmRow,
    groupedRowSpan3Subtotal,
    totalRf,
    totalStd,
    totalAchieved,
    totalEff
  };
}

/**
 * Standalone Spinning Production Report Table (Matches the exact layout from the image)
 */
export const AllShedSpinningReportTable: React.FC<{
  data: AllShedReportData;
  isTvMode?: boolean;
  selectedShed?: string;
  onSelectShed?: (shed: Shed | string) => void;
}> = ({ data, isTvMode = false, selectedShed, onSelectShed }) => {
  const firstShed = data.rows.find(r => r.shedKey === 'Shed 1');
  const secondShed = data.rows.find(r => r.shedKey === 'Shed 2');
  const pcShed = data.rows.find(r => r.shedKey === 'Shed 3');

  return (
    <div className="w-full flex flex-col items-center">
      {/* Date Header matching the user's image */}
      <div className={cn("text-center font-serif text-stone-900 tracking-wide", isTvMode ? "text-3xl mb-3 font-bold" : "text-base md:text-lg mb-2 font-bold")}>
        <span className="font-semibold text-stone-700 mr-8">Date</span>
        <span className="font-mono font-black">{data.date}</span>
      </div>

      <div className="w-full max-w-2xl overflow-x-auto shadow-xs rounded-xl border-2 border-stone-900 bg-white">
        <table className={cn("w-full border-collapse text-center", isTvMode ? "text-2xl" : "text-sm")}>
          <thead>
            <tr className="border-b-2 border-stone-900 text-stone-900">
              <th className={cn("border-r-2 border-stone-900 font-serif font-black tracking-wider text-left bg-stone-50/50", isTvMode ? "p-3 pl-6 w-44" : "p-2 pl-4 w-32")}></th>
              <th className={cn("border-r-2 border-stone-900 font-bold leading-tight font-serif", isTvMode ? "p-3 w-28" : "p-2 w-20")}>
                No<br />of<br />Rf
              </th>
              <th className={cn("border-r-2 border-stone-900 font-serif font-bold", isTvMode ? "p-3 w-36" : "p-2 w-28")}>STD</th>
              <th className={cn("border-r-2 border-stone-900 font-serif font-bold", isTvMode ? "p-3 w-36" : "p-2 w-28")}>Achieved</th>
              <th className={cn("border-r-2 border-stone-900 font-serif font-bold", isTvMode ? "p-3 w-36" : "p-2 w-28")}>Total</th>
              <th className={cn("font-serif font-bold", isTvMode ? "p-3 w-28" : "p-2 w-20")}>Eff%</th>
            </tr>
          </thead>
          <tbody className="divide-y-2 divide-stone-900">
            {/* Row 1: KTTM */}
            <tr
              onClick={() => onSelectShed && onSelectShed('KTTM')}
              className={cn(
                "transition-colors cursor-pointer",
                selectedShed === 'KTTM' ? "bg-emerald-50/70" : "hover:bg-stone-50"
              )}
              title="Click to view KTTM frames"
            >
              <td className={cn("border-r-2 border-stone-900 font-serif font-bold text-left text-stone-900", isTvMode ? "p-3 pl-6" : "p-2.5 pl-4")}>
                KTTM
              </td>
              <td className={cn("border-r-2 border-stone-900 font-semibold font-mono", isTvMode ? "p-3" : "p-2.5")}>
                {data.kttmRow?.rfCount || 0}
              </td>
              <td className={cn("border-r-2 border-stone-900 font-semibold font-mono", isTvMode ? "p-3" : "p-2.5")}>
                {Math.round(data.kttmRow?.stdKg || 0).toLocaleString('en-IN')}
              </td>
              <td className={cn("border-r-2 border-stone-900 font-semibold font-mono", isTvMode ? "p-3" : "p-2.5")}>
                {Math.round(data.kttmRow?.achievedKg || 0).toLocaleString('en-IN')}
              </td>
              <td className={cn("border-r-2 border-stone-900 font-semibold font-mono", isTvMode ? "p-3" : "p-2.5")}>
                {Math.round(data.kttmRow?.achievedKg || 0).toLocaleString('en-IN')}
              </td>
              <td className={cn(
                "font-mono font-black",
                isTvMode ? "p-3" : "p-2.5",
                (data.kttmRow?.effPercent || 0) >= 90 ? "text-emerald-700" : "text-stone-900"
              )}>
                {data.kttmRow?.effPercent || 0}
              </td>
            </tr>

            {/* Row 2: 1st Shed (with rowSpan 3 for Total column) */}
            <tr
              onClick={() => onSelectShed && onSelectShed('Shed 1')}
              className={cn(
                "transition-colors cursor-pointer",
                selectedShed === 'Shed 1' ? "bg-emerald-50/70" : "hover:bg-stone-50"
              )}
              title="Click to view 1st Shed frames"
            >
              <td className={cn("border-r-2 border-stone-900 font-serif font-bold text-left text-stone-900", isTvMode ? "p-3 pl-6" : "p-2.5 pl-4")}>
                1st Shed
              </td>
              <td className={cn("border-r-2 border-stone-900 font-semibold font-mono", isTvMode ? "p-3" : "p-2.5")}>
                {firstShed?.rfCount || 0}
              </td>
              <td className={cn("border-r-2 border-stone-900 font-semibold font-mono", isTvMode ? "p-3" : "p-2.5")}>
                {Math.round(firstShed?.stdKg || 0).toLocaleString('en-IN')}
              </td>
              <td className={cn("border-r-2 border-stone-900 font-semibold font-mono", isTvMode ? "p-3" : "p-2.5")}>
                {Math.round(firstShed?.achievedKg || 0).toLocaleString('en-IN')}
              </td>

              {/* Grouped Subtotal cell spanning 1st Shed, 2nd Shed, and PC Shed */}
              <td
                rowSpan={3}
                className={cn(
                  "border-r-2 border-stone-900 font-mono font-bold text-center align-middle bg-stone-50/30 text-stone-900",
                  isTvMode ? "p-3 text-3xl font-black" : "p-2.5 font-bold"
                )}
              >
                {Math.round(data.groupedRowSpan3Subtotal).toLocaleString('en-IN')}
              </td>

              <td className={cn(
                "font-mono font-black",
                isTvMode ? "p-3" : "p-2.5",
                (firstShed?.effPercent || 0) >= 90 ? "text-emerald-700" : "text-stone-900"
              )}>
                {firstShed?.effPercent || 0}
              </td>
            </tr>

            {/* Row 3: 2nd Shed */}
            <tr
              onClick={() => onSelectShed && onSelectShed('Shed 2')}
              className={cn(
                "transition-colors cursor-pointer",
                selectedShed === 'Shed 2' ? "bg-emerald-50/70" : "hover:bg-stone-50"
              )}
              title="Click to view 2nd Shed frames"
            >
              <td className={cn("border-r-2 border-stone-900 font-serif font-bold text-left text-stone-900", isTvMode ? "p-3 pl-6" : "p-2.5 pl-4")}>
                2nd Shed
              </td>
              <td className={cn("border-r-2 border-stone-900 font-semibold font-mono", isTvMode ? "p-3" : "p-2.5")}>
                {secondShed?.rfCount || 0}
              </td>
              <td className={cn("border-r-2 border-stone-900 font-semibold font-mono", isTvMode ? "p-3" : "p-2.5")}>
                {Math.round(secondShed?.stdKg || 0).toLocaleString('en-IN')}
              </td>
              <td className={cn("border-r-2 border-stone-900 font-semibold font-mono", isTvMode ? "p-3" : "p-2.5")}>
                {Math.round(secondShed?.achievedKg || 0).toLocaleString('en-IN')}
              </td>
              {/* Total column cell is spanned from Row 2 */}
              <td className={cn(
                "font-mono font-black",
                isTvMode ? "p-3" : "p-2.5",
                (secondShed?.effPercent || 0) >= 90 ? "text-emerald-700" : "text-stone-900"
              )}>
                {secondShed?.effPercent || 0}
              </td>
            </tr>

            {/* Row 4: PC Shed */}
            <tr
              onClick={() => onSelectShed && onSelectShed('Shed 3')}
              className={cn(
                "transition-colors cursor-pointer",
                selectedShed === 'Shed 3' ? "bg-emerald-50/70" : "hover:bg-stone-50"
              )}
              title="Click to view PC Shed frames"
            >
              <td className={cn("border-r-2 border-stone-900 font-serif font-bold text-left text-stone-900", isTvMode ? "p-3 pl-6" : "p-2.5 pl-4")}>
                PC Shed
              </td>
              <td className={cn("border-r-2 border-stone-900 font-semibold font-mono", isTvMode ? "p-3" : "p-2.5")}>
                {pcShed?.rfCount || 0}
              </td>
              <td className={cn("border-r-2 border-stone-900 font-semibold font-mono", isTvMode ? "p-3" : "p-2.5")}>
                {Math.round(pcShed?.stdKg || 0).toLocaleString('en-IN')}
              </td>
              <td className={cn("border-r-2 border-stone-900 font-semibold font-mono", isTvMode ? "p-3" : "p-2.5")}>
                {Math.round(pcShed?.achievedKg || 0).toLocaleString('en-IN')}
              </td>
              {/* Total column cell is spanned from Row 2 */}
              <td className={cn(
                "font-mono font-black",
                isTvMode ? "p-3" : "p-2.5",
                (pcShed?.effPercent || 0) >= 90 ? "text-emerald-700" : "text-stone-900"
              )}>
                {pcShed?.effPercent || 0}
              </td>
            </tr>

            {/* Footer Summary Row matching exact warm peach color (#faeae1) */}
            <tr className="bg-[#faeae1] font-black border-t-2 border-b-2 border-stone-900 text-stone-900">
              <td className={cn("border-r-2 border-stone-900 font-serif font-black text-left uppercase tracking-wider text-stone-900", isTvMode ? "p-3.5 pl-6" : "p-2.5 pl-4")}>
                TOTAL
              </td>
              <td className={cn("border-r-2 border-stone-900 font-mono font-black", isTvMode ? "p-3.5" : "p-2.5")}>
                {data.totalRf}
              </td>
              <td className={cn("border-r-2 border-stone-900 font-mono font-black", isTvMode ? "p-3.5" : "p-2.5")}>
                {Math.round(data.totalStd).toLocaleString('en-IN')}
              </td>
              <td className={cn("border-r-2 border-stone-900 font-mono font-black", isTvMode ? "p-3.5" : "p-2.5")}>
                {Math.round(data.totalAchieved).toLocaleString('en-IN')}
              </td>
              <td className={cn("border-r-2 border-stone-900 font-mono font-black", isTvMode ? "p-3.5" : "p-2.5")}>
                {/* Kept clean as in image */}
              </td>
              <td className={cn("font-mono font-black text-stone-900", isTvMode ? "p-3.5" : "p-2.5")}>
                {data.totalEff}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const ReportView: React.FC<ReportViewProps> = ({
  report,
  isTvMode = false,
  allReports,
  currentShed = 'All',
  onSelectShed,
  onSelectDate,
  availableDates = []
}) => {
  // Selected shed tab for filtering the detailed machine statement below
  const [activeFilterShed, setActiveFilterShed] = useState<string>(() => {
    return currentShed || 'All';
  });

  const statementDate = report.date || 'live';

  // Compute the exact All-Sheds Spinning Production Report
  const allShedData = useMemo(() => {
    return computeAllShedReport(statementDate, report, allReports);
  }, [statementDate, report, allReports]);

  // Handle shed selection (both local tab and notify parent)
  const handleShedClick = (shed: string) => {
    setActiveFilterShed(shed);
    if (onSelectShed && shed !== 'All') {
      onSelectShed(shed as Shed);
    }
  };

  // Determine active frame summaries to display based on filter
  const displayedSummaries = useMemo(() => {
    if (activeFilterShed === 'All') {
      // Gather summaries from all available sheds for this date
      const list: Array<any> = [];
      const seenFrames = new Set<string>();

      allShedData.rows.forEach(r => {
        if (r.report && r.report.summaries) {
          r.report.summaries.forEach(s => {
            const compositeKey = `${r.shedKey}_${s.frameNo}`;
            if (!seenFrames.has(compositeKey)) {
              seenFrames.add(compositeKey);
              list.push({ ...s, shed: r.shedKey, unitName: r.displayName });
            }
          });
        }
      });

      if (list.length === 0 && report.summaries) {
        return report.summaries.map(s => ({ ...s, shed: report.shed || 'Shed 1', unitName: report.shed || 'Shed 1' }));
      }
      return list;
    }

    // Specific shed selected
    const targetRow = allShedData.rows.find(r => r.shedKey === activeFilterShed);
    if (targetRow && targetRow.report && targetRow.report.summaries) {
      return targetRow.report.summaries.map(s => ({ ...s, shed: targetRow.shedKey, unitName: targetRow.displayName }));
    }

    if ((report.shed || 'Shed 1') === activeFilterShed && report.summaries) {
      return report.summaries.map(s => ({ ...s, shed: report.shed || 'Shed 1', unitName: report.shed || 'Shed 1' }));
    }

    return [];
  }, [activeFilterShed, allShedData, report]);

  // Determine entries for shift matching
  const allEntriesPool = useMemo(() => {
    const entriesList: Array<any> = [];
    allShedData.rows.forEach(r => {
      if (r.report?.entries) {
        r.report.entries.forEach(e => entriesList.push({ ...e, shed: r.shedKey }));
      }
    });
    if (entriesList.length === 0 && report.entries) {
      return report.entries.map(e => ({ ...e, shed: report.shed || 'Shed 1' }));
    }
    return entriesList;
  }, [allShedData, report]);

  // Running counts from displayed frames
  const runningCounts = useMemo(() => {
    const counts = Array.from(new Set(displayedSummaries.map(s => s.count).filter(Boolean)));
    return counts.map((count: string) => {
      const framesWithCount = displayedSummaries.filter(s => s.count === count);
      const avgGpss = Math.round(framesWithCount.reduce((acc, curr) => acc + (curr.avgGps || 0), 0) / framesWithCount.length);
      const stdGps = framesWithCount[0]?.stdGps || 0;

      const entriesWithCount = allEntriesPool.filter(e => e.count === count);
      const avg40s = entriesWithCount.length > 0
        ? Math.round(entriesWithCount.reduce((acc, curr) => acc + (curr.gps40sCon || 0), 0) / entriesWithCount.length)
        : Math.round(avgGpss * 1.05);

      const totalProd = Math.round(framesWithCount.reduce((acc, curr) => acc + (curr.actualProd || 0), 0));

      return {
        count,
        framesCount: framesWithCount.length,
        std: stdGps,
        gpss: avgGpss,
        gpss40s: avg40s,
        totalProd
      };
    }).sort((a, b) => a.count.localeCompare(b.count, undefined, { numeric: true }));
  }, [displayedSummaries, allEntriesPool]);

  // Helper to strip LH / RH for KTTM machines as per requirement
  const formatRfNo = (frameNo: string, shedName?: string) => {
    if (!frameNo) return '';
    const isKttm = shedName === 'KTTM' || (!shedName && report.shed === 'KTTM');
    if (isKttm) {
      return frameNo.replace(/\s*(LH|RH)$/i, '').trim();
    }
    return frameNo;
  };

  // Export to Excel (.xlsx) with 3 professional sheets
  const exportToExcel = () => {
    const safeDate = statementDate.replace(/[/\\?%*:|"<>]/g, '-');
    const wb = XLSX.utils.book_new();

    // Sheet 1: Spinning Production Report (Matches Image)
    const execRows = [
      { 'Date': statementDate, 'No of Rf': '', 'STD': '', 'Achieved': '', 'Total': '', 'Eff%': '' },
      {
        'Date': 'KTTM',
        'No of Rf': allShedData.kttmRow?.rfCount || 0,
        'STD': allShedData.kttmRow?.stdKg || 0,
        'Achieved': allShedData.kttmRow?.achievedKg || 0,
        'Total': allShedData.kttmRow?.achievedKg || 0,
        'Eff%': allShedData.kttmRow?.effPercent || 0
      },
      {
        'Date': '1st Shed',
        'No of Rf': allShedData.rows.find(r => r.shedKey === 'Shed 1')?.rfCount || 0,
        'STD': allShedData.rows.find(r => r.shedKey === 'Shed 1')?.stdKg || 0,
        'Achieved': allShedData.rows.find(r => r.shedKey === 'Shed 1')?.achievedKg || 0,
        'Total': allShedData.groupedRowSpan3Subtotal,
        'Eff%': allShedData.rows.find(r => r.shedKey === 'Shed 1')?.effPercent || 0
      },
      {
        'Date': '2nd Shed',
        'No of Rf': allShedData.rows.find(r => r.shedKey === 'Shed 2')?.rfCount || 0,
        'STD': allShedData.rows.find(r => r.shedKey === 'Shed 2')?.stdKg || 0,
        'Achieved': allShedData.rows.find(r => r.shedKey === 'Shed 2')?.achievedKg || 0,
        'Total': '',
        'Eff%': allShedData.rows.find(r => r.shedKey === 'Shed 2')?.effPercent || 0
      },
      {
        'Date': 'PC Shed',
        'No of Rf': allShedData.rows.find(r => r.shedKey === 'Shed 3')?.rfCount || 0,
        'STD': allShedData.rows.find(r => r.shedKey === 'Shed 3')?.stdKg || 0,
        'Achieved': allShedData.rows.find(r => r.shedKey === 'Shed 3')?.achievedKg || 0,
        'Total': '',
        'Eff%': allShedData.rows.find(r => r.shedKey === 'Shed 3')?.effPercent || 0
      },
      {
        'Date': 'TOTAL',
        'No of Rf': allShedData.totalRf,
        'STD': allShedData.totalStd,
        'Achieved': allShedData.totalAchieved,
        'Total': '',
        'Eff%': allShedData.totalEff
      }
    ];
    const wsExec = XLSX.utils.json_to_sheet(execRows);
    XLSX.utils.book_append_sheet(wb, wsExec, 'Spinning Production Report');

    // Sheet 2: Frame Production Statement
    const frameRows = displayedSummaries.map(s => {
      const shI = allEntriesPool.find(e => e.frameNo === s.frameNo && e.shift === 'I' && (!s.shed || e.shed === s.shed))?.productionActual || 0;
      const shII = allEntriesPool.find(e => e.frameNo === s.frameNo && e.shift === 'II' && (!s.shed || e.shed === s.shed))?.productionActual || 0;
      const shIII = allEntriesPool.find(e => e.frameNo === s.frameNo && e.shift === 'III' && (!s.shed || e.shed === s.shed))?.productionActual || 0;
      return {
        'Shed': s.unitName || s.shed || 'Shed 1',
        'Rf No': formatRfNo(s.frameNo, s.shed),
        'Count': s.count,
        'STD GPS': Math.round(s.stdGps || 0),
        'Target Prod (Kg)': Math.round(s.targetProd || 0),
        'Shift I (Kg)': Math.round(shI),
        'Shift II (Kg)': Math.round(shII),
        'Shift III (Kg)': Math.round(shIII),
        'Total Prod (Kg)': Math.round(s.actualProd || 0),
        'GPS I': Math.round(s.shiftGps?.I || 0),
        'GPS II': Math.round(s.shiftGps?.II || 0),
        'GPS III': Math.round(s.shiftGps?.III || 0),
        'Avg GPS': Math.round(s.avgGps || 0),
        'U% I': `${Math.round(s.shiftUtil?.I || 0)}%`,
        'U% II': `${Math.round(s.shiftUtil?.II || 0)}%`,
        'U% III': `${Math.round(s.shiftUtil?.III || 0)}%`,
        'Avg U%': `${Math.round(s.avgUtil || 0)}%`
      };
    });
    const wsSummary = XLSX.utils.json_to_sheet(frameRows);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Frame Statement');

    // Sheet 3: Running count GPSS
    const countRows = runningCounts.map(rc => ({
      'Count': rc.count,
      'Frames Running': rc.framesCount,
      'STD GPS': Math.round(rc.std),
      'Actual GPSS': Math.round(rc.gpss),
      '40s GPSS': Math.round(rc.gpss40s),
      'Total Production (Kg)': rc.totalProd
    }));
    const wsCounts = XLSX.utils.json_to_sheet(countRows);
    XLSX.utils.book_append_sheet(wb, wsCounts, 'Running Count GPSS');

    XLSX.writeFile(wb, `Spinning_Production_Report_${safeDate}.xlsx`);
  };

  // Export to CSV
  const exportToCSV = () => {
    const safeDate = statementDate.replace(/[/\\?%*:|"<>]/g, '-');
    let csv = `SPINNING PRODUCTION REPORT - ALL SHEDS\nDate: ${statementDate}\n\n`;
    csv += `Unit,No of Rf,STD,Achieved,Total,Eff%\n`;
    csv += `KTTM,${allShedData.kttmRow?.rfCount || 0},${allShedData.kttmRow?.stdKg || 0},${allShedData.kttmRow?.achievedKg || 0},${allShedData.kttmRow?.achievedKg || 0},${allShedData.kttmRow?.effPercent || 0}%\n`;
    csv += `1st Shed,${allShedData.rows.find(r => r.shedKey === 'Shed 1')?.rfCount || 0},${allShedData.rows.find(r => r.shedKey === 'Shed 1')?.stdKg || 0},${allShedData.rows.find(r => r.shedKey === 'Shed 1')?.achievedKg || 0},${allShedData.groupedRowSpan3Subtotal},${allShedData.rows.find(r => r.shedKey === 'Shed 1')?.effPercent || 0}%\n`;
    csv += `2nd Shed,${allShedData.rows.find(r => r.shedKey === 'Shed 2')?.rfCount || 0},${allShedData.rows.find(r => r.shedKey === 'Shed 2')?.stdKg || 0},${allShedData.rows.find(r => r.shedKey === 'Shed 2')?.achievedKg || 0},,${allShedData.rows.find(r => r.shedKey === 'Shed 2')?.effPercent || 0}%\n`;
    csv += `PC Shed,${allShedData.rows.find(r => r.shedKey === 'Shed 3')?.rfCount || 0},${allShedData.rows.find(r => r.shedKey === 'Shed 3')?.stdKg || 0},${allShedData.rows.find(r => r.shedKey === 'Shed 3')?.achievedKg || 0},,${allShedData.rows.find(r => r.shedKey === 'Shed 3')?.effPercent || 0}%\n`;
    csv += `TOTAL,${allShedData.totalRf},${allShedData.totalStd},${allShedData.totalAchieved},,${allShedData.totalEff}%\n\n`;

    csv += `FRAME-WISE SHIFT PRODUCTION STATEMENT (${activeFilterShed})\n`;
    csv += `Shed,Rf No,Count,STD GPS,Target Prod,Shift I,Shift II,Shift III,Total Prod,GPS I,GPS II,GPS III,Avg GPS,U% I,U% II,U% III,Avg U%\n`;

    displayedSummaries.forEach(s => {
      const shI = allEntriesPool.find(e => e.frameNo === s.frameNo && e.shift === 'I' && (!s.shed || e.shed === s.shed))?.productionActual || 0;
      const shII = allEntriesPool.find(e => e.frameNo === s.frameNo && e.shift === 'II' && (!s.shed || e.shed === s.shed))?.productionActual || 0;
      const shIII = allEntriesPool.find(e => e.frameNo === s.frameNo && e.shift === 'III' && (!s.shed || e.shed === s.shed))?.productionActual || 0;
      csv += `"${s.unitName || s.shed || 'Shed 1'}","${formatRfNo(s.frameNo, s.shed)}","${s.count}",${Math.round(s.stdGps || 0)},${Math.round(s.targetProd || 0)},${Math.round(shI)},${Math.round(shII)},${Math.round(shIII)},${Math.round(s.actualProd || 0)},${Math.round(s.shiftGps?.I || 0)},${Math.round(s.shiftGps?.II || 0)},${Math.round(s.shiftGps?.III || 0)},${Math.round(s.avgGps || 0)},${Math.round(s.shiftUtil?.I || 0)}%,${Math.round(s.shiftUtil?.II || 0)}%,${Math.round(s.shiftUtil?.III || 0)}%,${Math.round(s.avgUtil || 0)}%\n`;
    });

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Spinning_Production_Report_${safeDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Grand totals of the displayed frame list
  const totals = useMemo(() => {
    let target = 0;
    let actual = 0;
    let shiftI = 0;
    let shiftII = 0;
    let shiftIII = 0;

    displayedSummaries.forEach(s => {
      target += s.targetProd || 0;
      actual += s.actualProd || 0;
      const shI = allEntriesPool.find(e => e.frameNo === s.frameNo && e.shift === 'I' && (!s.shed || e.shed === s.shed))?.productionActual || 0;
      const shII = allEntriesPool.find(e => e.frameNo === s.frameNo && e.shift === 'II' && (!s.shed || e.shed === s.shed))?.productionActual || 0;
      const shIII = allEntriesPool.find(e => e.frameNo === s.frameNo && e.shift === 'III' && (!s.shed || e.shed === s.shed))?.productionActual || 0;
      shiftI += shI;
      shiftII += shII;
      shiftIII += shIII;
    });

    return {
      target: Math.round(target),
      actual: Math.round(actual),
      shiftI: Math.round(shiftI),
      shiftII: Math.round(shiftII),
      shiftIII: Math.round(shiftIII)
    };
  }, [displayedSummaries, allEntriesPool]);

  return (
    <div className={cn(
      "bg-white border border-stone-200 font-sans shadow-sm",
      isTvMode ? "p-6 rounded-3xl flex flex-col w-full shadow-xs space-y-6" : "p-4 md:p-6 rounded-2xl space-y-6"
    )}>
      {/* Printable Sheet Header */}
      <div className="hidden print-only mb-6 border-b-2 border-black pb-3 text-center">
        <h1 className="text-xl font-black uppercase tracking-tight text-black keep-size">KTTM SPINNING MILLS - UNIT 01</h1>
        <h2 className="text-base font-extrabold uppercase tracking-wider text-black keep-size mt-0.5">Spinning Production Report</h2>
        <div className="flex justify-between items-center text-xs font-bold mt-2 pt-1 border-t border-stone-300 text-black">
          <span>Date: <strong>{statementDate}</strong></span>
          <span>Total Plant Frames: <strong>{allShedData.totalRf}</strong></span>
          <span>Target Production: <strong>{allShedData.totalStd.toLocaleString()} Kg</strong></span>
          <span>Achieved Production: <strong>{allShedData.totalAchieved.toLocaleString()} Kg</strong></span>
          <span>Overall Eff: <strong>{allShedData.totalEff}%</strong></span>
        </div>
      </div>

      {/* Top Action Bar (hidden on print and simplified on TV mode) */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-stone-200 pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 animate-pulse" />
            <span className="text-[11px] font-black uppercase tracking-widest text-emerald-800">
              Executive Mill Statement
            </span>
          </div>
          <h2 className={cn("font-black tracking-tight text-stone-900 uppercase font-serif", isTvMode ? "text-3xl md:text-4xl" : "text-xl md:text-2xl")}>
            Spinning Production Report
          </h2>
        </div>

        {/* Action Controls & Date Switcher */}
        <div className="flex flex-wrap items-center gap-2 no-print">
          {/* Date Selector Dropdown */}
          {availableDates.length > 0 && onSelectDate && !isTvMode && (
            <div className="flex items-center gap-1.5 bg-stone-100 px-3 py-1.5 rounded-lg border border-stone-200 text-xs font-black text-stone-800">
              <Calendar size={14} className="text-stone-500" />
              <span>Date:</span>
              <select
                value={statementDate}
                onChange={(e) => onSelectDate(e.target.value)}
                className="bg-transparent font-black cursor-pointer outline-hidden text-stone-900"
              >
                {availableDates.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          )}

          {!isTvMode && (
            <>
              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-900 text-white hover:bg-black rounded-lg font-black text-[11px] uppercase tracking-wider transition-all shadow-xs cursor-pointer active:scale-95"
                title="Print this statement"
              >
                <Printer size={13} />
                <span>Print</span>
              </button>
              <button
                onClick={exportToExcel}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/80 rounded-lg font-black text-[11px] uppercase tracking-wider transition-all shadow-xs cursor-pointer active:scale-95"
                title="Download as Excel (.xlsx)"
              >
                <FileSpreadsheet size={13} />
                <span>Excel</span>
              </button>
              <button
                onClick={exportToCSV}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-100 text-stone-700 hover:bg-stone-200 border border-stone-200 rounded-lg font-black text-[11px] uppercase tracking-wider transition-all shadow-xs cursor-pointer active:scale-95"
                title="Download as CSV"
              >
                <Download size={13} />
                <span>CSV</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* =========================================================================
          SECTION 1: THE ALL-SHEDS SPINNING PRODUCTION REPORT (MATCHES IMAGE)
          ========================================================================= */}
      <div className="w-full flex flex-col items-center py-2">
        <AllShedSpinningReportTable
          data={allShedData}
          isTvMode={isTvMode}
          selectedShed={activeFilterShed}
          onSelectShed={handleShedClick}
        />
      </div>

      {/* =========================================================================
          SECTION 2: SHED NAVIGATION TABS (QUICK DRILL DOWN)
          ========================================================================= */}
      {!isTvMode && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-b border-stone-200 py-3 no-print">
          <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-stone-500">
            <Building2 size={14} className="text-emerald-700" />
            <span>Select Shed Detail:</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => handleShedClick('All')}
              className={cn(
                "px-3.5 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer border",
                activeFilterShed === 'All'
                  ? "bg-stone-900 text-white border-stone-900 shadow-xs"
                  : "bg-stone-100 text-stone-700 border-stone-200 hover:bg-stone-200"
              )}
            >
              All Sheds ({allShedData.totalRf} Frames)
            </button>
            {SHED_CONFIGS.map(conf => {
              const row = allShedData.rows.find(r => r.shedKey === conf.shedKey);
              const isActive = activeFilterShed === conf.shedKey;
              return (
                <button
                  key={conf.shedKey}
                  onClick={() => handleShedClick(conf.shedKey)}
                  className={cn(
                    "px-3.5 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer border flex items-center gap-1.5",
                    isActive
                      ? "bg-emerald-700 text-white border-emerald-700 shadow-xs"
                      : "bg-white text-stone-800 border-stone-200 hover:bg-stone-50"
                  )}
                >
                  <span>{conf.displayName}</span>
                  <span className={cn(
                    "px-1.5 py-0.5 rounded-full text-[10px] font-mono",
                    isActive ? "bg-emerald-900 text-emerald-100" : "bg-stone-100 text-stone-600"
                  )}>
                    {row?.rfCount || 0} RF
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* =========================================================================
          SECTION 3: DETAILED FRAME-BY-FRAME PRODUCTION STATEMENT
          ========================================================================= */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className={cn("font-black tracking-tight text-stone-900 uppercase font-serif", isTvMode ? "text-2xl" : "text-base md:text-lg")}>
            {activeFilterShed === 'All' ? 'Plant Consolidated Frame Statement' : `${activeFilterShed} Daily Production Statement`}
            <span className="text-emerald-700 ml-2 font-mono font-bold text-sm">
              ({displayedSummaries.length} Frames)
            </span>
          </h3>
          <span className="text-xs text-stone-400 font-bold uppercase tracking-wider hidden sm:inline-block">
            Shift I, II & III Telemetry Breakdown
          </span>
        </div>

        <div className="overflow-x-auto w-full border border-stone-200 rounded-xl shadow-2xs bg-white">
          <table className={cn("w-full border-collapse", isTvMode ? "text-xl" : "text-xs")}>
            <thead>
              <tr className="border-t-2 border-b-2 border-stone-900 bg-stone-50/50">
                <th className={cn("font-black text-stone-900 uppercase tracking-tight text-left", isTvMode ? "py-3 px-2" : "py-2 px-2")} rowSpan={2}>Rf no</th>
                {activeFilterShed === 'All' && (
                  <th className={cn("font-black text-stone-900 uppercase tracking-tight text-left", isTvMode ? "py-3 px-2" : "py-2 px-2")} rowSpan={2}>Shed</th>
                )}
                <th className={cn("font-black text-stone-900 uppercase tracking-tight text-left", isTvMode ? "py-3 px-2" : "py-2 px-2")} rowSpan={2}>Count</th>
                <th className={cn("font-black text-stone-900 uppercase tracking-tight text-center", isTvMode ? "py-3 px-1.5" : "py-2 px-1.5")} rowSpan={2}>STD GPS</th>
                <th className={cn("font-black text-stone-900 uppercase tracking-tight text-center", isTvMode ? "py-3 px-1.5" : "py-2 px-1.5")} rowSpan={2}>Target (Kg)</th>
                <th className={cn("border-l border-stone-200 text-center font-black text-stone-900 uppercase tracking-tight", isTvMode ? "py-3 px-1" : "py-2 px-1")} colSpan={3}>Achieved (Kg)</th>
                <th className={cn("border-l border-r border-stone-900 text-center font-black text-stone-900 uppercase tracking-tight bg-stone-100/60", isTvMode ? "py-3 px-2" : "py-2 px-2")} rowSpan={2}>Total (Kg)</th>
                <th className={cn("border-r border-stone-200 text-center font-black text-stone-900 uppercase tracking-tight", isTvMode ? "py-3 px-1" : "py-2 px-1")} colSpan={4}>GPS</th>
                <th className={cn("text-center font-black text-stone-900 uppercase tracking-tight", isTvMode ? "py-3 px-1" : "py-2 px-1")} colSpan={4}>U%</th>
              </tr>
              <tr className={cn("border-b-2 border-stone-900 font-black text-stone-800 bg-stone-50/30", isTvMode ? "text-lg" : "text-[10px]")}>
                <th className={cn("border-l border-stone-200", isTvMode ? "py-2 px-1" : "py-1 px-1")}>I</th>
                <th className={cn("border-l border-stone-100", isTvMode ? "py-2 px-1" : "py-1 px-1")}>II</th>
                <th className={cn("border-l border-stone-100", isTvMode ? "py-2 px-1" : "py-1 px-1")}>III</th>
                <th className={cn("border-l border-stone-200", isTvMode ? "py-2 px-1" : "py-1 px-1")}>I</th>
                <th className={cn("border-l border-stone-100", isTvMode ? "py-2 px-1" : "py-1 px-1")}>II</th>
                <th className={cn("border-l border-stone-100", isTvMode ? "py-2 px-1" : "py-1 px-1")}>III</th>
                <th className={cn("border-l border-r border-stone-200 bg-stone-100/50", isTvMode ? "py-2 px-1" : "py-1 px-1")}>Avg</th>
                <th className={cn("border-l border-stone-200", isTvMode ? "py-2 px-1" : "py-1 px-1")}>I</th>
                <th className={cn("border-l border-stone-100", isTvMode ? "py-2 px-1" : "py-1 px-1")}>II</th>
                <th className={cn("border-l border-stone-100", isTvMode ? "py-2 px-1" : "py-1 px-1")}>III</th>
                <th className={cn("border-l bg-stone-100/50", isTvMode ? "py-2 px-1" : "py-1 px-1")}>Avg</th>
              </tr>
            </thead>
            <tbody className={cn("text-stone-800 divide-y divide-stone-100", isTvMode && "font-black")}>
              {displayedSummaries.map((summary, idx) => {
                const cleanRfNo = formatRfNo(summary.frameNo, summary.shed);
                const shI = allEntriesPool.find(e => e.frameNo === summary.frameNo && e.shift === 'I' && (!summary.shed || e.shed === summary.shed));
                const shII = allEntriesPool.find(e => e.frameNo === summary.frameNo && e.shift === 'II' && (!summary.shed || e.shed === summary.shed));
                const shIII = allEntriesPool.find(e => e.frameNo === summary.frameNo && e.shift === 'III' && (!summary.shed || e.shed === summary.shed));

                const shIActual = shI ? Math.round(shI.productionActual) : 0;
                const shIIActual = shII ? Math.round(shII.productionActual) : 0;
                const shIIIActual = shIII ? Math.round(shIII.productionActual) : 0;

                const gpsI = Math.round(summary.shiftGps?.I || 0);
                const gpsII = Math.round(summary.shiftGps?.II || 0);
                const gpsIII = Math.round(summary.shiftGps?.III || 0);
                const avgGps = Math.round(summary.avgGps || 0);

                const uI = Math.round(summary.shiftUtil?.I || 0);
                const uII = Math.round(summary.shiftUtil?.II || 0);
                const uIII = Math.round(summary.shiftUtil?.III || 0);
                const avgUtil = Math.round(summary.avgUtil || 0);

                return (
                  <tr key={idx} className="hover:bg-stone-50 transition-colors">
                    <td className={cn("font-black font-mono text-stone-900", isTvMode ? "py-3 px-2" : "py-1.5 px-2")}>
                      {cleanRfNo}
                    </td>
                    {activeFilterShed === 'All' && (
                      <td className={cn("font-bold text-[11px] uppercase tracking-wider text-stone-500", isTvMode ? "py-3 px-2" : "py-1.5 px-2")}>
                        <span className="px-2 py-0.5 rounded-md bg-stone-100 border border-stone-200">
                          {summary.unitName || summary.shed}
                        </span>
                      </td>
                    )}
                    <td className={cn("font-semibold text-stone-800", isTvMode ? "py-3 px-2" : "py-1.5 px-2")}>
                      <span className="px-2 py-0.5 rounded-full bg-stone-100 text-stone-700 font-bold border border-stone-200 text-[11px]">
                        {summary.count}
                      </span>
                    </td>
                    <td className={cn("text-center font-bold font-mono text-stone-600", isTvMode ? "py-3 px-1.5" : "py-1.5 px-1.5")}>
                      {Math.round(summary.stdGps || 0)}
                    </td>
                    <td className={cn("text-center font-bold font-mono text-stone-700", isTvMode ? "py-3 px-1.5" : "py-1.5 px-1.5")}>
                      {Math.round(summary.targetProd || 0).toLocaleString()}
                    </td>

                    {/* Achieved Shift Cols */}
                    <td className={cn("border-l border-stone-200 text-center font-bold font-mono", isTvMode ? "py-3 px-1" : "py-1.5 px-1")}>{shIActual}</td>
                    <td className={cn("border-l border-stone-100 text-center font-bold font-mono", isTvMode ? "py-3 px-1" : "py-1.5 px-1")}>{shIIActual}</td>
                    <td className={cn("border-l border-stone-100 text-center font-bold font-mono", isTvMode ? "py-3 px-1" : "py-1.5 px-1")}>{shIIIActual}</td>

                    {/* Total Actual */}
                    <td className={cn("text-center font-black font-mono border-l border-r border-stone-900 bg-stone-100/60 text-stone-900", isTvMode ? "py-3 px-2" : "py-1.5 px-2")}>
                      {Math.round(summary.actualProd || 0).toLocaleString()}
                    </td>

                    {/* GPS Cols */}
                    <td className={cn(
                      "border-l border-stone-200 text-center font-bold font-mono",
                      isTvMode ? "py-3 px-1" : "py-1.5 px-1",
                      gpsI >= (summary.stdGps || 0) ? "text-emerald-700 font-black" : "text-stone-700"
                    )}>
                      {gpsI}
                    </td>
                    <td className={cn(
                      "border-l border-stone-100 text-center font-bold font-mono",
                      isTvMode ? "py-3 px-1" : "py-1.5 px-1",
                      gpsII >= (summary.stdGps || 0) ? "text-emerald-700 font-black" : "text-stone-700"
                    )}>
                      {gpsII}
                    </td>
                    <td className={cn(
                      "border-l border-stone-100 text-center font-bold font-mono",
                      isTvMode ? "py-3 px-1" : "py-1.5 px-1",
                      gpsIII >= (summary.stdGps || 0) ? "text-emerald-700 font-black" : gpsIII < (summary.stdGps || 0) * 0.9 ? "text-red-600 font-black" : "text-stone-700"
                    )}>
                      {gpsIII}
                    </td>
                    <td className={cn("border-l border-r border-stone-200 text-center bg-stone-100/50 font-black font-mono text-stone-900", isTvMode ? "py-3 px-1" : "py-1.5 px-1")}>
                      {avgGps}
                    </td>

                    {/* Util Cols */}
                    <td className={cn(
                      "border-l border-stone-200 text-center font-semibold font-mono",
                      isTvMode ? "py-3 px-1" : "py-1.5 px-1",
                      uI < 92 ? "text-red-500 font-bold" : "text-stone-700"
                    )}>
                      {uI}%
                    </td>
                    <td className={cn(
                      "border-l border-stone-100 text-center font-semibold font-mono",
                      isTvMode ? "py-3 px-1" : "py-1.5 px-1",
                      uII < 92 ? "text-red-500 font-bold" : "text-stone-700"
                    )}>
                      {uII}%
                    </td>
                    <td className={cn(
                      "border-l border-stone-100 text-center font-semibold font-mono",
                      isTvMode ? "py-3 px-1" : "py-1.5 px-1",
                      uIII < 92 ? "text-red-500 font-bold" : "text-stone-700"
                    )}>
                      {uIII}%
                    </td>
                    <td className={cn("border-l text-center bg-stone-100/50 font-black font-mono text-stone-900", isTvMode ? "py-3 px-1" : "py-1.5 px-1")}>
                      {avgUtil}%
                    </td>
                  </tr>
                );
              })}

              {/* Total Footer Row */}
              <tr className={cn("font-black text-stone-900 border-t-2 border-b-2 border-stone-900 uppercase bg-[#faeae1]", isTvMode ? "text-2xl" : "text-xs")}>
                <td className={isTvMode ? "py-4 px-2" : "py-2.5 px-2"} colSpan={activeFilterShed === 'All' ? 3 : 2}>
                  TOTAL ({displayedSummaries.length} FRAMES)
                </td>
                <td className="text-center font-mono"></td>
                <td className={cn("text-center font-mono", isTvMode ? "py-4 px-1" : "py-2.5 px-1")}>{totals.target.toLocaleString()}</td>
                <td className={cn("text-center font-mono border-l border-stone-300", isTvMode ? "py-4" : "py-2.5 px-1")}>{totals.shiftI.toLocaleString()}</td>
                <td className={cn("text-center font-mono border-l border-stone-200", isTvMode ? "py-4" : "py-2.5 px-1")}>{totals.shiftII.toLocaleString()}</td>
                <td className={cn("text-center font-mono border-l border-stone-200", isTvMode ? "py-4" : "py-2.5 px-1")}>{totals.shiftIII.toLocaleString()}</td>
                <td className={cn("text-center font-mono border-l border-r border-stone-900 font-black", isTvMode ? "py-4" : "py-2.5 px-1")}>{totals.actual.toLocaleString()}</td>
                <td colSpan={8}></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* =========================================================================
          SECTION 4: RUNNING COUNT GPSS TABLE
          ========================================================================= */}
      <div className={cn("w-full transition-all pt-2", isTvMode ? "max-w-4xl" : "max-w-2xl")}>
        <div className="flex items-center gap-2 mb-2 pb-1 border-b-2 border-stone-900">
          <Layers size={16} className="text-stone-900" />
          <h3 className={cn("font-black tracking-tight text-stone-900 uppercase font-serif", isTvMode ? "text-2xl" : "text-sm md:text-base")}>
            Running Count GPSS Summary
          </h3>
        </div>
        <div className="overflow-x-auto border-2 border-stone-900 rounded-xl bg-white shadow-xs">
          <table className={cn("w-full border-collapse", isTvMode ? "text-xl" : "text-xs")}>
            <thead>
              <tr className="border-b-2 border-stone-900 text-stone-900 uppercase tracking-tight font-black bg-stone-50">
                <th className={cn("text-left font-serif", isTvMode ? "py-2.5 px-4 w-48" : "py-2 px-3 w-40")}>Count</th>
                <th className={cn("text-center font-serif", isTvMode ? "py-2.5 px-3" : "py-2 px-3")}>Frames</th>
                <th className={cn("text-center font-serif", isTvMode ? "py-2.5 px-3" : "py-2 px-3")}>STD</th>
                <th className={cn("text-center font-serif", isTvMode ? "py-2.5 px-3" : "py-2 px-3")}>GPSS</th>
                <th className={cn("text-center border-l-2 border-stone-900 font-serif", isTvMode ? "py-2.5 px-4" : "py-2 px-3")}>40s GPSS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {runningCounts.map((rc, idx) => (
                <tr key={idx} className="hover:bg-stone-50 transition-colors">
                  <td className={cn("text-left font-black text-stone-900 font-serif", isTvMode ? "py-2.5 px-4" : "py-1.5 px-3")}>
                    {rc.count}
                  </td>
                  <td className={cn("text-center font-bold text-stone-600 font-mono", isTvMode ? "py-2.5 px-3" : "py-1.5 px-3")}>
                    {rc.framesCount}
                  </td>
                  <td className={cn("text-center font-bold font-mono text-stone-700", isTvMode ? "py-2.5 px-3" : "py-1.5 px-3")}>
                    {Math.round(rc.std)}
                  </td>
                  <td className={cn("text-center text-emerald-800 font-black font-mono", isTvMode ? "py-2.5 px-3" : "py-1.5 px-3")}>
                    {Math.round(rc.gpss)}
                  </td>
                  <td className={cn("text-center font-black text-stone-900 border-l-2 border-stone-900 font-mono", isTvMode ? "py-2.5 px-4" : "py-1.5 px-3")}>
                    {Math.round(rc.gpss40s)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Print Signature Footer Block */}
      <div className="hidden print-signatures">
        <div className="print-signature-box">
          Shift Supervisor
        </div>
        <div className="print-signature-box">
          Quality / Technical Head
        </div>
        <div className="print-signature-box">
          Mill General Manager
        </div>
      </div>
    </div>
  );
};
