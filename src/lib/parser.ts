import * as XLSX from 'xlsx';
import { DailyReport, ProductionEntry, FrameDailySummary, Shift, Sider, CountConversion, MachineEmData, Shed } from '../types';
import { parseUniversalDate } from './utils';

export const normalizeDateValue = (val: any): string => {
  if (val === undefined || val === null) return '';
  if (val instanceof Date || (typeof val === 'object' && val !== null && typeof (val as any).getMonth === 'function')) {
    const d = val as Date;
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
  }
  if (typeof val === 'number' && val > 40000) {
    const d = new Date((val - 25569) * 86400 * 1000);
    return `${d.getUTCDate().toString().padStart(2, '0')}/${(d.getUTCMonth() + 1).toString().padStart(2, '0')}/${d.getUTCFullYear()}`;
  }
  const str = String(val).trim();
  // If it's a date string with hyphens, e.g., 2026-06-19 or 2026/06/19
  const divider = str.includes('-') ? '-' : str.includes('/') ? '/' : null;
  if (divider) {
    const parts = str.split(divider);
    if (parts.length === 3) {
      // If we have "date : 19/06/2026", clean date label if present
      const firstPartText = parts[0].toLowerCase();
      if (firstPartText.includes('date')) {
        parts[0] = parts[0].replace(/date\s*[:\s]*/i, '').trim();
      }
      if (parts[2].length === 2) {
        parts[2] = `20${parts[2]}`;
      } else if (parts[2].length === 3 && parts[2] === '202') {
        parts[2] = '2026';
      }
      if (parts[0].length === 4) {
        // YYYY/MM/DD -> DD/MM/YYYY
        return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
      } else {
        // DD/MM/YYYY -> DD/MM/YYYY
        return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[2]}`;
      }
    }
  }
  return str;
};

export const normalizeShedName = (val: any): Shed | null => {
  if (!val) return null;
  const str = String(val).toLowerCase().trim();
  const cleaned = str.replace(/[\s\-_]/g, '');
  if (cleaned.includes('kttm')) return 'KTTM';
  if (cleaned.includes('shed1') || cleaned.includes('shed01') || cleaned.includes('unit1') || cleaned.includes('shedi') || str.includes('shed-1') || str.includes('shed 1')) return 'Shed 1';
  if (cleaned.includes('shed2') || cleaned.includes('shed02') || cleaned.includes('unit2') || cleaned.includes('shedii') || str.includes('shed-2') || str.includes('shed 2')) return 'Shed 2';
  if (cleaned.includes('shed3') || cleaned.includes('shed03') || cleaned.includes('unit3') || cleaned.includes('shediii') || str.includes('shed-3') || str.includes('shed 3')) return 'Shed 3';
  return null;
};

export interface ShedSection {
  shed: Shed;
  startRow: number;
  endRow: number;
}

export const detectShedSections = (grid: any[][], defaultShed: Shed = 'Shed 1'): ShedSection[] => {
  if (!grid || grid.length === 0) return [];

  // Find all header rows that have "Rf no" (or "rf no", "rfno", "mc no")
  const rfHeaderRows: { rowIdx: number; colIdx: number }[] = [];
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r];
    if (!row) continue;
    const colIdx = row.findIndex((c, idx) => {
      if (idx > 4) return false;
      const s = String(c || '').toLowerCase().trim().replace(/[\s_\-]/g, '');
      return s === 'rfno' || s === 'mcno' || s === 'machineno' || s === 'rf' || s === 'machine';
    });
    if (colIdx !== -1) {
      const hasProdHeaders = row.some(c => {
        const s = String(c || '').toLowerCase().trim();
        return s.includes('count') || s.includes('prod') || s.includes('gps') || s.includes('target') || s.includes('util');
      });
      if (hasProdHeaders) {
        rfHeaderRows.push({ rowIdx: r, colIdx });
      }
    }
  }

  if (rfHeaderRows.length === 0) return [];

  const detected: { shed: Shed; headerRowIdx: number; sectionStart: number }[] = [];

  rfHeaderRows.forEach((item, idx) => {
    let matchedShed: Shed | null = null;
    let titleRow = Math.max(0, item.rowIdx - 4);

    // Search upwards from header row up to 8 rows above to find shed name
    for (let r = item.rowIdx - 1; r >= Math.max(0, item.rowIdx - 8); r--) {
      const row = grid[r];
      if (!row) continue;
      for (let c = 0; c < Math.min(row.length, 8); c++) {
        const val = row[c];
        const s = normalizeShedName(val);
        if (s) {
          matchedShed = s;
          titleRow = r;
          break;
        }
      }
      if (matchedShed) break;
    }

    const standardOrder: Shed[] = ['Shed 1', 'Shed 2', 'Shed 3', 'KTTM'];
    let finalShed: Shed;
    if (matchedShed) {
      finalShed = matchedShed;
    } else if (rfHeaderRows.length > 1 && idx < standardOrder.length) {
      finalShed = standardOrder[idx];
    } else {
      finalShed = defaultShed;
    }

    detected.push({
      shed: finalShed,
      headerRowIdx: item.rowIdx,
      sectionStart: titleRow
    });
  });

  const sections: ShedSection[] = [];
  for (let i = 0; i < detected.length; i++) {
    const startRow = detected[i].sectionStart;
    const endRow = i < detected.length - 1 ? detected[i + 1].sectionStart : grid.length;
    sections.push({
      shed: detected[i].shed,
      startRow,
      endRow
    });
  }

  return sections;
};

export const getShedMachines = (shed?: string): string[] => {
  return [];
};

export const ensureSixMachines = (report: DailyReport, targetShed?: string): DailyReport => {
  const shed = targetShed || report.shed || 'Shed 1';
  const existingFrames = Array.from(new Set(report.entries.map(e => e.frameNo))).filter(Boolean);
  const machines = existingFrames;

  const shifts: Shift[] = ['I', 'II', 'III'];
  const entries = [...report.entries];
  const summaries = [...report.summaries];

  machines.forEach(frameNo => {
    shifts.forEach(shift => {
      const exists = entries.some(e => e.frameNo === frameNo && e.shift === shift);
      if (!exists) {
        entries.push({
          shift,
          frameNo,
          count: '40s',
          productionTarget: 0,
          productionActual: 0,
          gpsTarget: 0,
          gpsActual: 0,
          gps40sCon: 0,
          efficiency: 0,
          utility: 0,
          ue: 0,
          naturalEmt: 0,
          doffEmt: 0,
          idlePercent: 0,
          worstPercent: 0,
          slipPercent: 0,
          ukg: 0,
          restartBreaks: 0,
          shed
        });
      }
    });

    const summaryExists = summaries.some(s => s.frameNo === frameNo);
    if (!summaryExists) {
      summaries.push({
        frameNo,
        count: '40s',
        stdGps: 0,
        targetProd: 0,
        actualProd: 0,
        shiftGps: { I: 0, II: 0, III: 0 },
        avgGps: 0,
        shiftUtil: { I: 0, II: 0, III: 0 },
        avgUtil: 0,
        shiftNaturalEmt: { I: 0, II: 0, III: 0 },
        shiftRestartBreaks: { I: 0, II: 0, III: 0 },
        shiftDoffEmt: { I: 0, II: 0, III: 0 },
        shiftIdle: { I: 0, II: 0, III: 0 },
        shiftWorst: { I: 0, II: 0, III: 0 },
        shiftSlip: { I: 0, II: 0, III: 0 },
        shiftUkg: { I: 0, II: 0, III: 0 },
        shiftNoOfDoff: { I: 0, II: 0, III: 0 },
        shiftAvgDoffTime: { I: 0, II: 0, III: 0 },
        shiftNoOfStop: { I: 0, II: 0, III: 0 },
        shiftNormalStopMin: { I: 0, II: 0, III: 0 },
        shiftProductionKg: { I: 0, II: 0, III: 0 },
        shiftUtilizationPinter: { I: 0, II: 0, III: 0 },
        shed
      });
    }
  });

  return {
    ...report,
    shed,
    entries: entries
      .map(e => ({ ...e, shed: e.shed || shed }))
      .sort((a, b) => {
        if (a.frameNo !== b.frameNo) return a.frameNo.localeCompare(b.frameNo);
        return a.shift.localeCompare(b.shift);
      }),
    summaries: summaries
      .map(s => ({ ...s, shed: s.shed || shed }))
      .sort((a, b) => a.frameNo.localeCompare(b.frameNo)),
    gaiters: report.gaiters || { I: [], II: [], III: [] },
    aiCones: report.aiCones || { I: [], II: [], III: [] },
    fitters: report.fitters || { I: [], II: [], III: [] },
    emData: report.emData
  };
};

export const getTodayUniversalDate = (): string => {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

export const createDefaultReportForShed = (shed: string = 'Shed 1', date: string = getTodayUniversalDate()): DailyReport => {
  return {
    date,
    shed,
    entries: [],
    summaries: [],
    gaiters: { I: [], II: [], III: [] },
    aiCones: { I: [], II: [], III: [] },
    fitters: { I: [], II: [], III: [] },
    totalProductionTarget: 0,
    totalProductionActual: 0,
    timestamp: Date.now()
  };
};

export const mockData: DailyReport = createDefaultReportForShed('Shed 1', getTodayUniversalDate());

export const parseWorkerMaster = async (file: File): Promise<Sider[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet) as any[];

        const uniqueWorkers = new Map<string, Sider>();
        
        rows.forEach((row, idx) => {
          const rawName = row.operator || row.Name || row.name || row.OPERATOR || row.SIDER || row.WORKER || row.Employee || row.Staff || row['Worker Name'] || row['Personnel Name'] || row['Workmen Name'];
          const tNo = String(row.tno || row.TicketNo || row.t_no || row['t.no'] || row['t. no'] || row['t no'] || row['T.NO'] || row['T. NO'] || row['TK No'] || row['TK.No'] || '').trim();
          
          if (!tNo && !rawName) return;

          const name = String(rawName || tNo).trim();
          if (name.toLowerCase() === 'grand total') return;

          // Prefer T.No as the key if it exists
          const key = tNo || name;
          
          if (!uniqueWorkers.has(key)) {
            uniqueWorkers.set(key, {
              id: tNo || `w-${idx}-${Date.now()}`,
              name: name,
              tNo: tNo || `T-${1000 + idx}`,
              photoUrl: `https://picsum.photos/seed/${name}/400/500`
            });
          }
        });

        resolve(Array.from(uniqueWorkers.values()));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsBinaryString(file);
  });
};

