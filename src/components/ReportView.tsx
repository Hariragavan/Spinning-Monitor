import React from 'react';
import { DailyReport } from '../types';
import { cn } from '../lib/utils';
import { Printer, Download, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';

interface ReportViewProps {
  report: DailyReport;
  isTvMode?: boolean;
}

export const ReportView: React.FC<ReportViewProps> = ({ report, isTvMode = false }) => {
  const runningCounts = Array.from(new Set(report.summaries.map(s => s.count))).map((count: string) => {
    const framesWithCount = report.summaries.filter(s => s.count === count);
    const avgGpss = Math.round(framesWithCount.reduce((acc, curr) => acc + curr.avgGps, 0) / framesWithCount.length);
    const stdGps = framesWithCount[0].stdGps;
    
    // Calculate average 40s conversion from entries
    const entriesWithCount = report.entries.filter(e => e.count === count);
    const avg40s = entriesWithCount.length > 0 
      ? Math.round(entriesWithCount.reduce((acc, curr) => acc + (curr.gps40sCon || 0), 0) / entriesWithCount.length)
      : 0;
    
    return {
      count,
      std: stdGps,
      gpss: avgGpss,
      gpss40s: avg40s
    };
  });

  const exportToExcel = () => {
    const safeDate = (report.date || 'live').replace(/[/\\?%*:|"<>]/g, '-');
    const wb = XLSX.utils.book_new();

    // Sheet 1: Production summary
    const summaryRows = report.summaries.map(s => {
      const shI = report.entries.find(e => e.frameNo === s.frameNo && e.shift === 'I')?.productionActual || 0;
      const shII = report.entries.find(e => e.frameNo === s.frameNo && e.shift === 'II')?.productionActual || 0;
      const shIII = report.entries.find(e => e.frameNo === s.frameNo && e.shift === 'III')?.productionActual || 0;
      return {
        'Rf No': s.frameNo,
        'Count': s.count,
        'STD GPS': Math.round(s.stdGps),
        'Target Prod (Kg)': Math.round(s.targetProd),
        'Shift I (Kg)': Math.round(shI),
        'Shift II (Kg)': Math.round(shII),
        'Shift III (Kg)': Math.round(shIII),
        'Total Prod (Kg)': Math.round(s.actualProd),
        'GPS I': Math.round(s.shiftGps.I),
        'GPS II': Math.round(s.shiftGps.II),
        'GPS III': Math.round(s.shiftGps.III),
        'Avg GPS': Math.round(s.avgGps),
        'U% I': `${Math.round(s.shiftUtil.I)}%`,
        'U% II': `${Math.round(s.shiftUtil.II)}%`,
        'U% III': `${Math.round(s.shiftUtil.III)}%`,
        'Avg U%': `${Math.round(s.avgUtil)}%`
      };
    });
    const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Production Statement');

    // Sheet 2: Running count
    const countRows = runningCounts.map(rc => ({
      'Count': rc.count,
      'STD GPS': Math.round(rc.std),
      'Actual GPSS': Math.round(rc.gpss),
      '40s GPSS': Math.round(rc.gpss40s)
    }));
    const wsCounts = XLSX.utils.json_to_sheet(countRows);
    XLSX.utils.book_append_sheet(wb, wsCounts, 'Running Count GPSS');

    XLSX.writeFile(wb, `Daily_Production_Statement_${safeDate}.xlsx`);
  };

  const exportToCSV = () => {
    const safeDate = (report.date || 'live').replace(/[/\\?%*:|"<>]/g, '-');
    let csv = `KTTM SPINNING MILLS - DAILY PRODUCTION STATEMENT (${report.date})\n\n`;
    csv += `Rf No,Count,STD GPS,Target Prod,Shift I,Shift II,Shift III,Total Prod,GPS I,GPS II,GPS III,Avg GPS,U% I,U% II,U% III,Avg U%\n`;

    report.summaries.forEach(s => {
      const shI = report.entries.find(e => e.frameNo === s.frameNo && e.shift === 'I')?.productionActual || 0;
      const shII = report.entries.find(e => e.frameNo === s.frameNo && e.shift === 'II')?.productionActual || 0;
      const shIII = report.entries.find(e => e.frameNo === s.frameNo && e.shift === 'III')?.productionActual || 0;
      csv += `"${s.frameNo}","${s.count}",${Math.round(s.stdGps)},${Math.round(s.targetProd)},${Math.round(shI)},${Math.round(shII)},${Math.round(shIII)},${Math.round(s.actualProd)},${Math.round(s.shiftGps.I)},${Math.round(s.shiftGps.II)},${Math.round(s.shiftGps.III)},${Math.round(s.avgGps)},${Math.round(s.shiftUtil.I)}%,${Math.round(s.shiftUtil.II)}%,${Math.round(s.shiftUtil.III)}%,${Math.round(s.avgUtil)}%\n`;
    });

    csv += `\nRUNNING COUNT GPSS\nCount,STD,GPSS,40s GPSS\n`;
    runningCounts.forEach(rc => {
      csv += `"${rc.count}",${Math.round(rc.std)},${Math.round(rc.gpss)},${Math.round(rc.gpss40s)}\n`;
    });

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Daily_Production_Statement_${safeDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={cn(
      "bg-white border border-stone-200 shadow-sm overflow-hidden font-sans",
      isTvMode ? "p-6 rounded-3xl border border-stone-200 flex flex-col w-full bg-white shadow-xs" : "p-3.5 md:p-4 mb-4 rounded-2xl"
    )}>
      {/* Printable Sheet Header */}
      <div className="hidden print-only mb-6 border-b-2 border-black pb-3 text-center">
        <h1 className="text-xl font-black uppercase tracking-tight text-black keep-size">KTTM SPINNING MILLS - UNIT 01</h1>
        <h2 className="text-base font-extrabold uppercase tracking-wider text-black keep-size mt-0.5">Daily Production Statement</h2>
        <div className="flex justify-between items-center text-xs font-bold mt-2 pt-1 border-t border-stone-300 text-black">
          <span>Statement Date: <strong>{report.date}</strong></span>
          <span>Total Frames: <strong>{report.summaries.length}</strong></span>
          <span>Target Total Prod: <strong>{Math.round(report.totalProductionTarget).toLocaleString()} Kg</strong></span>
          <span>Actual Total Prod: <strong>{Math.round(report.totalProductionActual).toLocaleString()} Kg</strong></span>
        </div>
      </div>

      <div className={cn("text-center", isTvMode ? "mb-3 mt-1" : "mb-3")}>
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2 mb-2">
          <div className="text-left">
            <h2 className={cn("font-black tracking-tight text-stone-900 uppercase", isTvMode ? "text-4xl" : "text-xl md:text-2xl")}>
              KTTM Daily Production Statement
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-stone-400 uppercase tracking-wider text-[11px] font-bold">Statement Date:</span>
              <span className="text-stone-900 border-b-2 border-stone-900 pb-0.5 px-2 font-black text-xs md:text-sm">{report.date}</span>
            </div>
          </div>

          {!isTvMode && (
            <div className="flex flex-wrap items-center gap-1.5 no-print">
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
            </div>
          )}
        </div>
      </div>

      <div 
        className={cn(
        "overflow-x-auto w-full", 
        isTvMode ? "px-0 pb-4" : "space-y-6"
      )}>
        <table className={cn("w-full border-collapse", isTvMode ? "text-xl" : "text-xs")}>
          <thead>
            <tr className="border-t-2 border-b-2 border-stone-900">
              <th className={cn("font-black text-stone-900 uppercase tracking-tight text-left", isTvMode ? "py-3 px-1" : "py-1.5 px-1.5")} rowSpan={2}>Rf no</th>
              <th className={cn("font-black text-stone-900 uppercase tracking-tight text-left", isTvMode ? "py-3 px-1" : "py-1.5 px-1.5")} rowSpan={2}>Count</th>
              <th className={cn("font-black text-stone-900 uppercase tracking-tight text-center", isTvMode ? "py-3 px-1" : "py-1.5 px-1.5")} rowSpan={2}>STD GPS</th>
              <th className={cn("font-black text-stone-900 uppercase tracking-tight text-center", isTvMode ? "py-3 px-1" : "py-1.5 px-1.5")} rowSpan={2}>Target Prod</th>
              <th className={cn("border-l border-stone-200 text-center font-black text-stone-900 uppercase tracking-tight", isTvMode ? "py-3 px-1" : "py-1.5 px-1.5")} colSpan={3}>Achived</th>
              <th className={cn("border-l border-r border-stone-900 text-center font-black text-stone-900 uppercase tracking-tight", isTvMode ? "py-3 px-1" : "py-1.5 px-1.5")} rowSpan={2}>Total</th>
              <th className={cn("border-r border-stone-200 text-center font-black text-stone-900 uppercase tracking-tight", isTvMode ? "py-3 px-1" : "py-1.5 px-1.5")} colSpan={4}>GPS</th>
              <th className={cn("text-center font-black text-stone-900 uppercase tracking-tight", isTvMode ? "py-3 px-1" : "py-1.5 px-1.5")} colSpan={4}>U%</th>
            </tr>
            <tr className={cn("border-b-2 border-stone-900 font-black text-stone-800", isTvMode ? "text-lg" : "text-[10px]")}>
              <th className={cn("border-l border-stone-100", isTvMode ? "py-2 px-1" : "py-1 px-1")}>I</th>
              <th className={cn("border-l border-stone-100", isTvMode ? "py-2 px-1" : "py-1 px-1")}>II</th>
              <th className={cn("border-l border-stone-100", isTvMode ? "py-2 px-1" : "py-1 px-1")}>III</th>
              <th className={cn("border-l border-stone-100", isTvMode ? "py-2 px-1" : "py-1 px-1")}>I</th>
              <th className={cn("border-l border-stone-100", isTvMode ? "py-2 px-1" : "py-1 px-1")}>II</th>
              <th className={cn("border-l border-stone-100", isTvMode ? "py-2 px-1" : "py-1 px-1")}>III</th>
              <th className={cn("border-l border-r border-stone-200 bg-stone-50", isTvMode ? "py-2 px-1" : "py-1 px-1")}>Total</th>
              <th className={cn("border-l border-stone-100", isTvMode ? "py-2 px-1" : "py-1 px-1")}>I</th>
              <th className={cn("border-l border-stone-100", isTvMode ? "py-2 px-1" : "py-1 px-1")}>II</th>
              <th className={cn("border-l border-stone-100", isTvMode ? "py-2 px-1" : "py-1 px-1")}>III</th>
              <th className={cn("border-l bg-stone-50", isTvMode ? "py-2 px-1" : "py-1 px-1")}>Total</th>
            </tr>
          </thead>
          <tbody className={cn("text-stone-800", isTvMode && "font-black")}>
            {report.summaries.map((summary, idx) => (
              <tr key={idx} className="border-b border-stone-200 hover:bg-stone-50 transition-colors">
                <td className={cn("font-black", isTvMode ? "py-3 px-1" : "py-1.5 px-1.5")}>{summary.frameNo}</td>
                <td className={cn("font-semibold", isTvMode ? "py-3 px-1" : "py-1.5 px-1.5")}>{summary.count}</td>
                <td className={cn("text-center font-bold", isTvMode ? "py-3 px-0.5" : "py-1.5 px-1")}>{Math.round(summary.stdGps)}</td>
                <td className={cn("text-center font-bold", isTvMode ? "py-3 px-0.5" : "py-1.5 px-1")}>{Math.round(summary.targetProd)}</td>
                
                {/* Achieved Shift Cols */}
                {['I', 'II', 'III'].map(s => {
                   const shiftEntry = report.entries.find(e => e.frameNo === summary.frameNo && e.shift === s);
                   return (
                     <td key={s} className={cn("border-l border-stone-100 text-center font-bold", isTvMode ? "py-3 px-0.5" : "py-1.5 px-1")}>
                       {shiftEntry ? Math.round(shiftEntry.productionActual) : 0}
                     </td>
                   )
                })}

                <td className={cn("text-center font-black border-l border-r border-stone-200 bg-stone-50/30", isTvMode ? "py-3 px-1" : "py-1.5 px-1.5")}>{Math.round(summary.actualProd)}</td>
                
                {/* GPS Cols */}
                <td className={cn("border-l border-stone-100 text-center font-black", isTvMode ? "py-3 px-0.5" : "py-1.5 px-1", summary.shiftGps.I >= summary.stdGps ? "text-emerald-600" : "text-emerald-700")}>{Math.round(summary.shiftGps.I)}</td>
                <td className={cn("border-l border-stone-100 text-center font-black", isTvMode ? "py-3 px-0.5" : "py-1.5 px-1", summary.shiftGps.II >= summary.stdGps ? "text-emerald-600" : "text-emerald-700")}>{Math.round(summary.shiftGps.II)}</td>
                <td className={cn("border-l border-stone-100 text-center font-black", isTvMode ? "py-3 px-0.5" : "py-1.5 px-1", summary.shiftGps.III < summary.stdGps ? "text-red-500" : "text-stone-800")}>{Math.round(summary.shiftGps.III)}</td>
                <td className={cn("border-l border-r border-stone-200 text-center bg-stone-50 font-black", isTvMode ? "py-3 px-0.5" : "py-1.5 px-1")}>{Math.round(summary.avgGps)}</td>
                
                {/* Util Cols */}
                <td className={cn("border-l border-stone-100 text-center font-semibold", isTvMode ? "py-3 px-0.5" : "py-1.5 px-1", summary.shiftUtil.I < 95 ? "text-red-500" : "text-stone-800")}>{Math.round(summary.shiftUtil.I)}</td>
                <td className={cn("border-l border-stone-100 text-center font-semibold", isTvMode ? "py-3 px-0.5" : "py-1.5 px-1", summary.shiftUtil.II < 95 ? "text-red-500" : "text-stone-800")}>{Math.round(summary.shiftUtil.II)}</td>
                <td className={cn("border-l border-stone-100 text-center font-semibold", isTvMode ? "py-3 px-0.5" : "py-1.5 px-1", summary.shiftUtil.III < 95 ? "text-red-500" : "text-stone-800")}>{Math.round(summary.shiftUtil.III)}</td>
                <td className={cn("border-l text-center bg-stone-50 font-black", isTvMode ? "py-3 px-0.5" : "py-1.5 px-1")}>{Math.round(summary.avgUtil)}</td>
              </tr>
            ))}
            <tr className={cn("font-black text-stone-900 border-b-2 border-stone-900 uppercase", isTvMode ? "text-2xl" : "text-xs")}>
              <td className={isTvMode ? "py-4 px-1" : "py-2 px-1.5"} colSpan={3}></td>
              <td className={cn("text-center", isTvMode ? "py-4 px-0.5" : "py-2 px-1")}>{Math.round(report.totalProductionTarget)}</td>
              <td className={cn("text-center border-l border-stone-200", isTvMode ? "py-4" : "py-2 px-1")}>{Math.round(report.entries.filter(e => e.shift === 'I').reduce((a, b) => a + b.productionActual, 0))}</td>
              <td className={cn("text-center border-l border-stone-100", isTvMode ? "py-4" : "py-2 px-1")}>{Math.round(report.entries.filter(e => e.shift === 'II').reduce((a, b) => a + b.productionActual, 0))}</td>
              <td className={cn("text-center border-l border-stone-100", isTvMode ? "py-4" : "py-2 px-1")}>{Math.round(report.entries.filter(e => e.shift === 'III').reduce((a, b) => a + b.productionActual, 0))}</td>
              <td className={cn("text-center border-l border-r border-stone-900 bg-stone-50/50", isTvMode ? "py-4" : "py-2 px-1")}>{Math.round(report.totalProductionActual)}</td>
              <td colSpan={8}></td>
            </tr>
          </tbody>
        </table>

        {/* Running Count Section */}
        <div className={cn("w-full transition-all", isTvMode ? "pt-4 pb-4" : "max-w-2xl pt-4")}>
          <h3 className={cn("font-black tracking-tight text-stone-900 border-b-2 border-stone-900 inline-block uppercase", isTvMode ? "text-2xl mb-3" : "text-sm md:text-base mb-2")}>Running Count GPSS</h3>
          <table className={cn("w-full border-collapse border-b-2 border-stone-900", isTvMode ? "text-xl" : "text-xs")}>
            <thead>
              <tr className="border-t-2 border-b-2 border-stone-900 text-stone-900 uppercase tracking-tight font-black">
                <th className={cn("text-left", isTvMode ? "py-2 px-3 w-48" : "py-1.5 px-3 w-40")}>Count</th>
                <th className={cn("text-center", isTvMode ? "py-2 px-3" : "py-1.5 px-3")}>STD</th>
                <th className={cn("text-center", isTvMode ? "py-2 px-3" : "py-1.5 px-3")}>GPSS</th>
                <th className={cn("text-center border-l-2 border-stone-900", isTvMode ? "py-2 px-3" : "py-1.5 px-3")}>40s GPSS</th>
              </tr>
            </thead>
            <tbody className={cn("text-stone-900 font-bold", isTvMode && "tabular-nums")}>
              {runningCounts.map((rc, idx) => (
                <tr key={idx} className="border-b border-stone-200 hover:bg-stone-50 transition-colors">
                  <td className={cn("text-left font-black", isTvMode ? "py-2 px-3" : "py-1.5 px-3")}>{rc.count}</td>
                  <td className={cn("text-center", isTvMode ? "py-2 px-3" : "py-1.5 px-3")}>{Math.round(rc.std)}</td>
                  <td className={cn("text-center text-emerald-800 font-black", isTvMode ? "py-2 px-3" : "py-1.5 px-3")}>{Math.round(rc.gpss)}</td>
                  <td className={cn("text-center font-black text-stone-900 border-l-2 border-stone-900", isTvMode ? "py-2 px-3" : "py-1.5 px-3")}>{Math.round(rc.gpss40s)}</td>
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
