import React, { useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { 
  FileText, 
  Users, 
  Settings, 
  Grid3X3, 
  Download, 
  Upload, 
  Edit, 
  RefreshCw, 
  AlertCircle, 
  ChevronLeft, 
  ChevronRight, 
  Calendar,
  X,
  Check
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { DailyReport, Sider, IncentiveRule, MachineEmData, SystemSettings, Shift } from '../types';
import { syncMachineEmFromGoogleSheet } from '../lib/googleSheets';
import { parseUniversalDateParts, parseUniversalDate } from '../lib/utils';
import { CalendarMonthPicker, CalendarDatePicker } from './CalendarPickers';

interface OperatorEmFormatProps {
  history: DailyReport[];
  workers: Sider[];
  rules: IncentiveRule[];
  machineEm: MachineEmData;
  onUpdateMachineEm: (newData: MachineEmData, sheetUrl?: string) => Promise<void>;
  settings: SystemSettings;
  isTvMode?: boolean;
  month?: number;
  year?: number;
  tvPageInterval?: number;
  onPagesDetermined?: (pages: number) => void;
}

export const OperatorEmFormat: React.FC<OperatorEmFormatProps> = ({
  history,
  workers,
  rules,
  machineEm,
  onUpdateMachineEm,
  settings,
  isTvMode: appIsTvMode = false,
  month,
  year,
  tvPageInterval,
  onPagesDetermined
}) => {
  const [localTvMode, setLocalTvMode] = useState<boolean>(false);
  const activeTv = appIsTvMode || localTvMode;

  const [activeSubTab, setActiveSubTab] = useState<'grid' | 'individual' | 'abstract' | 'operator-monthly-em' | 'daily-em-report'>(
    appIsTvMode ? 'operator-monthly-em' : 'grid'
  );

  // Find latest available date in history for daily report
  const latestHistoryDate = useMemo(() => {
    if (!history || history.length === 0) return '';
    const sorted = [...history].sort((a, b) => {
      return parseUniversalDate(b.date).getTime() - parseUniversalDate(a.date).getTime();
    });
    return sorted[0].date;
  }, [history]);

  const [selectedDailyEmDate, setSelectedDailyEmDate] = useState<string>('');
  const dailyReportRef = useRef<HTMLDivElement>(null);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);

  React.useEffect(() => {
    if (latestHistoryDate && !selectedDailyEmDate) {
      setSelectedDailyEmDate(latestHistoryDate);
    }
  }, [latestHistoryDate, selectedDailyEmDate]);
  
  // Grid / Monthly select state
  const [selectedMonth, setSelectedMonth] = useState<number>(month || new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(year || new Date().getFullYear());

  // Effect to sync select boxes when month or year props change (e.g., from TV rotation settings)
  React.useEffect(() => {
    if (month) {
      setSelectedMonth(month);
    }
  }, [month]);

  React.useEffect(() => {
    if (year) {
      setSelectedYear(year);
    }
  }, [year]);

  // Individual ledger state
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>('');
  
  // Date range for individual view
  const { defaultFrom, defaultTo } = useMemo(() => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    const pad = (n: number) => n.toString().padStart(2, '0');
    
    return {
      defaultFrom: `${firstDay.getFullYear()}-${pad(firstDay.getMonth() + 1)}-${pad(firstDay.getDate())}`,
      defaultTo: `${lastDay.getFullYear()}-${pad(lastDay.getMonth() + 1)}-${pad(lastDay.getDate())}`
    };
  }, []);

  const [fromDate, setFromDate] = useState<string>(defaultFrom);
  const [toDate, setToDate] = useState<string>(defaultTo);

  // Sync state
  const [sheetUrl, setSheetUrl] = useState<string>(
    settings.machineEmGoogleSheetUrl || 
    'https://docs.google.com/spreadsheets/d/1VaoDxAzZ9k--KLMuLUpG9TVOsRo8TXrO/edit?usp=sharing'
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ success: boolean; message: string; dates?: string[] } | null>(null);

  // Manual cell edit state
  const [editingCell, setEditingCell] = useState<{
    date: string;
    machine: string;
    shift: string;
    value: string;
  } | null>(null);

  // Search state for operator monthly EM
  const [operatorSearchQuery, setOperatorSearchQuery] = useState('');

  const monthsList = [
    { value: 1, label: 'January' },
    { value: 2, label: 'February' },
    { value: 3, label: 'March' },
    { value: 4, label: 'April' },
    { value: 5, label: 'May' },
    { value: 6, label: 'June' },
    { value: 7, label: 'July' },
    { value: 8, label: 'August' },
    { value: 9, label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' }
  ];

  const yearsList = [2025, 2026, 2027];
  const machines = ['K01', 'K02', 'K03', 'K04', 'K05', 'K06'];
  const shifts: ('1' | '2' | '3')[] = ['1', '2', '3'];

  // Helper mapping Shift I, II, III <-> 1, 2, 3
  const mapShiftToNum = (shift: Shift): string => {
    if (shift === 'I') return '1';
    if (shift === 'II') return '2';
    if (shift === 'III') return '3';
    return '1';
  };

  const mapNumToShift = (num: string): Shift => {
    if (num === '1') return 'I';
    if (num === '2') return 'II';
    if (num === '3') return 'III';
    return 'I';
  };

  const dateToInputString = (dStr: string): string => {
    if (!dStr) return '';
    const parts = parseUniversalDateParts(dStr);
    if (!parts) return '';
    const mStr = parts.month.toString().padStart(2, '0');
    const dStr2 = parts.day.toString().padStart(2, '0');
    return `${parts.year}-${mStr}-${dStr2}`;
  };

  const inputStringToDate = (val: string): string => {
    if (!val) return '';
    const parts = val.split('-');
    if (parts.length !== 3) return '';
    return `${parseInt(parts[2])}/${parseInt(parts[1]).toString().padStart(2, '0')}/${parts[0]}`;
  };

  // Get active dates list for the selected Month & Year
  const selectedMonthDates = useMemo(() => {
    // Scan our machineEm keys
    const dates = Object.keys(machineEm).filter(dStr => {
      const parts = parseUniversalDateParts(dStr);
      return parts && parts.month === selectedMonth && parts.year === selectedYear;
    });

    // Sort dates chronologically
    return dates.sort((a, b) => {
      return parseUniversalDate(a).getTime() - parseUniversalDate(b).getTime();
    });
  }, [machineEm, selectedMonth, selectedYear]);

  // Sync Google Sheet handler
  const handleSync = async () => {
    if (!sheetUrl) return;
    setIsSyncing(true);
    setSyncStatus(null);
    try {
      const syncedData = await syncMachineEmFromGoogleSheet(sheetUrl);
      
      // Update Google Sheet URL in setting
      await onUpdateMachineEm(syncedData, sheetUrl);
      
      // Save local setting just in case
      const localSettings = localStorage.getItem('spin_settings');
      if (localSettings) {
        const parsed = JSON.parse(localSettings);
        parsed.machineEmGoogleSheetUrl = sheetUrl;
        parsed.lastMachineEmSyncDate = new Date().toLocaleString();
        localStorage.setItem('spin_settings', JSON.stringify(parsed));
      }

      const sortedDates = Object.keys(syncedData).sort((a, b) => {
        return parseUniversalDate(a).getTime() - parseUniversalDate(b).getTime();
      });

      setSyncStatus({
        success: true,
        message: `Successfully synchronized ${sortedDates.length} days of Machine EM data from the spreadsheet.`,
        dates: sortedDates
      });
    } catch (err) {
      console.error(err);
      setSyncStatus({
        success: false,
        message: err instanceof Error ? err.message : 'Failed to connect to Google Sheet. Please check permission settings.'
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Cell Update handler
  const handleCellUpdate = async () => {
    if (!editingCell) return;
    const { date, machine, shift, value } = editingCell;
    const parsedVal = parseFloat(value);
    
    if (isNaN(parsedVal)) {
      alert('Please enter a valid numeric EM value.');
      return;
    }

    const updated = JSON.parse(JSON.stringify(machineEm)) as MachineEmData;
    if (!updated[date]) updated[date] = {};
    if (!updated[date][machine]) updated[date][machine] = {};
    updated[date][machine][shift] = parsedVal;

    await onUpdateMachineEm(updated);
    setEditingCell(null);
  };

  // 1. Calculate Grand Totals and dynamic average of Column EM
  const calculateColAverage = (date: string, shift: string): string => {
    let sum = 0;
    let count = 0;
    machines.forEach(m => {
      const val = machineEm[date]?.[m]?.[shift];
      if (val !== undefined) {
        sum += val;
        count++;
      }
    });
    return count > 0 ? (sum / count).toFixed(2) : '-';
  };

  // 2. Individual Sider Log calculation
  const individualEmLedger = useMemo(() => {
    if (!selectedWorkerId) return [];
    
    const start = fromDate ? new Date(fromDate) : null;
    const end = toDate ? new Date(toDate) : null;
    if (start) start.setHours(0, 0, 0, 0);
    if (end) end.setHours(23, 59, 59, 999);

    const logs: {
      date: string;
      shift: Shift;
      machine: string;
      gps: number;
      count: string;
      em: number;
    }[] = [];

    // Search active daily reports
    history.forEach(report => {
      // Filter by date range
      if (!report || !report.date) return;
      const rDate = parseUniversalDate(report.date);
      
      if (start && rDate < start) return;
      if (end && rDate > end) return;

      report.entries.forEach(entry => {
        const isAssigned = entry.siderIds?.includes(selectedWorkerId) || 
                           entry.siderId === selectedWorkerId;
        
        if (isAssigned) {
          const shiftNum = mapShiftToNum(entry.shift);
          // Look up EM from Google link / grid
          let emValue = machineEm[report.date]?.[entry.frameNo]?.[shiftNum];
          // Fallback to entry Doff EM
          if (emValue === undefined) {
            emValue = entry.doffEmt || 0;
          }

          logs.push({
            date: report.date,
            shift: entry.shift,
            machine: entry.frameNo,
            gps: entry.gpsActual,
            count: entry.count,
            em: emValue
          });
        }
      });
    });

    // Sort chronological
    return logs.sort((a, b) => {
      return parseUniversalDate(a.date).getTime() - parseUniversalDate(b.date).getTime();
    });
  }, [history, machineEm, selectedWorkerId, fromDate, toDate]);

  // Aggregate stats for individual view
  const individualStats = useMemo(() => {
    if (individualEmLedger.length === 0) return { totalShifts: 0, avgGps: 0, avgEm: 0 };
    const totalShifts = individualEmLedger.length;
    const sumGps = individualEmLedger.reduce((sum, item) => sum + item.gps, 0);
    const sumEm = individualEmLedger.reduce((sum, item) => sum + item.em, 0);
    return {
      totalShifts,
      avgGps: sumGps / totalShifts,
      avgEm: sumEm / totalShifts
    };
  }, [individualEmLedger]);

  // 3. Consolidated Monthly Operator EM Abstract
  const monthlyAbstract = useMemo(() => {
    const targetMonthStr = String(selectedMonth).padStart(2, '0');
    const targetYearStr = String(selectedYear);

    const siderData: Record<string, {
      id: string;
      name: string;
      tNo: string;
      shifts: number;
      totalGps: number;
      totalEm: number;
      emCount: number;
    }> = {};

    // Initialize all active workers
    workers.forEach(w => {
      siderData[w.id] = {
        id: w.id,
        name: w.name,
        tNo: w.tNo,
        shifts: 0,
        totalGps: 0,
        totalEm: 0,
        emCount: 0
      };
    });

    // Process all history reports in the target month
    history.forEach(report => {
      if (!report || !report.date) return;
      const parts = parseUniversalDateParts(report.date);
      if (!parts) return;
      if (parts.month !== selectedMonth || parts.year !== selectedYear) return;

      report.entries.forEach(entry => {
        const entryWorkers = entry.siderIds || (entry.siderId ? [entry.siderId] : []);
        entryWorkers.forEach(wId => {
          if (!siderData[wId]) {
            // Sider not in worker master, create on-the-fly
            const resolved = workers.find(work => work.id === wId || work.tNo === wId);
            siderData[wId] = {
              id: wId,
              name: resolved?.name || entry.siderName || `Ticket ${wId}`,
              tNo: resolved?.tNo || wId,
              shifts: 0,
              totalGps: 0,
              totalEm: 0,
              emCount: 0
            };
          }

          const record = siderData[wId];
          record.shifts += 1;
          record.totalGps += entry.gpsActual;

          const shiftNum = mapShiftToNum(entry.shift);
          let emValue = machineEm[report.date]?.[entry.frameNo]?.[shiftNum];
          if (emValue === undefined) {
            emValue = entry.doffEmt || 0;
          }

          if (emValue > 0) {
            record.totalEm += emValue;
            record.emCount += 1;
          }
        });
      });
    });

    // Convert to list & calculate averages
    return Object.values(siderData)
      .filter(w => w.shifts > 0)
      .map(w => ({
        ...w,
        avgGps: w.shifts > 0 ? (w.totalGps / w.shifts) : 0,
        avgEm: w.emCount > 0 ? (w.totalEm / w.emCount) : 0
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [history, workers, machineEm, selectedMonth, selectedYear]);

  // Calendar dates for the selected month and year (01/07/2026, etc)
  const calendarDates = useMemo(() => {
    const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
    const dates: string[] = [];
    const pad = (n: number) => n.toString().padStart(2, '0');
    for (let d = 1; d <= daysInMonth; d++) {
      dates.push(`${pad(d)}/${pad(selectedMonth)}/${selectedYear}`);
    }
    return dates;
  }, [selectedMonth, selectedYear]);

  // Operator Monthly EM grid data
  const operatorEmGridData = useMemo(() => {
    const lookup: Record<string, Record<string, number[]>> = {};

    history.forEach(report => {
      const dateStr = report.date;
      if (!lookup[dateStr]) {
        lookup[dateStr] = {};
      }

      if (report.entries) {
        report.entries.forEach(entry => {
          const assignedIds = new Set<string>();
          if (entry.siderId) assignedIds.add(entry.siderId);
          if (entry.siderIds) {
            entry.siderIds.forEach(id => { if (id) assignedIds.add(id); });
          }

          // Resolve name match as fallback
          if (entry.siderName) {
            const nameMatchWorker = workers.find(w => 
              w.name.toLowerCase().trim() === entry.siderName!.toLowerCase().trim()
            );
            if (nameMatchWorker) {
              assignedIds.add(nameMatchWorker.id);
              assignedIds.add(nameMatchWorker.tNo);
            }
          }

          const shiftNum = mapShiftToNum(entry.shift);
          let emValue = machineEm[dateStr]?.[entry.frameNo]?.[shiftNum];
          if (emValue === undefined) {
            emValue = entry.doffEmt || 0;
          }

          assignedIds.forEach(workerId => {
            if (!lookup[dateStr][workerId]) {
              lookup[dateStr][workerId] = [];
            }
            lookup[dateStr][workerId].push(emValue);
          });
        });
      }
    });

    const rows = workers.map(worker => {
      const dateValues: Record<string, number | null> = {};
      let totalEmSum = 0;
      let totalEmCount = 0;

      calendarDates.forEach(dateStr => {
        const ems1 = lookup[dateStr]?.[worker.id] || [];
        const ems2 = lookup[dateStr]?.[worker.tNo] || [];
        const allEms = [...ems1, ...ems2];

        if (allEms.length > 0) {
          const avgEm = allEms.reduce((sum, val) => sum + val, 0) / allEms.length;
          const roundedEm = Math.round(avgEm * 1000) / 1000;
          dateValues[dateStr] = roundedEm;
          totalEmSum += roundedEm;
          totalEmCount++;
        } else {
          dateValues[dateStr] = null;
        }
      });

      const averageEm = totalEmCount > 0 ? (totalEmSum / totalEmCount) : null;

      return {
        worker,
        dateValues,
        averageEm,
        daysWorked: totalEmCount
      };
    });

    // Sort by Ticket number (tNo) ascending and filter out workers with no EM data
    return rows
      .filter(r => r.averageEm !== null)
      .sort((a, b) => {
        const aTNo = parseInt(a.worker.tNo) || 0;
        const bTNo = parseInt(b.worker.tNo) || 0;
        return aTNo - bTNo;
      });
  }, [history, workers, machineEm, calendarDates]);

  // Excel Export: Operator Monthly EM
  const exportOperatorMonthlyToExcel = () => {
    if (operatorEmGridData.length === 0) return;
    
    const headers = ['TNo', 'Sider Name', ...calendarDates];
    const dataRows = operatorEmGridData.map(row => {
      const r: any[] = [row.worker.tNo, row.worker.name.toUpperCase()];
      calendarDates.forEach(dateStr => {
        const val = row.dateValues[dateStr];
        r.push(val !== null ? val : '');
      });
      return r;
    });
    
    const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sider Monthly EM');
    XLSX.writeFile(wb, `Sider_Monthly_EM_${monthsList[selectedMonth - 1].label}_${selectedYear}.xlsx`);
  };

  // Daily EM Report Rows
  const dailyEmRows = useMemo(() => {
    if (!selectedDailyEmDate) return [];
    
    const report = history.find(r => r.date === selectedDailyEmDate);
    if (!report) return [];

    const list: {
      siderName: string;
      tNo?: string;
      shift: Shift;
      mcNo: string;
      count: string;
      gps: number;
      em: number;
    }[] = [];

    report.entries.forEach(entry => {
      // Resolve all siders assigned
      const assignedIds: string[] = [];
      if (entry.siderIds && entry.siderIds.length > 0) {
        entry.siderIds.forEach(id => {
          if (id) assignedIds.push(id);
        });
      } else if (entry.siderId) {
        assignedIds.push(entry.siderId);
      }

      // Check name match as fallback if no IDs are linked
      if (assignedIds.length === 0 && entry.siderName) {
        const nameMatchWorker = workers.find(w => 
          w.name.toLowerCase().trim() === entry.siderName!.toLowerCase().trim()
        );
        if (nameMatchWorker) {
          assignedIds.push(nameMatchWorker.id);
        }
      }

      const shiftNum = mapShiftToNum(entry.shift);
      let emValue = machineEm[report.date]?.[entry.frameNo]?.[shiftNum];
      if (emValue === undefined) {
        emValue = entry.doffEmt || 0;
      }

      if (assignedIds.length > 0) {
        assignedIds.forEach(id => {
          const worker = workers.find(w => w.id === id);
          const name = worker ? worker.name : (entry.siderName || 'Unassigned');
          if (name.toLowerCase().trim() !== 'unassigned') {
            list.push({
              siderName: name,
              tNo: worker?.tNo,
              shift: entry.shift,
              mcNo: entry.frameNo,
              count: entry.count || '',
              gps: entry.gpsActual || 0,
              em: emValue
            });
          }
        });
      } else if (entry.siderName && entry.siderName.toLowerCase().trim() !== 'unassigned') {
        list.push({
          siderName: entry.siderName,
          shift: entry.shift,
          mcNo: entry.frameNo,
          count: entry.count || '',
          gps: entry.gpsActual || 0,
          em: emValue
        });
      }
    });

    // Sort by Shift (I, II, III), then MC NO, then Sider Name
    return list.sort((a, b) => {
      const shiftOrder: Record<Shift, number> = { 'I': 1, 'II': 2, 'III': 3 };
      const aOrder = shiftOrder[a.shift] || 99;
      const bOrder = shiftOrder[b.shift] || 99;
      if (aOrder !== bOrder) return aOrder - bOrder;

      const aMc = a.mcNo.localeCompare(b.mcNo);
      if (aMc !== 0) return aMc;

      return a.siderName.localeCompare(b.siderName);
    });
  }, [history, machineEm, selectedDailyEmDate, workers]);

  const exportDailyEmToExcel = () => {
    if (dailyEmRows.length === 0) return;
    
    const headers = ['Sider Name', 'TNo', 'Shift', 'MC NO', 'Count', 'GPS', 'EM'];
    const dataRows = dailyEmRows.map(row => [
      row.siderName.toUpperCase(),
      row.tNo || '-',
      row.shift,
      row.mcNo,
      row.count,
      row.gps,
      row.em
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Daily EM Report');
    XLSX.writeFile(wb, `Daily_EM_Report_${selectedDailyEmDate.replace(/\//g, '_')}.xlsx`);
  };

  const exportDailyEmToPdf = async () => {
    if (!dailyReportRef.current || dailyEmRows.length === 0) return;
    setIsExportingPdf(true);
    
    try {
      const element = dailyReportRef.current;
      
      const canvas = await html2canvas(element, {
        scale: 2, // Crisp desktop-grade rendering on export
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        onclone: (clonedDoc) => {
          const clonedElement = clonedDoc.getElementById('daily-em-report-pdf-container');
          if (clonedElement) {
            clonedElement.style.width = '1000px';
            clonedElement.style.maxWidth = '1000px';
            clonedElement.style.padding = '40px';
            clonedElement.style.borderRadius = '0';
            clonedElement.style.border = 'none';
            clonedElement.style.boxShadow = 'none';
            
            const tableWrappers = clonedElement.getElementsByClassName('overflow-x-auto');
            for (let i = 0; i < tableWrappers.length; i++) {
              (tableWrappers[i] as HTMLElement).style.overflow = 'visible';
              (tableWrappers[i] as HTMLElement).style.width = '100%';
              (tableWrappers[i] as HTMLElement).style.maxWidth = 'none';
            }
          }
        }
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      const margin = 15;
      const contentWidth = pdfWidth - (margin * 2);
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const contentHeight = (imgHeight * contentWidth) / imgWidth;
      
      let heightLeft = contentHeight;
      let position = margin;
      
      pdf.addImage(imgData, 'PNG', margin, position, contentWidth, contentHeight);
      heightLeft -= (pdfHeight - margin * 2);
      
      while (heightLeft > 0) {
        position = heightLeft - contentHeight + margin;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', margin, position, contentWidth, contentHeight);
        heightLeft -= (pdfHeight - margin * 2);
      }
      
      const formattedDate = selectedDailyEmDate ? selectedDailyEmDate.replace(/\//g, '_') : 'Report';
      pdf.save(`Daily_EM_Report_Statement_${formattedDate}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Only updated dates (dates with at least one EM data value for any worker)
  const updatedDates = useMemo(() => {
    const datesWithData = new Set<string>();
    
    // Check which calendar dates actually have some non-null EM value across any worker
    operatorEmGridData.forEach(row => {
      calendarDates.forEach(dateStr => {
        if (row.dateValues[dateStr] !== null) {
          datesWithData.add(dateStr);
        }
      });
    });

    // Sort chronologically
    return Array.from(datesWithData).sort((a, b) => {
      return parseUniversalDate(a).getTime() - parseUniversalDate(b).getTime();
    });
  }, [operatorEmGridData, calendarDates]);

  // TV Slideshow navigation parameters: 15 items per page
  const [tvPageIndex, setTvPageIndex] = useState(0);
  const tvItemsPerPage = 15;
  const tvTotalPages = Math.ceil(operatorEmGridData.length / tvItemsPerPage) || 1;

  React.useEffect(() => {
    if (!activeTv || tvTotalPages <= 1) return;
    const interval = setInterval(() => {
      setTvPageIndex(prev => (prev + 1) % tvTotalPages);
    }, (tvPageInterval || 15) * 1000);
    return () => clearInterval(interval);
  }, [activeTv, tvTotalPages, tvPageInterval]);

  React.useEffect(() => {
    if (activeTv && onPagesDetermined) {
      onPagesDetermined(tvTotalPages);
    }
  }, [activeTv, tvTotalPages, onPagesDetermined]);

  React.useEffect(() => {
    if (tvPageIndex >= tvTotalPages) {
      setTvPageIndex(0);
    }
  }, [tvTotalPages, tvPageIndex]);

  const displayedTvItems = useMemo(() => {
    const start = tvPageIndex * tvItemsPerPage;
    return operatorEmGridData.slice(start, start + tvItemsPerPage);
  }, [operatorEmGridData, tvPageIndex, tvItemsPerPage]);

  const filteredOperatorGridData = useMemo(() => {
    if (!operatorSearchQuery.trim()) return operatorEmGridData;
    const query = operatorSearchQuery.toLowerCase().trim();
    return operatorEmGridData.filter(row => 
      row.worker.name.toLowerCase().includes(query) || 
      row.worker.tNo.toLowerCase().includes(query)
    );
  }, [operatorEmGridData, operatorSearchQuery]);

  // Excel Export: Machine EM Grid
  const exportGridToExcel = () => {
    if (selectedMonthDates.length === 0) {
      alert('No data available to export for this month.');
      return;
    }

    const dataRows: any[] = [];
    
    // Row 1: Merged Dates Row
    // Column 0 is "Row Labels". Then 3 cells for each date
    const r1 = ['Row Labels'];
    selectedMonthDates.forEach(date => {
      r1.push(date, '', '');
    });
    dataRows.push(r1);

    // Row 2: Shift Labels Row
    const r2 = [''];
    selectedMonthDates.forEach(() => {
      r2.push('1', '2', '3');
    });
    dataRows.push(r2);

    // Rows 3-8: Machines
    machines.forEach(machine => {
      const row: any[] = [machine];
      selectedMonthDates.forEach(date => {
        shifts.forEach(shift => {
          const val = machineEm[date]?.[machine]?.[shift];
          row.push(val !== undefined ? val : '');
        });
      });
      dataRows.push(row);
    });

    // Row 9: Grand Total
    const rTotal: any[] = ['Grand Total'];
    selectedMonthDates.forEach(date => {
      shifts.forEach(shift => {
        const avg = calculateColAverage(date, shift);
        rTotal.push(avg !== '-' ? parseFloat(avg) : '');
      });
    });
    dataRows.push(rTotal);

    // Create Sheet
    const ws = XLSX.utils.aoa_to_sheet(dataRows);
    
    // Add Merges: Row 0 merges 3 columns for each date
    const merges: XLSX.Range[] = [];
    selectedMonthDates.forEach((_, idx) => {
      const startCol = 1 + idx * 3;
      merges.push({
        s: { r: 0, c: startCol },
        e: { r: 0, c: startCol + 2 }
      });
    });
    ws['!merges'] = merges;

    // Build Workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Machine EM Format');
    
    // Save
    XLSX.writeFile(wb, `Operator_EM_Format_${monthsList[selectedMonth - 1].label}_${selectedYear}.xlsx`);
  };

  // Excel Export: Sider Ledger
  const exportLedgerToExcel = () => {
    if (individualEmLedger.length === 0) return;
    const worker = workers.find(w => w.id === selectedWorkerId);
    const workerName = worker?.name || 'Operator';
    
    const excelData = individualEmLedger.map((item, idx) => ({
      'S.No': idx + 1,
      'Date': item.date,
      'Shift': item.shift,
      'Assigned Machine': item.machine,
      'Yarn Count': item.count,
      'Actual GPS': item.gps,
      'EM Value': item.em
    }));

    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ledger');
    XLSX.writeFile(wb, `${workerName}_EM_Ledger_${fromDate}_to_${toDate}.xlsx`);
  };

  // Excel Export: Monthly Abstract
  const exportAbstractToExcel = () => {
    if (monthlyAbstract.length === 0) return;
    
    const excelData = monthlyAbstract.map((item, idx) => ({
      'S.No': idx + 1,
      'Ticket Number': item.tNo,
      'Operator Name': item.name,
      'Total Shifts': item.shifts,
      'Average GPS': parseFloat(item.avgGps.toFixed(3)),
      'Average EM': parseFloat(item.avgEm.toFixed(2))
    }));

    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Operator EM Monthly Abstract');
    XLSX.writeFile(wb, `Operator_EM_Abstract_${monthsList[selectedMonth - 1].label}_${selectedYear}.xlsx`);
  };

  if (activeTv) {
    const tvDatesToRender = updatedDates.length > 0 ? updatedDates : calendarDates;

    return (
      <div className="bg-stone-50 p-8 xl:p-12 min-h-screen text-stone-900 font-sans overflow-hidden flex flex-col justify-between gap-6">
        {/* Header */}
        <div className="flex justify-between items-center border-b border-stone-200 pb-6">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-black text-emerald-600 uppercase tracking-widest">
              Sider Monthly EM Statement
            </span>
            <h1 className="text-4xl md:text-5xl font-serif italic text-stone-900">
              Sider EM for the Month Of {monthsList[selectedMonth - 1].label} {selectedYear}
            </h1>
          </div>
          
          <div className="flex items-center gap-4">
            {localTvMode && (
              <button
                onClick={() => setLocalTvMode(false)}
                className="px-5 py-2.5 bg-red-50 text-red-700 hover:bg-red-100 font-black text-sm uppercase tracking-wider rounded-xl cursor-pointer border border-red-200 transition-colors"
              >
                Exit TV Mode
              </button>
            )}
            <div className="flex items-center gap-4 bg-white px-6 py-3 rounded-2xl border border-stone-200 shadow-sm">
              <span className="text-sm font-bold text-stone-500 uppercase tracking-wider">
                Page {tvPageIndex + 1} of {tvTotalPages}
              </span>
              <div className="h-4 w-[1px] bg-stone-200" />
              <span className="text-sm font-black text-emerald-600 uppercase tracking-wider animate-pulse">
                Auto-rotating
              </span>
            </div>
          </div>
        </div>

        {/* Grid Display */}
        <div className="flex-1 overflow-x-auto bg-white rounded-[2rem] border border-stone-200 p-8 shadow-sm">
          {displayedTvItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[50vh] text-stone-400">
              <AlertCircle size={48} className="text-stone-300 mb-4 stroke-1" />
              <p className="font-serif italic text-xl text-stone-500">No active operator assignments found for this month.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-center border-collapse text-sm border border-stone-200">
                <thead>
                  <tr className="border-b border-stone-200 text-stone-500 bg-stone-50">
                    <th className="p-4 text-left font-black uppercase tracking-wider text-[24px] text-stone-800 w-[110px] border border-stone-200 bg-stone-50">TNo</th>
                    <th className="p-4 text-left font-black uppercase tracking-wider text-[24px] text-stone-800 w-[200px] border border-stone-200 bg-stone-50">Sider Name</th>
                    {tvDatesToRender.map(dateStr => {
                      const dp = parseUniversalDateParts(dateStr);
                      const dayNum = dp ? dp.day : dateStr;
                      return (
                        <th key={dateStr} className="p-2.5 font-black text-[24px] text-stone-800 border border-stone-200 w-[45px] bg-stone-50">
                          {dayNum}
                        </th>
                      );
                    })}
                    <th className="p-4 font-black uppercase tracking-wider text-[24px] text-emerald-700 w-[95px] border border-stone-200 bg-emerald-50">Avg EM</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedTvItems.map(({ worker, dateValues, averageEm }) => (
                    <tr key={worker.id} className="border-b border-stone-100 hover:bg-stone-50/30 transition-colors">
                      <td className="p-3 text-left font-mono font-bold text-[24px] text-stone-600 border border-stone-200 bg-stone-50/20">{worker.tNo}</td>
                      <td className="p-3 text-left font-bold text-[24px] text-stone-900 border border-stone-200 truncate bg-stone-50/20 uppercase">{worker.name.toUpperCase()}</td>
                      {tvDatesToRender.map(dateStr => {
                        const val = dateValues[dateStr];
                        const isRed = val !== null && val > 3;
                        const isGreen = val !== null && val < 2.5;
                        return (
                          <td 
                            key={dateStr} 
                            className={`p-2 font-mono text-[24px] border border-stone-200 text-center ${
                              val !== null 
                                ? (isRed ? 'text-red-600 font-extrabold bg-red-50/20' : isGreen ? 'text-green-600 font-extrabold bg-green-50/20' : 'text-stone-800 font-bold bg-emerald-50/10') 
                                : 'text-stone-300'
                            }`}
                          >
                            {val !== null ? val.toFixed(1) : ''}
                          </td>
                        );
                      })}
                      <td className={`p-3 font-mono font-black text-[24px] border border-stone-200 ${averageEm !== null ? (averageEm > 3 ? 'text-red-600 bg-red-50/20 font-extrabold' : averageEm < 2.5 ? 'text-green-600 bg-green-50/20 font-extrabold' : 'text-emerald-750 bg-emerald-50') : 'text-stone-400'}`}>
                        {averageEm !== null ? averageEm.toFixed(2) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Bottom Page Indicator */}
        {tvTotalPages > 1 && (
          <div className="flex justify-center items-center gap-2 mt-2 pb-2">
            {Array.from({ length: tvTotalPages }).map((_, idx) => (
              <button
                key={idx}
                onClick={() => setTvPageIndex(idx)}
                className={`h-2.5 rounded-full transition-all duration-300 cursor-pointer ${
                  idx === tvPageIndex ? 'w-8 bg-emerald-600' : 'w-2.5 bg-stone-200 hover:bg-stone-300'
                }`}
                title={`Go to page ${idx + 1}`}
              />
            ))}
            <span className="text-xs font-bold text-stone-500 ml-3">
              Page {tvPageIndex + 1} of {tvTotalPages}
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col gap-6 no-print">
      {/* Sub-tab selection menu */}
      <div className="flex bg-stone-100 p-1.5 rounded-2xl no-print max-w-5xl self-center w-full shadow-sm">
        <button
          onClick={() => setActiveSubTab('grid')}
          className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-[10px] sm:text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer ${
            activeSubTab === 'grid'
              ? 'bg-white text-stone-900 shadow-sm border border-stone-200'
              : 'text-stone-500 hover:text-stone-900'
          }`}
        >
          <Grid3X3 size={15} /> Machine EM Grid
        </button>
        <button
          onClick={() => setActiveSubTab('individual')}
          className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-[10px] sm:text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer ${
            activeSubTab === 'individual'
              ? 'bg-white text-stone-900 shadow-sm border border-stone-200'
              : 'text-stone-500 hover:text-stone-900'
          }`}
        >
          <FileText size={15} /> Individual EM Ledger
        </button>
        <button
          onClick={() => setActiveSubTab('abstract')}
          className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-[10px] sm:text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer ${
            activeSubTab === 'abstract'
              ? 'bg-white text-stone-900 shadow-sm border border-stone-200'
              : 'text-stone-500 hover:text-stone-900'
          }`}
        >
          <Users size={15} /> Monthly Operator EM Abstract
        </button>
        <button
          onClick={() => setActiveSubTab('operator-monthly-em')}
          className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-[10px] sm:text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer ${
            activeSubTab === 'operator-monthly-em'
              ? 'bg-white text-stone-900 shadow-sm border border-stone-200'
              : 'text-stone-500 hover:text-stone-900'
          }`}
        >
          <Users size={15} /> Sider Monthly EM Grid
        </button>
        <button
          onClick={() => setActiveSubTab('daily-em-report')}
          className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-[10px] sm:text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer ${
            activeSubTab === 'daily-em-report'
              ? 'bg-white text-stone-900 shadow-sm border border-stone-200'
              : 'text-stone-500 hover:text-stone-900'
          }`}
        >
          <Calendar size={15} /> Daily EM Report
        </button>
      </div>

      <AnimatePresence mode="wait">
        {activeSubTab === 'grid' && (
          <motion.div
            key="grid"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="flex flex-col gap-6"
          >
            {/* Header control block */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-8 rounded-[2.5rem] border border-stone-200 shadow-sm">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Operator EM Format</span>
                <h2 className="font-serif italic text-3xl tracking-tighter text-stone-900">Machine EM Statement</h2>
              </div>

              {/* Month/Year selector */}
              <div className="flex flex-wrap items-center gap-4">
                <CalendarMonthPicker
                  month={selectedMonth}
                  year={selectedYear}
                  onChange={(m, y) => {
                    setSelectedMonth(m);
                    setSelectedYear(y);
                  }}
                />

                <button
                  onClick={exportGridToExcel}
                  className="flex items-center gap-2 bg-stone-950 text-white font-black text-xs uppercase tracking-wider px-5 py-3 rounded-2xl hover:bg-stone-850 active:scale-95 transition-all cursor-pointer shadow-sm md:mt-4"
                >
                  <Download size={14} /> Export Grid
                </button>
              </div>
            </div>

            {/* Google Sheets update block */}
            <div className="bg-white p-8 rounded-[2.5rem] border border-stone-200 shadow-sm flex flex-col gap-4">
              <div className="flex items-center gap-3 border-b border-stone-100 pb-4">
                <Settings className="text-emerald-600" size={20} />
                <h3 className="font-serif italic text-xl tracking-tight text-stone-850">Update Machine EM from Google link</h3>
              </div>

              <div className="flex flex-col lg:flex-row gap-4 items-end">
                <div className="flex-1 flex flex-col gap-1 w-full">
                  <label className="text-[9px] font-black uppercase tracking-wider text-stone-400">Google Sheet URL</label>
                  <input
                    type="text"
                    value={sheetUrl}
                    onChange={(e) => setSheetUrl(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                    className="w-full bg-stone-50 border border-stone-200 text-stone-700 text-xs font-medium rounded-xl px-4 py-3 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <button
                  onClick={handleSync}
                  disabled={isSyncing}
                  className="w-full lg:w-auto flex items-center justify-center gap-2 bg-emerald-600 text-white font-black text-xs uppercase tracking-wider px-6 py-3.5 rounded-2xl hover:bg-emerald-700 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw size={14} className={isSyncing ? "animate-spin" : ""} />
                  {isSyncing ? "Syncing..." : "Update from Sheet"}
                </button>
              </div>

              {syncStatus && (
                <div className={`mt-2 p-4 rounded-xl border flex items-start gap-3 text-xs font-bold leading-relaxed ${
                  syncStatus.success 
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-100' 
                    : 'bg-rose-50 text-rose-800 border-rose-100'
                }`}>
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <div className="flex flex-col gap-1">
                    <div>{syncStatus.message}</div>
                    {syncStatus.success && syncStatus.dates && syncStatus.dates.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1 items-center">
                        <span className="text-[10px] text-stone-500 uppercase tracking-wider font-semibold">Synced dates:</span>
                        {syncStatus.dates.map(d => (
                          <span key={d} className="bg-emerald-100 text-emerald-800 text-[9px] font-mono px-1.5 py-0.5 rounded">
                            {d}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Grid Table display */}
            <div className="bg-white p-10 rounded-[3rem] border border-stone-200 shadow-sm overflow-x-auto relative">
              {selectedMonthDates.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center text-stone-400">
                  <Calendar size={40} className="stroke-1 text-stone-300 mb-3" />
                  <p className="font-serif italic text-lg text-stone-500">No machine EM entries matched this month.</p>
                  <p className="text-[10px] font-black uppercase tracking-wider mt-1 text-stone-400">Please sync from Google Sheet above to load EM records.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-xs text-stone-600">
                    <thead>
                      {/* Date Header Row */}
                      <tr className="border-b border-stone-200">
                        <th className="p-4 font-black uppercase tracking-wider text-[10px] text-stone-850 bg-stone-50 border-r border-stone-200 min-w-[120px]">
                          Row Labels
                        </th>
                        {selectedMonthDates.map(date => (
                          <th 
                            key={date} 
                            colSpan={3} 
                            className="p-3 text-center font-black uppercase tracking-wider text-[10px] text-stone-850 bg-stone-50/50 border-r border-stone-200"
                          >
                            {date}
                          </th>
                        ))}
                      </tr>

                      {/* Shift Header Row */}
                      <tr className="border-b border-stone-100 bg-stone-50/30">
                        <th className="p-3 font-bold text-stone-400 text-center border-r border-stone-200"></th>
                        {selectedMonthDates.map(date => (
                          <React.Fragment key={`shifts-${date}`}>
                            <th className="p-2 text-center font-bold text-stone-500 border-r border-stone-100 w-[60px]">1</th>
                            <th className="p-2 text-center font-bold text-stone-500 border-r border-stone-100 w-[60px]">2</th>
                            <th className="p-2 text-center font-bold text-stone-500 border-r border-stone-200 w-[60px]">3</th>
                          </React.Fragment>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {machines.map(machine => (
                        <tr key={machine} className="border-b border-stone-100 hover:bg-stone-50/50 transition-colors">
                          <td className="p-3 font-bold text-stone-900 border-r border-stone-200 bg-stone-50/30">
                            {machine}
                          </td>
                          {selectedMonthDates.map(date => (
                            <React.Fragment key={`val-${machine}-${date}`}>
                              {shifts.map(shift => {
                                const val = machineEm[date]?.[machine]?.[shift];
                                return (
                                  <td 
                                    key={`cell-${machine}-${date}-${shift}`}
                                    onClick={() => setEditingCell({ date, machine, shift, value: val !== undefined ? String(val) : '' })}
                                    className="p-2.5 text-center font-mono border-r border-stone-100 hover:bg-emerald-50 hover:text-emerald-800 transition-all cursor-pointer relative group"
                                  >
                                    {val !== undefined ? val : '-'}
                                    <div className="absolute right-1 top-1 opacity-0 group-hover:opacity-100 text-[8px] text-emerald-600 transition-opacity">
                                      <Edit size={8} />
                                    </div>
                                  </td>
                                );
                              })}
                            </React.Fragment>
                          ))}
                        </tr>
                      ))}

                      {/* Grand Total Row */}
                      <tr className="bg-stone-100/50 font-bold border-t-2 border-stone-200 text-stone-900">
                        <td className="p-4 font-bold uppercase tracking-wider text-[10px] text-stone-850 border-r border-stone-200">
                          Grand Total
                        </td>
                        {selectedMonthDates.map(date => (
                          <React.Fragment key={`total-${date}`}>
                            {shifts.map(shift => {
                              const avg = calculateColAverage(date, shift);
                              return (
                                <td 
                                  key={`col-total-${date}-${shift}`}
                                  className="p-3 text-center font-mono border-r border-stone-100 text-emerald-700 bg-emerald-50/20"
                                >
                                  {avg}
                                </td>
                              );
                            })}
                          </React.Fragment>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {activeSubTab === 'individual' && (
          <motion.div
            key="individual"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="flex flex-col gap-6"
          >
            {/* Header / Select control block */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 bg-white p-8 rounded-[2.5rem] border border-stone-200 shadow-sm">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Operator EM Format</span>
                  <h2 className="font-serif italic text-3xl tracking-tighter text-stone-900">Operator EM Ledger</h2>
                </div>

                {/* Worker Selector */}
                <div className="flex flex-col gap-1 min-w-[240px]">
                  <label className="text-[9px] font-black uppercase tracking-wider text-stone-400">Select Operator</label>
                  <select
                    value={selectedWorkerId}
                    onChange={(e) => setSelectedWorkerId(e.target.value)}
                    className="bg-stone-50 border border-stone-200 text-stone-700 text-xs font-bold rounded-xl px-4 py-2.5 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  >
                    <option value="">-- Choose Operator --</option>
                    {workers.map(w => (
                      <option key={w.id} value={w.id}>{w.name} ({w.tNo})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Date Filters */}
              <div className="flex flex-wrap items-center gap-4">
                <CalendarDatePicker
                  label="From Date"
                  value={fromDate}
                  onChange={(_, iso) => setFromDate(iso || fromDate)}
                />

                <CalendarDatePicker
                  label="To Date"
                  value={toDate}
                  onChange={(_, iso) => setToDate(iso || toDate)}
                />

                <button
                  onClick={exportLedgerToExcel}
                  disabled={individualEmLedger.length === 0}
                  className="flex items-center gap-2 bg-stone-950 text-white font-black text-xs uppercase tracking-wider px-5 py-3 rounded-2xl hover:bg-stone-850 active:scale-95 transition-all cursor-pointer shadow-sm md:mt-4 disabled:opacity-50"
                >
                  <Download size={14} /> Export Ledger
                </button>
              </div>
            </div>

            {/* Individual Table display */}
            <div className="bg-white p-10 rounded-[3rem] border border-stone-200 shadow-sm relative">
              {!selectedWorkerId ? (
                <div className="flex flex-col items-center justify-center py-16 text-center text-stone-400">
                  <Users size={40} className="stroke-1 text-stone-300 mb-3" />
                  <p className="font-serif italic text-lg text-stone-500 font-medium">No operator selected.</p>
                  <p className="text-[10px] font-black uppercase tracking-wider mt-1 text-stone-400">Please select an operator in the dropdown menu to view their ledger.</p>
                </div>
              ) : individualEmLedger.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center text-stone-400">
                  <FileText size={40} className="stroke-1 text-stone-300 mb-3" />
                  <p className="font-serif italic text-lg text-stone-500 font-medium">No ledger entries match this date range.</p>
                  <p className="text-[10px] font-black uppercase tracking-wider mt-1 text-stone-400">Verify dates and worker active schedules.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-6">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-stone-50 border border-stone-200/60 p-5 rounded-2xl">
                      <span className="text-[9px] font-black uppercase tracking-wider text-stone-400 block mb-1">Total Shifts worked</span>
                      <span className="text-3xl font-bold text-stone-900">{individualStats.totalShifts}</span>
                    </div>
                    <div className="bg-stone-50 border border-stone-200/60 p-5 rounded-2xl">
                      <span className="text-[9px] font-black uppercase tracking-wider text-stone-400 block mb-1">Average Actual GPS</span>
                      <span className="text-3xl font-bold text-emerald-600">{individualStats.avgGps.toFixed(3)}</span>
                    </div>
                    <div className="bg-stone-50 border border-stone-200/60 p-5 rounded-2xl">
                      <span className="text-[9px] font-black uppercase tracking-wider text-stone-400 block mb-1">Average EM Value</span>
                      <span className="text-3xl font-bold text-indigo-600">{individualStats.avgEm.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-xs text-stone-600">
                      <thead>
                        <tr className="border-b border-stone-200 text-stone-400 bg-stone-50/50">
                          <th className="p-3 font-black uppercase tracking-wider text-[10px] text-stone-850 w-[80px]">S.No</th>
                          <th className="p-3 font-black uppercase tracking-wider text-[10px] text-stone-850">Date</th>
                          <th className="p-3 font-black uppercase tracking-wider text-[10px] text-stone-850 text-center">Shift</th>
                          <th className="p-3 font-black uppercase tracking-wider text-[10px] text-stone-850 text-center">Machine</th>
                          <th className="p-3 font-black uppercase tracking-wider text-[10px] text-stone-850">Count</th>
                          <th className="p-3 font-black uppercase tracking-wider text-[10px] text-stone-850 text-right">Actual GPS</th>
                          <th className="p-3 font-black uppercase tracking-wider text-[10px] text-stone-850 text-right">EM Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {individualEmLedger.map((item, idx) => (
                          <tr key={`${item.date}-${item.shift}-${item.machine}`} className="border-b border-stone-100 hover:bg-stone-50/30 transition-colors">
                            <td className="p-3 font-medium text-stone-400">{idx + 1}</td>
                            <td className="p-3 font-bold text-stone-800">{item.date}</td>
                            <td className="p-3 text-center font-bold text-stone-700">{item.shift}</td>
                            <td className="p-3 text-center font-bold text-stone-700">{item.machine}</td>
                            <td className="p-3 font-mono text-stone-500">{item.count}</td>
                            <td className="p-3 text-right font-mono text-stone-600 font-bold">{item.gps.toFixed(3)}</td>
                            <td className="p-3 text-right font-mono text-indigo-600 font-bold">{item.em.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {activeSubTab === 'abstract' && (
          <motion.div
            key="abstract"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="flex flex-col gap-6"
          >
            {/* Header control block */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-8 rounded-[2.5rem] border border-stone-200 shadow-sm">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Operator EM Format</span>
                <h2 className="font-serif italic text-3xl tracking-tighter text-stone-900">Operator EM Monthly Abstract</h2>
              </div>

              {/* Month/Year selector */}
              <div className="flex flex-wrap items-center gap-4">
                <CalendarMonthPicker
                  month={selectedMonth}
                  year={selectedYear}
                  onChange={(m, y) => {
                    setSelectedMonth(m);
                    setSelectedYear(y);
                  }}
                />

                <button
                  onClick={exportAbstractToExcel}
                  disabled={monthlyAbstract.length === 0}
                  className="flex items-center gap-2 bg-stone-950 text-white font-black text-xs uppercase tracking-wider px-5 py-3 rounded-2xl hover:bg-stone-850 active:scale-95 transition-all cursor-pointer shadow-sm md:mt-4 disabled:opacity-50"
                >
                  <Download size={14} /> Export Abstract
                </button>
              </div>
            </div>

            {/* Abstract Table display */}
            <div className="bg-white p-10 rounded-[3rem] border border-stone-200 shadow-sm overflow-x-auto relative">
              {monthlyAbstract.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center text-stone-400">
                  <Users size={40} className="stroke-1 text-stone-300 mb-3" />
                  <p className="font-serif italic text-lg text-stone-500">No shift records exist for this month.</p>
                  <p className="text-[10px] font-black uppercase tracking-wider mt-1 text-stone-400">Complete assignments and upload data first.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-xs text-stone-600">
                    <thead>
                      <tr className="border-b border-stone-200 text-stone-400 bg-stone-50/50">
                        <th className="p-4 font-black uppercase tracking-wider text-[10px] text-stone-850 w-[80px]">S.No</th>
                        <th className="p-4 font-black uppercase tracking-wider text-[10px] text-stone-850">Ticket Number</th>
                        <th className="p-4 font-black uppercase tracking-wider text-[10px] text-stone-850">Operator Name</th>
                        <th className="p-4 font-black uppercase tracking-wider text-[10px] text-stone-850 text-center">Total Shifts Worked</th>
                        <th className="p-4 font-black uppercase tracking-wider text-[10px] text-stone-850 text-right">Average GPS</th>
                        <th className="p-4 font-black uppercase tracking-wider text-[10px] text-stone-850 text-right">Average EM</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyAbstract.map((item, idx) => (
                        <tr key={item.id} className="border-b border-stone-100 hover:bg-stone-50/30 transition-colors">
                          <td className="p-4 font-medium text-stone-400">{idx + 1}</td>
                          <td className="p-4 font-bold text-stone-800">{item.tNo}</td>
                          <td className="p-4 font-bold text-stone-900">{item.name}</td>
                          <td className="p-4 text-center font-bold text-stone-700 bg-stone-50/30">{item.shifts}</td>
                          <td className="p-4 text-right font-mono text-stone-600 font-bold">{item.avgGps.toFixed(3)}</td>
                          <td className="p-4 text-right font-mono text-indigo-600 font-black">{item.avgEm.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {activeSubTab === 'operator-monthly-em' && (
          <motion.div
            key="operator-monthly-em"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="flex flex-col gap-6"
          >
            {/* Header control block */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-8 rounded-[2.5rem] border border-stone-200 shadow-sm">
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Operator EM Format</span>
                <h2 className="font-serif italic text-3xl tracking-tighter text-stone-900">Sider Monthly EM Statement</h2>
              </div>

              {/* Controls */}
              <div className="flex flex-wrap items-center gap-4">
                <CalendarMonthPicker
                  month={selectedMonth}
                  year={selectedYear}
                  onChange={(m, y) => {
                    setSelectedMonth(m);
                    setSelectedYear(y);
                  }}
                />

                <div className="flex flex-col gap-1 min-w-[200px]">
                  <label className="text-[9px] font-black uppercase tracking-wider text-stone-400">Search Operator</label>
                  <input
                    type="text"
                    placeholder="Name or Ticket No..."
                    value={operatorSearchQuery}
                    onChange={(e) => setOperatorSearchQuery(e.target.value)}
                    className="bg-stone-50 border border-stone-200 text-stone-700 text-xs font-bold rounded-xl px-4 py-2.5 focus:ring-1 focus:ring-emerald-500 focus:outline-none placeholder:text-stone-300"
                  />
                </div>

                <button
                  onClick={exportOperatorMonthlyToExcel}
                  disabled={operatorEmGridData.length === 0}
                  className="flex items-center gap-2 bg-stone-950 text-white font-black text-xs uppercase tracking-wider px-5 py-3 rounded-2xl hover:bg-stone-850 active:scale-95 transition-all cursor-pointer shadow-sm md:mt-4 disabled:opacity-50"
                >
                  <Download size={14} /> Export Sheet
                </button>
              </div>
            </div>

            {/* Main Table Grid */}
            <div className="bg-white p-10 rounded-[3rem] border border-stone-200 shadow-sm overflow-x-auto relative">
              {filteredOperatorGridData.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center text-stone-400">
                  <Users size={40} className="stroke-1 text-stone-300 mb-3" />
                  <p className="font-serif italic text-lg text-stone-500">No matching operators found.</p>
                  <p className="text-[10px] font-black uppercase tracking-wider mt-1 text-stone-400">Try checking selected month/year or search keywords.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-center text-[15px] text-stone-600 border border-stone-200">
                    <thead>
                      <tr className="border-b border-stone-200 text-stone-500 bg-stone-50">
                        <th className="p-3 text-left font-black uppercase tracking-wider text-[13px] text-stone-800 w-[100px] border border-stone-200">TNo</th>
                        <th className="p-3 text-left font-black uppercase tracking-wider text-[13px] text-stone-800 w-[180px] border border-stone-200">Sider Name</th>
                        {calendarDates.map(dateStr => {
                          const dp = parseUniversalDateParts(dateStr);
                          const dayNum = dp ? dp.day : dateStr;
                          return (
                            <th key={dateStr} className="p-1 font-black text-[13px] text-stone-800 border border-stone-200 w-[35px] text-center bg-stone-50">
                              {dayNum}
                            </th>
                          );
                        })}
                        <th className="p-3 font-black uppercase tracking-wider text-[13px] text-emerald-700 w-[80px] border border-stone-200 bg-emerald-50">Avg EM</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOperatorGridData.map(({ worker, dateValues, averageEm }) => (
                        <tr key={worker.id} className="border-b border-stone-100 hover:bg-stone-50/30 transition-colors">
                          <td className="p-3 text-left font-mono font-bold text-stone-500 border border-stone-200 bg-stone-50/20">{worker.tNo}</td>
                          <td className="p-3 text-left font-bold text-stone-900 border border-stone-200 truncate bg-stone-50/20 uppercase">{worker.name.toUpperCase()}</td>
                          {calendarDates.map(dateStr => {
                            const val = dateValues[dateStr];
                            const isRed = val !== null && val > 3;
                            const isGreen = val !== null && val < 2.5;
                            return (
                              <td 
                                key={dateStr} 
                                className={`p-1 font-mono border border-stone-200 text-center ${
                                  val !== null 
                                    ? (isRed ? 'text-red-600 font-extrabold bg-red-50/20' : isGreen ? 'text-green-600 font-extrabold bg-green-50/20' : 'text-stone-800 font-bold bg-emerald-50/10') 
                                    : 'text-stone-300'
                                }`}
                              >
                                {val !== null ? val.toFixed(1) : ''}
                              </td>
                            );
                          })}
                          <td className={`p-3 font-mono font-black border border-stone-200 ${averageEm !== null ? (averageEm > 3 ? 'text-red-600 bg-red-50/20 font-extrabold' : averageEm < 2.5 ? 'text-green-600 bg-green-50/20 font-extrabold' : 'text-emerald-700 bg-emerald-50') : 'text-stone-400'}`}>
                            {averageEm !== null ? averageEm.toFixed(2) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {activeSubTab === 'daily-em-report' && (
          <motion.div
            key="daily-em-report"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="flex flex-col gap-6"
          >
            {/* Header control block */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-8 rounded-[2.5rem] border border-stone-200 shadow-sm">
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Operator EM Format</span>
                <h2 className="font-serif italic text-3xl tracking-tighter text-stone-900">Daily EM Report Statement</h2>
              </div>

              {/* Controls */}
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-black uppercase tracking-wider text-stone-400">Select Date</label>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        // Go to previous available date in history
                        const sortedDates = [...history]
                          .map(r => r.date)
                          .filter(Boolean)
                          .sort((a, b) => {
                            return parseUniversalDate(a).getTime() - parseUniversalDate(b).getTime();
                          });
                        const currentIdx = sortedDates.indexOf(selectedDailyEmDate);
                        if (currentIdx > 0) {
                          setSelectedDailyEmDate(sortedDates[currentIdx - 1]);
                        }
                      }}
                      disabled={history.length <= 1}
                      className="p-2.5 rounded-xl border border-stone-200 bg-stone-50 text-stone-750 hover:bg-stone-100 transition-colors cursor-pointer disabled:opacity-50"
                      title="Previous available date"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <input
                      type="date"
                      value={dateToInputString(selectedDailyEmDate)}
                      onChange={(e) => {
                        const newDateStr = inputStringToDate(e.target.value);
                        if (newDateStr) setSelectedDailyEmDate(newDateStr);
                      }}
                      className="bg-stone-50 border border-stone-200 text-stone-700 text-xs font-bold rounded-xl px-4 py-2.5 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                    />
                    <button
                      onClick={() => {
                        // Go to next available date in history
                        const sortedDates = [...history]
                          .map(r => r.date)
                          .filter(Boolean)
                          .sort((a, b) => {
                            return parseUniversalDate(a).getTime() - parseUniversalDate(b).getTime();
                          });
                        const currentIdx = sortedDates.indexOf(selectedDailyEmDate);
                        if (currentIdx !== -1 && currentIdx < sortedDates.length - 1) {
                          setSelectedDailyEmDate(sortedDates[currentIdx + 1]);
                        }
                      }}
                      disabled={history.length <= 1}
                      className="p-2.5 rounded-xl border border-stone-200 bg-stone-50 text-stone-750 hover:bg-stone-100 transition-colors cursor-pointer disabled:opacity-50"
                      title="Next available date"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>

                <button
                  onClick={exportDailyEmToExcel}
                  disabled={dailyEmRows.length === 0}
                  className="flex items-center gap-2 bg-stone-900 text-white font-black text-xs uppercase tracking-wider px-5 py-3 rounded-2xl hover:bg-stone-800 active:scale-95 transition-all cursor-pointer shadow-sm md:mt-4 disabled:opacity-50"
                >
                  <Download size={14} /> Export Excel
                </button>

                <button
                  onClick={exportDailyEmToPdf}
                  disabled={dailyEmRows.length === 0 || isExportingPdf}
                  className="flex items-center gap-2 bg-red-700 text-white font-black text-xs uppercase tracking-wider px-5 py-3 rounded-2xl hover:bg-red-800 active:scale-95 transition-all cursor-pointer shadow-sm md:mt-4 disabled:opacity-50"
                >
                  {isExportingPdf ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" /> Exporting PDF...
                    </>
                  ) : (
                    <>
                      <FileText size={14} /> Export PDF (Portrait)
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Daily EM Report Table Display */}
            <div 
              id="daily-em-report-pdf-container"
              ref={dailyReportRef}
              className="bg-white p-10 rounded-[3rem] border border-stone-200 shadow-sm relative flex flex-col items-center"
            >
              {/* Report Header Title Block to match user's custom design request */}
              <div className="w-full max-w-4xl border-b border-stone-200 pb-6 mb-6 flex flex-col items-center text-center">
                <h1 className="text-3xl font-serif italic text-stone-900 tracking-tight">Daily Em Report</h1>
                <div className="text-lg font-mono font-bold text-stone-600 mt-2 bg-stone-50 px-4 py-1 rounded-full border border-stone-100 shadow-xs">
                  {selectedDailyEmDate || 'No Date Selected'}
                </div>
              </div>

              {dailyEmRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center text-stone-400">
                  <AlertCircle size={40} className="stroke-1 text-stone-300 mb-3" />
                  <p className="font-serif italic text-lg text-stone-500">No shift records exist for {selectedDailyEmDate || 'the selected date'}.</p>
                  <p className="text-[10px] font-black uppercase tracking-wider mt-1 text-stone-400">Please select a different date from the controls above.</p>
                </div>
              ) : (
                <div className="overflow-x-auto w-full max-w-4xl">
                  <table className="w-full border-collapse text-left text-stone-700 border border-stone-200 shadow-xs rounded-2xl overflow-hidden">
                    <thead>
                      <tr className="border-b border-stone-200 bg-stone-50 text-stone-800 font-bold">
                        <th style={{ fontSize: '15px' }} className="p-4 border-r border-stone-200 border-b border-stone-200 font-extrabold uppercase tracking-wider">TNo</th>
                        <th style={{ fontSize: '15px' }} className="p-4 border-r border-stone-200 border-b border-stone-200 font-extrabold uppercase tracking-wider">Sider Name</th>
                        <th style={{ fontSize: '15px' }} className="p-4 border-r border-stone-200 border-b border-stone-200 text-center font-extrabold uppercase tracking-wider">Shift</th>
                        <th style={{ fontSize: '15px' }} className="p-4 border-r border-stone-200 border-b border-stone-200 text-center font-extrabold uppercase tracking-wider">MC NO</th>
                        <th style={{ fontSize: '15px' }} className="p-4 border-r border-stone-200 border-b border-stone-200 text-center font-extrabold uppercase tracking-wider">Count</th>
                        <th style={{ fontSize: '15px' }} className="p-4 border-r border-stone-200 border-b border-stone-200 text-right font-extrabold uppercase tracking-wider">GPS</th>
                        <th style={{ fontSize: '15px' }} className="p-4 border-b border-stone-200 text-right font-extrabold uppercase tracking-wider text-emerald-800 bg-emerald-50/50">EM</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dailyEmRows.map((row, idx) => (
                        <tr 
                          key={`${row.siderName}-${row.mcNo}-${row.shift}-${idx}`} 
                          className="border-b border-stone-100 hover:bg-stone-50/30 transition-colors"
                        >
                          <td style={{ fontSize: '17px' }} className="p-4 border-r border-stone-200 font-mono text-stone-600">
                            {row.tNo || '-'}
                          </td>
                          <td style={{ fontSize: '17px' }} className="p-4 border-r border-stone-200 font-bold text-stone-900 uppercase">
                            {row.siderName.toUpperCase()}
                          </td>
                          <td style={{ fontSize: '17px' }} className="p-4 border-r border-stone-200 text-center font-bold text-stone-500">{row.shift}</td>
                          <td style={{ fontSize: '17px' }} className="p-4 border-r border-stone-200 text-center font-mono font-bold text-stone-800 bg-stone-50/30">{row.mcNo}</td>
                          <td style={{ fontSize: '17px' }} className="p-4 border-r border-stone-200 text-center font-semibold text-stone-600">{row.count || '-'}</td>
                          <td style={{ fontSize: '17px' }} className="p-4 border-r border-stone-200 text-right font-mono text-stone-600 font-medium">
                            {row.gps ? Math.round(row.gps) : '-'}
                          </td>
                          <td style={{ fontSize: '17px' }} className={`p-4 text-right font-mono font-black border-l border-stone-100 ${row.em !== null ? (row.em > 3 ? 'text-red-600 font-extrabold bg-red-50/20' : row.em < 2.5 ? 'text-green-600 font-extrabold bg-green-50/20' : 'text-stone-800 bg-emerald-50/20') : 'text-stone-400'}`}>
                            {row.em !== null ? row.em.toFixed(2) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {dailyEmRows.length > 0 && (
                      <tfoot>
                        <tr className="bg-stone-100 font-black border-t-2 border-stone-200">
                          <td colSpan={6} style={{ fontSize: '15px' }} className="p-4 text-right uppercase tracking-wider text-stone-800 font-bold border-r border-stone-200">
                            Average EM:
                          </td>
                          <td style={{ fontSize: '17px' }} className="p-4 text-right font-mono text-stone-900 font-extrabold">
                            {(dailyEmRows.reduce((sum, r) => sum + (r.em || 0), 0) / dailyEmRows.length).toFixed(2)}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Manual Cell Edit Modal */}
      {editingCell && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white p-8 rounded-[2rem] border border-stone-200 shadow-2xl max-w-sm w-full flex flex-col gap-5"
          >
            <div className="flex justify-between items-start">
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Manual Override</span>
                <h3 className="font-serif italic text-xl tracking-tight text-stone-850">Edit Machine EM</h3>
              </div>
              <button 
                onClick={() => setEditingCell(null)}
                className="p-1 rounded-full text-stone-400 hover:text-stone-750 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Cell Info */}
            <div className="bg-stone-50 p-4 rounded-xl border border-stone-100 text-[11px] font-bold text-stone-500 flex flex-col gap-1 leading-relaxed">
              <div>Date: <span className="text-stone-900">{editingCell.date}</span></div>
              <div>Machine: <span className="text-stone-900">{editingCell.machine}</span></div>
              <div>Shift: <span className="text-stone-900">{editingCell.shift}</span></div>
            </div>

            {/* Input field */}
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-black uppercase tracking-wider text-stone-400">EM Value</label>
              <input
                type="number"
                step="0.01"
                autoFocus
                value={editingCell.value}
                onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCellUpdate();
                  if (e.key === 'Escape') setEditingCell(null);
                }}
                className="bg-stone-50 border border-stone-200 text-stone-700 text-xs font-bold rounded-xl px-4 py-3 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              />
            </div>

            <div className="flex gap-3 justify-end mt-2">
              <button
                onClick={() => setEditingCell(null)}
                className="px-4 py-2.5 rounded-xl border border-stone-200 text-xs font-bold text-stone-500 hover:bg-stone-50 active:scale-95 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleCellUpdate}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-black uppercase tracking-wider hover:bg-emerald-700 active:scale-95 transition-all cursor-pointer shadow-sm"
              >
                Save Changes
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};