export const parseExcelReport = async (file: File, countConversions: CountConversion[] = [], targetShed?: string): Promise<DailyReport | DailyReport[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        
        const allReports: DailyReport[] = [];
        const errors: string[] = [];
        const defaultShed: Shed = (targetShed as Shed) || 'Shed 1';

        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          const grid = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
          if (!grid || grid.length === 0) continue;

          const sheetShed = normalizeShedName(sheetName) || defaultShed;

          const hasText = (text: string) => grid.some(row => 
            row && row.some(cell => String(cell || '').toLowerCase().includes(text.toLowerCase()))
          );

          const isProduction = hasText('Production Statement') || (hasText('Rf no') && (hasText('Target Prod') || hasText('Target Prc') || hasText('Total Prod') || hasText('Total Ach') || hasText('Count')));
          const isBreakage = hasText('Breakage Report') || hasText('Breaakge Report') || hasText('Machine Performance') || (hasText('Rf no') && hasText('Breaks'));
          const isIncentive = hasText('Daily Incentive Amount') || hasText('Incentive Amount');
          const isMonthlyIncentive = hasText('Sider Incetnive Report for the Month Of') || hasText('Sider Incentive Report');

          try {
            if (isProduction) {
              const sections = detectShedSections(grid, sheetShed);
              if (sections.length > 1) {
                for (const section of sections) {
                  const subgrid = grid.slice(section.startRow, section.endRow);
                  if (subgrid.length === 0) continue;
                  try {
                    const rep = handleProduction(subgrid, countConversions, section.shed);
                    if (rep && rep.entries.length > 0) {
                      allReports.push(ensureSixMachines(rep, section.shed));
                    }
                  } catch (secErr) {
                    errors.push(`${sheetName} (${section.shed}): ${secErr instanceof Error ? secErr.message : String(secErr)}`);
                  }
                }
              } else {
                const singleShed = sections.length === 1 ? sections[0].shed : sheetShed;
                const rep = handleProduction(grid, countConversions, singleShed);
                if (rep && rep.entries.length > 0) {
                  allReports.push(ensureSixMachines(rep, singleShed));
                }
              }
            } else if (isBreakage) {
              const rep = handleBreakage(grid);
              if (rep) allReports.push(ensureSixMachines(rep, sheetShed));
            } else if (isMonthlyIncentive) {
              const multiReports = handleMonthlyIncentive(grid);
              if (multiReports && multiReports.length > 0) {
                resolve(multiReports.map(r => ensureSixMachines(r, targetShed)));
                return;
              }
            } else if (isIncentive) {
              const rep = handleIncentiveDaily(grid);
              if (rep) allReports.push(ensureSixMachines(rep, sheetShed));
            }
          } catch (err) {
            errors.push(`${sheetName}: ${err instanceof Error ? err.message : String(err)}`);
            continue;
          }
        }

        // Check if any report is missing EM data, search other sheets in the workbook
        for (const rep of allReports) {
          if (!rep.emData) {
            for (const sName of workbook.SheetNames) {
              const s = workbook.Sheets[sName];
              const g = XLSX.utils.sheet_to_json(s, { header: 1 }) as any[][];
              if (!g || g.length === 0) continue;
              const { emData } = extractEmbeddedMachineEm(g, rep.date);
              if (emData) {
                rep.emData = emData;
                break;
              }
            }
          }
        }

        if (allReports.length > 1) {
          resolve(allReports);
        } else if (allReports.length === 1) {
          resolve(allReports[0]);
        } else {
          const errorMsg = errors.length > 0 
            ? `Validation Errors:\n${errors.join('\n')}`
            : 'Unrecognized format. Ensure the Excel contains "Production Statement" or "Machine Breakage Report".';
          reject(new Error(errorMsg));
        }
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsBinaryString(file);
  });
};

