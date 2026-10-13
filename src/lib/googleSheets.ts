import * as XLSX from 'xlsx';
import { Sider, IncentiveRule, MachineEmData } from '../types';

export function parseMachineEmWorkbook(workbook: XLSX.WorkBook): MachineEmData {
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
  
  const result: MachineEmData = {};
  
  if (rows.length < 3) return result;
  
  const row0 = rows[0] || [];
  const row1 = rows[1] || [];
  const row2 = rows[2] || [];
  
  // Dynamic date format detector: detect MM/DD vs DD/MM based on row0 cells
  let detectedFormat: 'DD/MM' | 'MM/DD' = 'DD/MM';
  const firstParts: number[] = [];
  const secondParts: number[] = [];
  
  for (const cellVal of row0) {
    if (cellVal !== undefined && cellVal !== null && cellVal !== '') {
      let cellStr = '';
      if (cellVal instanceof Date || (typeof cellVal === 'object' && cellVal !== null && typeof (cellVal as any).getMonth === 'function')) {
        const d = cellVal as Date;
        // Use local getters since Excel/SheetJS date objects represent local time of the parsed cell
        cellStr = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
      } else if (typeof cellVal === 'number') {
        const d = new Date(Math.round((cellVal - 25569) * 86400 * 1000));
        cellStr = `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`;
      } else {
        cellStr = String(cellVal);
      }

      const cleaned = cellStr.replace(/date\s*[:\s]*/i, '').trim();
      const divider = cleaned.includes('-') ? '-' : cleaned.includes('/') ? '/' : cleaned.includes('.') ? '.' : null;
      if (divider) {
        const parts = cleaned.split(divider);
        if (parts.length >= 2) {
          const part0 = parseInt(parts[0], 10);
          const part1 = parseInt(parts[1], 10);
          if (!isNaN(part0) && !isNaN(part1)) {
            if (part0 > 12) {
              detectedFormat = 'DD/MM';
              break;
            } else if (part1 > 12) {
              detectedFormat = 'MM/DD';
              break;
            }
            firstParts.push(part0);
            secondParts.push(part1);
          }
        }
      }
    }
  }

  // If we couldn't decide by >12, look at variance across the columns
  if (firstParts.length > 1 && detectedFormat === 'DD/MM') {
    const uniqueFirsts = new Set(firstParts);
    const uniqueSeconds = new Set(secondParts);
    if (uniqueFirsts.size === 1 && uniqueSeconds.size > 1) {
      detectedFormat = 'MM/DD'; // First part is constant month, second part is varying day
    } else if (uniqueSeconds.size === 1 && uniqueFirsts.size > 1) {
      detectedFormat = 'DD/MM'; // Second part is constant month, first part is varying day
    }
  }
  
  const colDates: (string | null)[] = [];
  let lastDateStr: string | null = null;
  
  function normalizeDateString(str: string): string {
    const trimmed = str.replace(/date\s*[:\s]*/i, '').trim();
    const divider = trimmed.includes('-') ? '-' : trimmed.includes('/') ? '/' : trimmed.includes('.') ? '.' : null;
    if (divider) {
      const parts = trimmed.split(divider);
      if (parts.length === 3) {
        let day = '';
        let month = '';
        let year = parts[2];
        
        if (parts[0].length === 4) {
          year = parts[0];
          month = parts[1];
          day = parts[2];
        } else {
          if (detectedFormat === 'MM/DD') {
            month = parts[0];
            day = parts[1];
          } else {
            day = parts[0];
            month = parts[1];
          }
        }
        
        if (year.length === 2) {
          year = '20' + year;
        }
        return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
      } else if (parts.length === 2) {
        let day = '';
        let month = '';
        if (detectedFormat === 'MM/DD') {
          month = parts[0];
          day = parts[1];
        } else {
          day = parts[0];
          month = parts[1];
        }
        return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/2026`;
      }
    }
    return trimmed;
  }
  
  for (let colIdx = 0; colIdx < Math.max(row0.length, row1.length, row2.length); colIdx++) {
    const cellVal0 = row0[colIdx];
    if (cellVal0 !== undefined && cellVal0 !== null && cellVal0 !== '') {
      if (cellVal0 instanceof Date || (typeof cellVal0 === 'object' && cellVal0 !== null && typeof (cellVal0 as any).getMonth === 'function')) {
        const d = cellVal0 as Date;
        // Use local getters to avoid timezone offset date shifts
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        lastDateStr = `${dd}/${mm}/${yyyy}`;
      } else if (typeof cellVal0 === 'number') {
        const d = new Date(Math.round((cellVal0 - 25569) * 86400 * 1000));
        const dd = String(d.getUTCDate()).padStart(2, '0');
        const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
        const yyyy = d.getUTCFullYear();
        lastDateStr = `${dd}/${mm}/${yyyy}`;
      } else {
        lastDateStr = normalizeDateString(String(cellVal0).trim());
      }
    }
    colDates[colIdx] = lastDateStr;
  }
  
  for (let rIdx = 3; rIdx < rows.length; rIdx++) {
    const row = rows[rIdx];
    if (!row || row.length === 0) continue;
    
    const rawMachineLabel = String(row[0] || '').trim();
    if (!rawMachineLabel) continue;
    if (rawMachineLabel.toLowerCase().includes('grand total') || rawMachineLabel.toLowerCase().includes('total')) {
      continue;
    }
    
    let machineName = rawMachineLabel;
    const match = rawMachineLabel.match(/(?:RF|K|RF-)\s*0?([1-6])/i);
    if (match) {
      machineName = `K0${match[1]}`;
    }
    
    for (let colIdx = 1; colIdx < colDates.length; colIdx++) {
      const dateStr = colDates[colIdx];
      if (!dateStr) continue;
      
      let shiftNum = String(row1[colIdx] || row2[colIdx] || '').trim();
      if (shiftNum.includes('.')) {
        shiftNum = shiftNum.split('.')[0];
      }
      if (shiftNum !== '1' && shiftNum !== '2' && shiftNum !== '3') {
        shiftNum = String(((colIdx - 1) % 3) + 1);
      }
      
      const cellVal = row[colIdx];
      if (cellVal === undefined || cellVal === null || String(cellVal).trim() === '') {
        continue;
      }
      
      const emVal = parseFloat(String(cellVal));
      if (isNaN(emVal)) continue;
      
      if (!result[dateStr]) result[dateStr] = {};
      if (!result[dateStr][machineName]) result[dateStr][machineName] = {};
      result[dateStr][machineName][shiftNum] = emVal;
    }
  }
  
  return result;
}

export async function syncMachineEmFromGoogleSheet(url: string): Promise<MachineEmData> {
  // Extract ID from URL
  const idMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (!idMatch) throw new Error('Invalid Google Sheets URL');
  const id = idMatch[1];
  
  const exportUrl = `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`;
  const response = await fetch(exportUrl);
  if (!response.ok) throw new Error('Failed to fetch spreadsheet. Make sure it is shared with "Anyone with the link".');
  
  const arrayBuffer = await response.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer);
  
  return parseMachineEmWorkbook(workbook);
}

export async function syncFromGoogleSheet(url: string): Promise<{ workers: Sider[], rules: IncentiveRule[] }> {
  try {
    // Extract ID from URL
    const idMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (!idMatch) throw new Error('Invalid Google Sheets URL');
    const id = idMatch[1];
    
    // Attempt to download as XLSX
    const exportUrl = `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`;
    const response = await fetch(exportUrl);
    if (!response.ok) throw new Error('Failed to fetch Spreadsheet. Make sure it is shared with "Anyone with the link".');
    
    const arrayBuffer = await response.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer);
    
    let workers: Sider[] = [];
    let rules: IncentiveRule[] = [];

    // Parse Workers (Expect a sheet named 'Workers' or the first sheet)
    const workerSheetName = workbook.SheetNames.find(n => n.toLowerCase().includes('worker')) || workbook.SheetNames[0];
    const workerData = XLSX.utils.sheet_to_json(workbook.Sheets[workerSheetName]) as any[];
    
    workers = workerData.map((row, index) => ({
      id: String(row['Ticket No'] || row['tNo'] || row['ID'] || index),
      name: String(row['Name'] || row['Worker Name'] || 'Unknown'),
      tNo: String(row['Ticket No'] || row['tNo'] || row['ID'] || index),
      photoUrl: row['Photo URL'] || row['Photo'] || undefined
    })).filter(w => w.name !== 'Unknown');

    // Parse Rules (Expect a sheet named 'Incentive' or 'Rules' or 'Master')
    const ruleSheetName = workbook.SheetNames.find(n => 
      n.toLowerCase().includes('incentive') || 
      n.toLowerCase().includes('rule') || 
      n.toLowerCase().includes('master')
    );

    if (ruleSheetName) {
      const ruleData = XLSX.utils.sheet_to_json(workbook.Sheets[ruleSheetName]) as any[];
      // Group by count
      const ruleGroups: Record<string, { gpsThreshold: number, amount: number }[]> = {};
      
      ruleData.forEach(row => {
        const count = String(row['Count'] || row['count'] || '');
        if (!count) return;
        
        if (!ruleGroups[count]) ruleGroups[count] = [];
        
        const gpsThreshold = Number(row['GPS Threshold'] || row['GPS'] || row['Threshold'] || 0);
        const amount = Number(row['Amount'] || row['Payout'] || row['Incentive'] || 0);
        
        if (gpsThreshold > 0) {
          ruleGroups[count].push({ gpsThreshold, amount });
        }
      });

      rules = Object.entries(ruleGroups).map(([count, payouts]) => ({
        count,
        payouts: payouts.sort((a, b) => a.gpsThreshold - b.gpsThreshold)
      }));
    }

    return { workers, rules };
  } catch (error) {
    console.error('Sync Error:', error);
    throw error;
  }
}
