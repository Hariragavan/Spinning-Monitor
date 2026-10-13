import * as XLSX from 'xlsx';
import { DailyReport, ProductionEntry, FrameDailySummary, Shift, Sider, CountConversion } from '../types';
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

export const getShedMachines = (shed?: string): string[] => {
  if (shed === 'Shed 2') return ['K07', 'K08', 'K09', 'K10', 'K11', 'K12'];
  if (shed === 'Shed 3') return ['K13', 'K14', 'K15', 'K16', 'K17', 'K18'];
  if (shed === 'KTTM') return ['KT01', 'KT02', 'KT03', 'KT04', 'KT05', 'KT06'];
  return ['K01', 'K02', 'K03', 'K04', 'K05', 'K06'];
};

export const ensureSixMachines = (report: DailyReport, targetShed?: string): DailyReport => {
  const shed = targetShed || report.shed || 'Shed 1';
  const defaultMachines = getShedMachines(shed);
  const existingFrames = Array.from(new Set(report.entries.map(e => e.frameNo))).filter(Boolean);
  const machines = existingFrames.length >= 6 ? existingFrames : defaultMachines;

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
    aiCones: report.aiCones || { I: [], II: [], III: [] }
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
  return ensureSixMachines({
    date,
    shed,
    entries: [],
    summaries: [],
    gaiters: { I: [], II: [], III: [] },
    totalProductionTarget: 0,
    totalProductionActual: 0,
    timestamp: Date.now()
  }, shed);
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
        
        let report: DailyReport | null = null;
        const errors: string[] = [];

        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          const grid = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
          if (!grid || grid.length === 0) continue;

          const hasText = (text: string) => grid.some(row => 
            row && row.some(cell => String(cell || '').toLowerCase().includes(text.toLowerCase()))
          );

          const isProduction = hasText('Production Statement') || (hasText('Rf no') && hasText('Target Prod'));
          const isBreakage = hasText('Breakage Report') || hasText('Breaakge Report') || hasText('Machine Performance') || hasText('KTTM') || (hasText('Rf no') && hasText('Breaks'));
          const isIncentive = hasText('Daily Incentive Amount') || hasText('Incentive Amount');
          const isMonthlyIncentive = hasText('Sider Incetnive Report for the Month Of') || hasText('Sider Incentive Report');

          try {
            if (isProduction) {
              report = handleProduction(grid, countConversions);
              if (report) break;
            } else if (isBreakage) {
              report = handleBreakage(grid);
              if (report) break;
            } else if (isMonthlyIncentive) {
              const multiReports = handleMonthlyIncentive(grid);
              if (multiReports && multiReports.length > 0) {
                resolve(multiReports.map(r => ensureSixMachines(r, targetShed)));
                return;
              }
            } else if (isIncentive) {
              report = handleIncentiveDaily(grid);
              if (report) break;
            }
          } catch (err) {
            errors.push(`${sheetName}: ${err instanceof Error ? err.message : String(err)}`);
            continue;
          }
        }

        if (report) {
          resolve(ensureSixMachines(report, targetShed));
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

const handleProduction = (grid: any[][], countConversions: CountConversion[]): DailyReport => {
  let reportDate = new Date().toLocaleDateString('en-GB');
  let headerRowIdx = -1;
  let labelCol = -1;

  for (let r = 0; r < Math.min(grid.length, 15); r++) {
    if (!grid[r]) continue;
    const idx = grid[r].findIndex(c => String(c || '').toLowerCase().includes('rf no'));
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
      // Look for the date in the next few cells
      for (let offset = 1; offset < 5; offset++) {
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
    totalAch: labelCol + 7, // Col H
    gpsI: labelCol + 8, 
    gpsII: labelCol + 9, 
    gpsIII: labelCol + 10, 
    gpsTotal: labelCol + 11,
    uI: labelCol + 12, 
    uII: labelCol + 13, 
    uIII: labelCol + 14, 
    uTotal: labelCol + 15
  };

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
  const loopEnd = runningCountRow !== -1 ? runningCountRow : grid.length;

  for (let r = headerRowIdx + 1; r < loopEnd; r++) {
    const row = grid[r];
    if (!row) continue;
    const frameNoRaw = String(row[colMap.frame] || '').trim();
    if (!frameNoRaw || frameNoRaw.toLowerCase().includes('rf no') || frameNoRaw.toLowerCase().includes('grand') || frameNoRaw.toLowerCase().includes('running')) continue;
    if (frameNoRaw.toLowerCase() === 'total' || frameNoRaw.toLowerCase().includes('date')) break;

    // Normalize machine name: RF-01 -> K01, RF 01 -> K01
    const frameNo = frameNoRaw.toUpperCase()
      .replace('RF-', 'K')
      .replace('RF', 'K')
      .replace(/\s+/g, '')
      .replace('NO', '');

    const count = String(row[colMap.count] || '').trim();
    const stdGps = Number(row[colMap.stdGps]) || 0;
    const targetProd = Number(row[colMap.targetProd]) || 0;
    const actualProd = Number(row[colMap.totalAch]) || 0;

    const sGps = { I: Number(row[colMap.gpsI])||0, II: Number(row[colMap.gpsII])||0, III: Number(row[colMap.gpsIII])||0 };
    const sUtil = { I: Number(row[colMap.uI])||0, II: Number(row[colMap.uII])||0, III: Number(row[colMap.uIII])||0 };
    
    const sProd = {
      I: Number(row[labelCol + 4]) || 0,
      II: Number(row[labelCol + 5]) || 0,
      III: Number(row[labelCol + 6]) || 0
    };

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
      shiftUtilizationPinter: {I:0,II:0,III:0}
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
        slipPercent: 0, ukg: 0, restartBreaks: 0
      });
    });
  }

  return { date: reportDate, entries, summaries, totalProductionTarget: totalTarget, totalProductionActual: totalAchieved };
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
    return (norm.includes('RF') || norm.startsWith('K')) && /\d+/.test(norm) && !norm.includes('TOTAL') && !norm.includes('SHIFT') && !norm.includes('STD');
  };

  // Machine names start after STD column (Col B=Rf no, Col C=STD, Col D=K01)
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
        .replace('RF-', 'K')
        .replace('RF', 'K')
        .replace('NO', '')
        .replace(/\s+/g, '');
        
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