export const extractEmbeddedMachineEm = (grid: any[][], defaultDate: string): { emData?: MachineEmData; emTotals?: { '1': number; '2': number; '3': number } } => {
  if (!grid || grid.length < 2) return {};

  let headerRowIdx = -1;
  let machineColIdx = -1;
  let emDate = defaultDate;

  // 1. Look for Date near "Machine EM" header if specified
  for (let r = 0; r < Math.min(grid.length, 10); r++) {
    const row = grid[r];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      const cell = String(row[c] || '').toLowerCase().trim();
      if (cell.includes('machine em')) {
        for (let dr = 0; dr <= 2; dr++) {
          const searchRow = grid[r + dr];
          if (!searchRow) continue;
          for (let dc = Math.max(0, c - 2); dc < Math.min(searchRow.length, c + 8); dc++) {
            const dCell = String(searchRow[dc] || '').toLowerCase().trim();
            if (dCell.includes('date')) {
              for (let off = 1; off <= 3; off++) {
                const val = searchRow[dc + off];
                const norm = normalizeDateValue(val);
                if (norm && (norm.includes('/') || norm.includes('-'))) {
                  emDate = norm;
                  break;
                }
              }
            }
          }
        }
      }
    }
  }

  // 2. Find header row for Machine EM:
  // Look for a cell with "Machine" or "Rf no" that has adjacent/subsequent cells "Shift I", "Shift II", "Shift III" (or "Shift 1", "Shift 2", "Shift 3")
  for (let r = 0; r < Math.min(grid.length, 15); r++) {
    const row = grid[r];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      const cellText = String(row[c] || '').toLowerCase().trim();
      if (cellText === 'machine' || (c > 3 && cellText.includes('machine')) || (c > 10 && cellText.includes('rf no'))) {
        const next1 = String(row[c + 1] || '').toLowerCase().trim();
        const next2 = String(row[c + 2] || '').toLowerCase().trim();
        const next3 = String(row[c + 3] || '').toLowerCase().trim();
        if (
          (next1.includes('shift') || next1.includes('i') || next1.includes('1')) &&
          (next2.includes('shift') || next2.includes('ii') || next2.includes('2')) &&
          (next3.includes('shift') || next3.includes('iii') || next3.includes('3'))
        ) {
          headerRowIdx = r;
          machineColIdx = c;
          break;
        }
      }
    }
    if (headerRowIdx !== -1) break;
  }

  if (headerRowIdx === -1 || machineColIdx === -1) return {};

  const colShift1 = machineColIdx + 1;
  const colShift2 = machineColIdx + 2;
  const colShift3 = machineColIdx + 3;

  const result: MachineEmData = {};
  result[emDate] = {};

  let sumShift1 = 0;
  let sumShift2 = 0;
  let sumShift3 = 0;
  let countShift1 = 0;
  let countShift2 = 0;
  let countShift3 = 0;

  let fileTotal1: number | null = null;
  let fileTotal2: number | null = null;
  let fileTotal3: number | null = null;

  for (let r = headerRowIdx + 1; r < grid.length; r++) {
    const row = grid[r];
    if (!row) continue;
    const rawLabel = String(row[machineColIdx] || '').trim();
    if (!rawLabel) continue;

    const lower = rawLabel.toLowerCase();
    // Check if this is the Grand Total / Total row
    if (lower.includes('grand tot') || lower.includes('grand total') || lower === 'total') {
      const val1 = parseFloat(String(row[colShift1] || ''));
      const val2 = parseFloat(String(row[colShift2] || ''));
      const val3 = parseFloat(String(row[colShift3] || ''));
      if (!isNaN(val1)) fileTotal1 = val1;
      if (!isNaN(val2)) fileTotal2 = val2;
      if (!isNaN(val3)) fileTotal3 = val3;
      break;
    }

    // Machine row (e.g. SP029)
    const machineName = rawLabel.toUpperCase().replace(/\s+/g, '');
    const val1 = parseFloat(String(row[colShift1] || ''));
    const val2 = parseFloat(String(row[colShift2] || ''));
    const val3 = parseFloat(String(row[colShift3] || ''));

    const machineShifts: Record<string, number> = {};
    if (!isNaN(val1)) {
      machineShifts['1'] = val1;
      sumShift1 += val1;
      countShift1++;
    }
    if (!isNaN(val2)) {
      machineShifts['2'] = val2;
      sumShift2 += val2;
      countShift2++;
    }
    if (!isNaN(val3)) {
      machineShifts['3'] = val3;
      sumShift3 += val3;
      countShift3++;
    }

    if (Object.keys(machineShifts).length > 0) {
      result[emDate][machineName] = machineShifts;
    }
  }

  // Calculate totals if not provided in file (Averages across machines per shift)
  const calcTotal1 = countShift1 > 0 ? Number((sumShift1 / countShift1).toFixed(1)) : 0;
  const calcTotal2 = countShift2 > 0 ? Number((sumShift2 / countShift2).toFixed(1)) : 0;
  const calcTotal3 = countShift3 > 0 ? Number((sumShift3 / countShift3).toFixed(1)) : 0;

  const finalTotals = {
    '1': fileTotal1 !== null ? fileTotal1 : calcTotal1,
    '2': fileTotal2 !== null ? fileTotal2 : calcTotal2,
    '3': fileTotal3 !== null ? fileTotal3 : calcTotal3,
  };

  const hasData = Object.keys(result[emDate]).length > 0;
  return hasData ? { emData: result, emTotals: finalTotals } : {};
};

const handleProduction = (grid: any[][], countConversions: CountConversion[], targetShed: Shed = 'Shed 1'): DailyReport => {
  let reportDate = new Date().toLocaleDateString('en-GB');
  let headerRowIdx = -1;
  let labelCol = -1;

  for (let r = 0; r < Math.min(grid.length, 15); r++) {
    if (!grid[r]) continue;
    const idx = grid[r].findIndex(c => {
      const s = String(c || '').toLowerCase().trim();
      return s.includes('rf no') || s.includes('rfno') || s.includes('mc no') || (s.includes('machine') && !s.includes('machine em'));
    });
    if (idx !== -1) {
      headerRowIdx = r;
      labelCol = idx;
      break;
    }
  }

  // Find date (Searching the whole top area)
  for (let r = 0; r < Math.min(grid.length, 10); r++) {
    const dateIdx = grid[r]?.findIndex(c => String(c || '').toLowerCase().includes('date'));
    if (dateIdx !== -1) {
      // Look for the date in the same cell or next few cells
      for (let offset = 0; offset < 5; offset++) {
        const val = grid[r][dateIdx + offset];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          const norm = normalizeDateValue(val);
          if (norm && (norm.includes('/') || norm.includes('-') || (typeof val === 'number' && val > 40000))) {
            reportDate = norm;
            break;
          }
        }
      }
      if (reportDate) break;
    }
  }

  if (headerRowIdx === -1) throw new Error('Could not find header "Rf no"');

  const summaries: FrameDailySummary[] = [];
  const entries: ProductionEntry[] = [];
  
  const colMap = {
    frame: labelCol, 
    count: labelCol + 1, 
    stdGps: labelCol + 2, 
    targetProd: labelCol + 3,
    prodI: labelCol + 4,
    prodII: labelCol + 5,
    prodIII: labelCol + 6,
    totalAch: labelCol + 7,
    gpsI: labelCol + 8, 
    gpsII: labelCol + 9, 
    gpsIII: labelCol + 10, 
    gpsTotal: labelCol + 11,
    uI: labelCol + 12, 
    uII: labelCol + 13, 
    uIII: labelCol + 14, 
    uTotal: labelCol + 15
  };

  const headerRow = grid[headerRowIdx] || [];
  headerRow.forEach((cellVal, cIdx) => {
    const raw = String(cellVal || '').toLowerCase().trim();
    const text = raw.replace(/[\s_%-]/g, '');
    if (text === 'rfno' || text === 'mcno' || text === 'machineno' || (text === 'machine' && cIdx < 5)) colMap.frame = cIdx;
    else if (text === 'count') colMap.count = cIdx;
    else if (text === 'stdgps' || text === 'std') colMap.stdGps = cIdx;
    else if (text === 'targetprod' || text === 'targetprc' || text === 'target') colMap.targetProd = cIdx;
    else if (text === 'prodi' || text === 'shifti' || text === 'prod1' || text === 'shift1') colMap.prodI = cIdx;
    else if (text === 'prodii' || text === 'shiftii' || text === 'prod2' || text === 'shift2') colMap.prodII = cIdx;
    else if (text === 'prodiii' || text === 'shiftiii' || text === 'prod3' || text === 'shift3') colMap.prodIII = cIdx;
    else if (text === 'totalproc' || text === 'totalprod' || text === 'totalach' || text === 'totalachieved') colMap.totalAch = cIdx;
    else if (text === 'gpsi' || text === 'gps1') colMap.gpsI = cIdx;
    else if (text === 'gpsii' || text === 'gps2') colMap.gpsII = cIdx;
    else if (text === 'gpsiii' || text === 'gps3') colMap.gpsIII = cIdx;
    else if (text === 'avggps' || text === 'totalgps') colMap.gpsTotal = cIdx;
    else if (text === 'utili' || text === 'ui' || text === 'util1' || text === 'u1') colMap.uI = cIdx;
    else if (text === 'utilii' || text === 'uii' || text === 'util2' || text === 'u2') colMap.uII = cIdx;
    else if (text === 'utiliii' || text === 'uiii' || text === 'util3' || text === 'u3') colMap.uIII = cIdx;
    else if (text === 'avgutil' || text === 'totalu' || text === 'totalutil') colMap.uTotal = cIdx;
  });

  const countTo40s = new Map<string, number>();
  let runningCountRow = -1;
  for(let r = headerRowIdx + 1; r < grid.length; r++) {
    if (grid[r] && String(grid[r][labelCol] || '').toLowerCase().includes('running count')) {
      runningCountRow = r;
      break;
    }
  }
  if (runningCountRow !== -1) {
    // Looking at Col N (index 13) for 40s GPSS
    for (let r = runningCountRow + 1; r < Math.min(grid.length, runningCountRow + 15); r++) {
      const row = grid[r];
      if (!row) continue;
      const countName = String(row[labelCol] || '').trim();
      if (!countName || countName.toLowerCase().includes('count') || countName.toLowerCase().includes('running')) continue;
      if (countName.toLowerCase().includes('total')) break;
      const val40s = Number(row[labelCol + 13]); // Col N 40s conversion (Running table)
      if (!isNaN(val40s) && val40s > 0) countTo40s.set(countName, val40s);
    }
  }

  let totalTarget = 0;
  let totalAchieved = 0;
  let fileTotalTarget: number | null = null;
  let fileTotalAchieved: number | null = null;
  const loopEnd = runningCountRow !== -1 ? runningCountRow : grid.length;

  for (let r = headerRowIdx + 1; r < loopEnd; r++) {
    const row = grid[r];
    if (!row) continue;
    const frameNoRaw = String(row[colMap.frame] || '').trim();
    if (!frameNoRaw || frameNoRaw.toLowerCase().includes('rf no') || frameNoRaw.toLowerCase().includes('running')) continue;

    const lowerFrame = frameNoRaw.toLowerCase();
    // Check for Total / Grand Total row at the bottom
    if (lowerFrame === 'total' || lowerFrame === 'grand total' || lowerFrame === 'grand tot' || lowerFrame.includes('date')) {
      const fileTarget = Number(row[colMap.targetProd]);
      const fileAch = Number(row[colMap.totalAch]);
      if (!isNaN(fileTarget) && fileTarget > 0) fileTotalTarget = fileTarget;
      if (!isNaN(fileAch) && fileAch > 0) fileTotalAchieved = fileAch;
      break;
    }

    // Normalize machine name: clean whitespace
    const frameNo = frameNoRaw.toUpperCase()
      .replace(/\s+/g, '')
      .trim();

    const count = String(row[colMap.count] || '').trim();
    const stdGps = Number(row[colMap.stdGps]) || 0;
    const targetProd = Number(row[colMap.targetProd]) || 0;
    let actualProd = Number(row[colMap.totalAch]) || 0;

    const sGps = { I: Number(row[colMap.gpsI])||0, II: Number(row[colMap.gpsII])||0, III: Number(row[colMap.gpsIII])||0 };
    const sUtil = { I: Number(row[colMap.uI])||0, II: Number(row[colMap.uII])||0, III: Number(row[colMap.uIII])||0 };
    
    const sProd = {
      I: Number(row[colMap.prodI]) || 0,
      II: Number(row[colMap.prodII]) || 0,
      III: Number(row[colMap.prodIII]) || 0
    };

    if (actualProd === 0 && (sProd.I > 0 || sProd.II > 0 || sProd.III > 0)) {
      actualProd = sProd.I + sProd.II + sProd.III;
    }

    const hasSProd = sProd.I > 0 || sProd.II > 0 || sProd.III > 0;
    const finalSProd = hasSProd ? sProd : {
      I: (sGps.I + sGps.II + sGps.III > 0) ? actualProd * (sGps.I / (sGps.I + sGps.II + sGps.III)) : actualProd / 3,
      II: (sGps.I + sGps.II + sGps.III > 0) ? actualProd * (sGps.II / (sGps.I + sGps.II + sGps.III)) : actualProd / 3,
      III: (sGps.I + sGps.II + sGps.III > 0) ? actualProd * (sGps.III / (sGps.I + sGps.II + sGps.III)) : actualProd / 3,
    };
    
    const conversionObj = countConversions.find(c => c.count.toLowerCase() === count.toLowerCase());
    const row40s = countTo40s.get(count) || (conversionObj ? actualProd * conversionObj.multiplicationFactor / 3 : 0);
    
    totalTarget += targetProd;
    totalAchieved += actualProd;

    summaries.push({
      frameNo, count, stdGps, targetProd, actualProd,
      shiftGps: sGps, avgGps: Number(row[colMap.gpsTotal])||0,
      shiftUtil: sUtil, avgUtil: Number(row[colMap.uTotal])||0,
      shiftNaturalEmt: {I:0,II:0,III:0}, shiftRestartBreaks: {I:0,II:0,III:0},
      shiftDoffEmt: {I:0,II:0,III:0}, shiftIdle: {I:0,II:0,III:0},
      shiftWorst: {I:0,II:0,III:0}, shiftSlip: {I:0,II:0,III:0},
      shiftUkg: {I:0,II:0,III:0}, shiftNoOfDoff: {I:0,II:0,III:0},
      shiftAvgDoffTime: {I:0,II:0,III:0}, shiftNoOfStop: {I:0,II:0,III:0},
      shiftNormalStopMin: {I:0,II:0,III:0}, shiftProductionKg: finalSProd,
      shiftUtilizationPinter: {I:0,II:0,III:0},
      shed: targetShed
    });

    ['I', 'II', 'III'].forEach((sh, idx) => {
      const currentGps = idx === 0 ? sGps.I : idx === 1 ? sGps.II : sGps.III;
      const totalG = sGps.I + sGps.II + sGps.III || 1;
      const share = currentGps / totalG;
      
      const conv40s = countTo40s.get(count) ? (countTo40s.get(count)! * share) : (conversionObj ? currentGps * conversionObj.multiplicationFactor : 0);
      const currentProdActual = idx === 0 ? finalSProd.I : idx === 1 ? finalSProd.II : finalSProd.III;

      entries.push({
        shift: sh as Shift, frameNo, count,
        productionTarget: targetProd / 3,
        productionActual: currentProdActual,
        gpsTarget: stdGps, gpsActual: currentGps,
        gps40sCon: conv40s, efficiency: (actualProd/targetProd)*100 || 0,
        utility: idx === 0 ? sUtil.I : idx === 1 ? sUtil.II : sUtil.III,
        ue: 0, naturalEmt: 0, doffEmt: 0, idlePercent: 0, worstPercent: 0,
        slipPercent: 0, ukg: 0, restartBreaks: 0,
        shed: targetShed
      });
    });
  }

  // If total was in the file, use it; otherwise, use calculated sum
  const finalTotalTarget = (fileTotalTarget !== null && fileTotalTarget > 0) ? fileTotalTarget : totalTarget;
  const finalTotalAchieved = (fileTotalAchieved !== null && fileTotalAchieved > 0) ? fileTotalAchieved : totalAchieved;

  // Check for Machine EM embedded on the same sheet
  const { emData } = extractEmbeddedMachineEm(grid, reportDate);

  return {
    date: reportDate,
    shed: targetShed,
    entries,
    summaries,
    totalProductionTarget: finalTotalTarget,
    totalProductionActual: finalTotalAchieved,
    emData
  };
};

const handleBreakage = (grid: any[][]): DailyReport => {
  let reportDate = new Date().toLocaleDateString('en-GB');
  let tableStartRow = -1;
  let labelCol = -1;

  for (let r = 0; r < Math.min(grid.length, 15); r++) {
    const row = grid[r];
    if (!row) continue;
    const idx = row.findIndex(c => String(c || '').toLowerCase().includes('rf no'));
    if (idx !== -1) {
      tableStartRow = r;
      labelCol = idx;
      break;
    }
  }

  // Find date
  for (let r = 0; r < Math.min(grid.length, 10); r++) {
    const dateRow = grid[r];
    if (!dateRow) continue;
    const dateIdx = dateRow.findIndex(c => String(c || '').toLowerCase().includes('date'));
    if (dateIdx !== -1) {
      // Look for the date in the next few cells
      for (let offset = 1; offset < 5; offset++) {
        const val = dateRow[dateIdx + offset];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          const norm = normalizeDateValue(val);
          if (norm && (norm.includes('/') || norm.includes('-') || (typeof val === 'number' && val > 40000))) {
            reportDate = norm;
            break;
          }
        }
      }
      if (reportDate) break;
    }
  }

  if (tableStartRow === -1) throw new Error('Could not find breakage header "Rf no"');

  const summaries: FrameDailySummary[] = [];
  
  const getVal = (labels: string | string[], col: number) => {
    const list = Array.isArray(labels) ? labels : [labels];
    const r = grid.find(row => {
      if (!row) return false;
      const cellStr = String(row[labelCol] || '').toLowerCase().trim();
      return list.some(lbl => cellStr.includes(lbl.toLowerCase()));
    });
    return r ? Number(r[col]) || 0 : 0;
  };

  const getStr = (label: string, col: number) => {
    const r = grid.find(row => row && String(row[labelCol] || '').toLowerCase().trim().includes(label.toLowerCase()));
    return r ? String(r[col] || '') : '';
  };

  const rfHeader = grid[tableStartRow];
  const rfNodes: { frame: string, startCol: number }[] = [];
  
  const isMachineName = (name: string) => {
    const norm = name.toUpperCase().replace(/\s+/g, '');
    return /\d+/.test(norm) && !norm.includes('TOTAL') && !norm.includes('SHIFT') && !norm.includes('STD') && !norm.includes('DATE');
  };

  // Machine names start after STD column
  let c = labelCol + 2;
  while (c < (rfHeader?.length || 0)) {
    const val = String(rfHeader[c] || '').trim();
    const valAbove = grid[tableStartRow - 1] ? String(grid[tableStartRow - 1][c] || '').trim() : '';
    const finalName = (val || valAbove).toUpperCase();
    
    if (finalName.includes('TOTAL')) {
      break; // Stop at Total column
    }
    
    if (isMachineName(finalName)) {
      const normalized = finalName
        .replace(/\s+/g, '')
        .trim();
        
      rfNodes.push({ 
        frame: normalized, 
        startCol: c 
      });
      c += 3; // Hop to the next machine's starting column (assuming 3 shift columns per machine)
    } else {
      c += 1; // Check next column
    }
  }

  if (rfNodes.length === 0) throw new Error('No machines found starting from column ' + (labelCol + 2));

  const entries: ProductionEntry[] = [];
  let totalProductionActual = 0;

  rfNodes.forEach(node => {
    const sUtil = { I: getVal('Utilisation', node.startCol), II: getVal('Utilisation', node.startCol+1), III: getVal('Utilisation', node.startCol+2) };
    const sProd = { I: getVal('Production in Kg', node.startCol), II: getVal('Production in Kg', node.startCol+1), III: getVal('Production in Kg', node.startCol+2) };
    const nCount = getStr('Count', node.startCol);

    totalProductionActual += (sProd.I + sProd.II + sProd.III);

    summaries.push({
      frameNo: node.frame, count: nCount,
      stdGps: 0, targetProd: 0, actualProd: sProd.I + sProd.II + sProd.III,
      shiftGps: {I:0,II:0,III:0}, avgGps: 0, shiftUtil: sUtil, avgUtil: 0,
      shiftNaturalEmt: { I: getVal('Breaks /100', node.startCol), II: getVal('Breaks /100', node.startCol+1), III: getVal('Breaks /100', node.startCol+2) },
      shiftRestartBreaks: { I: getVal('Restarting', node.startCol), II: getVal('Restarting', node.startCol+1), III: getVal('Restarting', node.startCol+2) },
      shiftDoffEmt: { I: getVal('EM', node.startCol), II: getVal('EM', node.startCol+1), III: getVal('EM', node.startCol+2) },
      shiftIdle: { I: getVal(['Idle', 'Idle%'], node.startCol), II: getVal(['Idle', 'Idle%'], node.startCol+1), III: getVal(['Idle', 'Idle%'], node.startCol+2) },
      shiftWorst: { I: getVal(['Rougu', 'Rogue', 'Rouge', 'Worst', 'Worst%'], node.startCol), II: getVal(['Rougu', 'Rogue', 'Rouge', 'Worst', 'Worst%'], node.startCol+1), III: getVal(['Rougu', 'Rogue', 'Rouge', 'Worst', 'Worst%'], node.startCol+2) },
      shiftSlip: { I: getVal(['Slip', 'Slip%'], node.startCol), II: getVal(['Slip', 'Slip%'], node.startCol+1), III: getVal(['Slip', 'Slip%'], node.startCol+2) },
      shiftUkg: { I: getVal('UKG', node.startCol), II: getVal('UKG', node.startCol+1), III: getVal('UKG', node.startCol+2) },
      shiftNoOfDoff: { I: getVal('No of Doff', node.startCol), II: getVal('No of Doff', node.startCol+1), III: getVal('No of Doff', node.startCol+2) },
      shiftAvgDoffTime: { I: getVal('Avg Doff Time', node.startCol), II: getVal('Avg Doff Time', node.startCol+1), III: getVal('Avg Doff Time', node.startCol+2) },
      shiftNoOfStop: { I: getVal('No of Stop', node.startCol), II: getVal('No of Stop', node.startCol+1), III: getVal('No of Stop', node.startCol+2) },
      shiftNormalStopMin: { I: getVal('Normal stop min', node.startCol), II: getVal('Normal stop min', node.startCol+1), III: getVal('Normal stop min', node.startCol+2) },
      shiftProductionKg: sProd,
      shiftUtilizationPinter: sUtil
    });

    ['I', 'II', 'III'].forEach((sh, idx) => {
      entries.push({
        shift: sh as Shift, frameNo: node.frame, count: nCount,
        productionTarget: 0,
        productionActual: idx === 0 ? sProd.I : idx === 1 ? sProd.II : sProd.III,
        gpsTarget: 0, gpsActual: 0, gps40sCon: 0, 
        efficiency: 0, 
        utility: idx === 0 ? sUtil.I : idx === 1 ? sUtil.II : sUtil.III,
        ue: 0,
        naturalEmt: getVal('Breaks /100', node.startCol + idx),
        doffEmt: getVal('EM', node.startCol + idx),
        idlePercent: getVal(['Idle', 'Idle%'], node.startCol + idx),
        worstPercent: getVal(['Rougu', 'Rogue', 'Rouge', 'Worst', 'Worst%'], node.startCol + idx),
        slipPercent: getVal(['Slip', 'Slip%'], node.startCol + idx),
        ukg: getVal('UKG', node.startCol + idx),
        restartBreaks: getVal('Restarting', node.startCol + idx)
      });
    });
  });

  return { date: reportDate, entries, summaries, totalProductionTarget: 0, totalProductionActual };
};

const handleIncentiveDaily = (grid: any[][]): DailyReport => {
  let reportDate = new Date().toLocaleDateString('en-GB');
  let headerRowIdx = -1;

  const findCol = (row: any[], targets: string[]) => {
    if (!row) return -1;
    return row.findIndex(c => {
      const s = String(c || '').toLowerCase();
      return targets.some(t => s.includes(t));
    });
  };

  // Find header row
  for (let r = 0; r < Math.min(grid.length, 20); r++) {
    if (!grid[r]) continue;
    const amountIdx = findCol(grid[r], ['incentive', 'incetive']); // Handle typo in user sheet
    if (amountIdx !== -1 && findCol(grid[r], ['name']) !== -1) {
      headerRowIdx = r;
      break;
    }
  }

  // Find date
  for (let r = 0; r < Math.min(grid.length, 15); r++) {
    const row = grid[r];
    if (!row) continue;
    const dateIdx = findCol(row, ['date']);
    if (dateIdx !== -1) {
      // Search the rest of the row for anything that looks like a date or a number
      const dateVal = row.find((c, i) => i >= dateIdx && (String(c || '').includes('/') || String(c || '').includes('-') || (typeof c === 'number' && c > 40000)));
      if (dateVal !== undefined && dateVal !== null && String(dateVal).trim() !== '') {
        const norm = normalizeDateValue(dateVal);
        if (norm) {
          reportDate = norm;
          break;
        }
      }
    }
  }

  if (headerRowIdx === -1) throw new Error('Could not find Incentive header row (tried "Incentive" and "Incetive")');

  const entries: ProductionEntry[] = [];
  const colMap = {
    tNo: findCol(grid[headerRowIdx], ['t.no', 'ticket', 'tno', 't. no', 't no', 'tk no', 't. no', 'tk.no']),
    name: findCol(grid[headerRowIdx], ['name', 'operator', 'sider', 'worker', 'employee', 'staff']),
    mcNo: findCol(grid[headerRowIdx], ['mc no', 'm/c', 'machine', 'mcno']),
    shift: findCol(grid[headerRowIdx], ['shift']),
    count: findCol(grid[headerRowIdx], ['count']),
    gpss: findCol(grid[headerRowIdx], ['gpss', 'gps']),
    amount: findCol(grid[headerRowIdx], ['incentive', 'incetive'])
  };

  let lastTNo = '';
  let lastName = '';

  for (let r = headerRowIdx + 1; r < grid.length; r++) {
    const row = grid[r];
    if (!row) continue;
    
    let tNoVal = String(row[colMap.tNo] !== undefined && colMap.tNo !== -1 ? row[colMap.tNo] : '').trim();
    let nameVal = String(row[colMap.name] !== undefined && colMap.name !== -1 ? row[colMap.name] : '').trim();
    
    // Check for totals to break
    if (nameVal.toLowerCase().includes('total') || tNoVal.toLowerCase().includes('total')) break;

    const shiftVal = String(colMap.shift !== -1 && row[colMap.shift] !== undefined ? row[colMap.shift] : '').trim();
    const amountVal = Number(colMap.amount !== -1 && row[colMap.amount] !== undefined ? row[colMap.amount] : 0);

    // If both are empty but we have a valid shift or amount, propagate from last worker (merged cells format)
    if (!tNoVal && !nameVal) {
      if (lastTNo && (shiftVal || amountVal)) {
        tNoVal = lastTNo;
        nameVal = lastName;
      } else {
        continue;
      }
    }

    // If we have a name but no T.No, propagate last T.No if name matches or matches last seen
    if (!tNoVal && nameVal) {
      if (lastName && (nameVal.toLowerCase() === lastName.toLowerCase() || nameVal.toLowerCase().includes(lastName.toLowerCase()) || lastName.toLowerCase().includes(nameVal.toLowerCase()))) {
        tNoVal = lastTNo;
      }
    }

    if (tNoVal) {
      lastTNo = tNoVal;
    }
    if (nameVal) {
      lastName = nameVal;
    }

    const frameNoRaw = String(row[colMap.mcNo] || '').toUpperCase();
    const frameNo = frameNoRaw.replace('RF', 'K').replace('MC', '').replace(/\s+/g, '').replace(/[^\w]/g, '');
    let normalizedFrame = frameNo;
    if (frameNo.length > 0 && !frameNo.startsWith('K')) {
       // If it's just a number, pad and prefix
       const digits = frameNo.match(/\d+/);
       if (digits) {
         normalizedFrame = `K${digits[0].padStart(2, '0')}`;
       }
    }

    entries.push({
      shift: (String(row[colMap.shift]) === '2' || String(row[colMap.shift]) === 'II' ? 'II' : String(row[colMap.shift]) === '3' || String(row[colMap.shift]) === 'III' ? 'III' : 'I') as Shift,
      frameNo: normalizedFrame,
      count: String(row[colMap.count] || ''),
      productionTarget: 0,
      productionActual: 0,
      gpsTarget: 0,
      gpsActual: Number(row[colMap.gpss]) || 0,
      gps40sCon: 0,
      efficiency: 0,
      utility: 0,
      ue: 0,
      naturalEmt: 0,
      doffEmt: 0,
      idlePercent: 0,
      worstPercent: 0,
      slipPercent: 0,
      ukg: 0,
      restartBreaks: 0,
      incentiveAmount: Number(row[colMap.amount]) || 0,
      siderName: nameVal,
      siderId: tNoVal // Use the resolved T.No as the ID
    });
  }

  return { date: reportDate, entries, summaries: [], totalProductionTarget: 0, totalProductionActual: 0 };
};

const handleMonthlyIncentive = (grid: any[][]): DailyReport[] => {
  let month = new Date().getMonth() + 1;
  let year = new Date().getFullYear();
  let headerRowIdx = -1;

  const findCol = (row: any[], targets: string[]) => {
    if (!row) return -1;
    return row.findIndex(c => {
      const s = String(c || '').toLowerCase();
      return targets.some(t => s.includes(t));
    });
  };

  // Find header row (1, 2, 3 ... 31)
  for (let r = 0; r < Math.min(grid.length, 20); r++) {
    const row = grid[r];
    if (!row) continue;
    const hasTk = findCol(row, ['tk no', 't.no', 'ticket', 't. no', 't no']) !== -1;
    const hasDays = row.some(c => String(c) === '1') && row.some(c => String(c) === '2');
    if (hasTk && hasDays) {
      headerRowIdx = r;
      break;
    }
  }

  // Find month/year from title
  for (let r = 0; r < Math.min(grid.length, 10); r++) {
    const row = grid[r];
    if (!row) continue;
    const title = row.find(c => String(c || '').toLowerCase().includes('report for the month of'));
    if (title) {
      const parts = String(title).split(/\s+/);
      const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
      const mIdx = monthNames.findIndex(m => String(title).toLowerCase().includes(m));
      if (mIdx !== -1) month = mIdx + 1;
      const yMatch = String(title).match(/\d{4}/);
      if (yMatch) year = parseInt(yMatch[0]);
    }
  }

  if (headerRowIdx === -1) throw new Error('Could not find Monthly Incentive header');

  const colMap = {
    tNo: findCol(grid[headerRowIdx], ['tk no', 't.no', 'ticket', 't. no', 't no', 'tk.no', 'tkno', 'tk no']),
    name: findCol(grid[headerRowIdx], ['name', 'operator', 'sider', 'worker', 'employee', 'staff']),
  };

  const dayCols: { [day: number]: number } = {};
  for (let c = 0; c < grid[headerRowIdx].length; c++) {
    const val = parseInt(grid[headerRowIdx][c]);
    if (!isNaN(val) && val >= 1 && val <= 31) {
      dayCols[val] = c;
    }
  }

  const reportsByDate: { [date: string]: DailyReport } = {};

  for (let r = headerRowIdx + 1; r < grid.length; r++) {
    const row = grid[r];
    if (!row) continue;
    
    const tNo = String(row[colMap.tNo] !== undefined && colMap.tNo !== -1 ? row[colMap.tNo] : '').trim();
    const name = String(row[colMap.name] !== undefined && colMap.name !== -1 ? row[colMap.name] : '').trim();
    
    if (!tNo && !name) continue;
    if (name.toLowerCase().includes('total') || tNo.toLowerCase().includes('total')) break;

    Object.keys(dayCols).forEach(dayStr => {
      const day = parseInt(dayStr);
      const amount = Number(row[dayCols[day]]) || 0;
      if (amount > 0) {
        const dateStr = `${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}/${year}`;
        if (!reportsByDate[dateStr]) {
          reportsByDate[dateStr] = {
            date: dateStr,
            entries: [],
            summaries: [],
            totalProductionTarget: 0,
            totalProductionActual: 0
          };
        }
        reportsByDate[dateStr].entries.push({
          shift: 'I', // Implicitly I as it's a daily sum usually, but we don't know the shift
          frameNo: 'K00',
          count: '',
          productionTarget: 0,
          productionActual: 0,
          gpsTarget: 0,
          gpsActual: 0,
          gps40sCon: 0,
          efficiency: 0,
          utility: 0,
          ue: 0,
          naturalEmt: 0,
          doffEmt: 0,
          idlePercent: 0,
          worstPercent: 0,
          slipPercent: 0,
          ukg: 0,
          restartBreaks: 0,
          incentiveAmount: amount,
          siderName: name,
          siderId: tNo
        });
      }
    });
  }

  return Object.values(reportsByDate).sort((a,b) => {
    return parseUniversalDate(a.date).getTime() - parseUniversalDate(b.date).getTime();
  });
};
