'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Activity, Trophy, AlertTriangle, Play, Pause, ChevronLeft, 
  ChevronRight, Clock, User, CheckCircle2, Sparkles, Flame
} from 'lucide-react';
import { DailyReport, MachineMasterItem, Sider, SystemSettings, Shed, IncentiveRule } from '@/types';
import { Employee, EmployeeMetric, MachineMapping, DeviceHealth } from '@/types/iot';
import { iotApi } from '@/lib/iot/iotApi';
import { cn, calculateIncentive, getActiveRule, parseUniversalDateParts, resolveEffectiveMappingForDate, resolveMappedDevice, normalizeShed } from '@/lib/utils';

export interface IotTvPerformanceProps {
  report?: DailyReport;
  machines?: MachineMasterItem[];
  workers?: Sider[];
  rules?: IncentiveRule[];
  settings?: SystemSettings;
  selectedShed?: Shed;
  onSelectDate?: (date: string) => void;
  history?: DailyReport[];
}

export interface DeviceOperatorItem {
  deviceId: string;
  side: 'LH' | 'RH' | string;
  position?: number;
  operatorName: string;
  operatorToken: string;
  operatorPhoto?: string;
  isAssigned: boolean;
  tapsCount: number;
}

export interface AssignedMachineSlide {
  id: string;
  frameNo: string;
  iotMachineName: string;
  yarnCount: string;
  rpm: number;
  productionKg: number;
  gpsActual: number;
  maxIncentive: number;
  earnedIncentive: number;
  incentiveAmount: number;
  machineLiveStatus: 'RUNNING' | 'DOFFING' | 'STOPPED';
  rfMachineNo: string;
  
  // Operator details (Auto-selected from Live Shift API & Employee Master)
  operatorName: string;
  operatorToken: string;
  operatorPhoto?: string;
  hasDualOperators: boolean;
  d1OperatorName?: string;
  d1OperatorToken?: string;
  d1OperatorPhoto?: string;
  d2OperatorName?: string;
  d2OperatorToken?: string;
  d2OperatorPhoto?: string;

  // Rounds & Taps matching user's sketch
  completedRounds: number;
  expectedRounds: number;
  totalTaps: number;
  targetTaps: number;
  d1Taps: number;
  d2Taps: number;
  d1TargetTaps: number;
  d2TargetTaps: number;
  d1DeviceId: string;
  d2DeviceId: string;

  // Giant Performance score based on completed rounds
  performanceScore: number;

  // End Mending Quality (EM)
  emLeft: number;
  emRight: number;
  emAvg: number;

  // Active Wind Time & Last Tap Time
  activityWindow: string;
  liveShiftNum: number;
  liveShiftName: string;
  lastTapTime?: string;

  isBestPerformer: boolean;
}

// 👏 Celebratory Clap Animation Component for Best Performers (Hands Only)
const ClapCelebration: React.FC = () => {
  const clapHands = [
    { left: '10%', delay: 0.1, scale: 1.3 },
    { left: '22%', delay: 0.4, scale: 1.6 },
    { left: '38%', delay: 0.2, scale: 1.4 },
    { left: '55%', delay: 0.5, scale: 1.7 },
    { left: '72%', delay: 0.3, scale: 1.5 },
    { left: '86%', delay: 0.6, scale: 1.3 },
  ];

  return (
    <div className="absolute inset-0 pointer-events-none z-30 overflow-hidden">
      {/* Floating Animated Clapping Hands */}
      {clapHands.map((item, i) => (
        <motion.div
          key={i}
          initial={{ y: 220, opacity: 0, scale: 0.6, rotate: -20 }}
          animate={{ 
            y: [-30, -140, -250],
            opacity: [0, 1, 0],
            scale: [item.scale * 0.8, item.scale, item.scale * 1.15],
            rotate: [i % 2 === 0 ? -25 : 25, i % 2 === 0 ? 20 : -20, 0]
          }}
          transition={{
            duration: 2.6,
            delay: item.delay,
            repeat: Infinity,
            repeatDelay: 0.8,
            ease: 'easeOut'
          }}
          className="absolute bottom-12 select-none text-5xl sm:text-7xl drop-shadow-xl"
          style={{ left: item.left }}
        >
          👏
        </motion.div>
      ))}
    </div>
  );
};

export const IotTvPerformance: React.FC<IotTvPerformanceProps> = ({
  report,
  machines = [],
  workers = [],
  rules = [],
  settings,
  selectedShed = 'Shed 1',
  onSelectDate,
  history = []
}) => {
  const [slides, setSlides] = useState<AssignedMachineSlide[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [timeRemaining, setTimeRemaining] = useState(15);
  const SLIDE_DURATION = 15; // seconds per assigned machine slide

  // Helper to convert any universal/canonical date string to ISO (YYYY-MM-DD)
  const toIsoDate = useCallback((dStr?: string): string => {
    if (!dStr) return '';
    const parts = parseUniversalDateParts(dStr);
    if (!parts) return dStr.slice(0, 10);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
  }, []);

  // Helper to convert any universal/ISO date string to Canonical (DD/MM/YYYY)
  const toCanonicalDate = useCallback((dStr?: string): string => {
    if (!dStr) return '';
    const parts = parseUniversalDateParts(dStr);
    if (!parts) return dStr;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(parts.day)}/${pad(parts.month)}/${parts.year}`;
  }, []);

  // Determine Current Live Date and Shift (IST: Shift 1 = 06-14, Shift 2 = 14-22, Shift 3 = 22-06)
  const getLiveShiftInfo = useCallback(() => {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const totalMins = hours * 60 + minutes;

    let shiftNum = 1;
    let windowLabel = '06:00 AM – 02:00 PM';
    if (totalMins >= 360 && totalMins < 840) {
      shiftNum = 1;
      windowLabel = '06:00 AM – 02:00 PM';
    } else if (totalMins >= 840 && totalMins < 1320) {
      shiftNum = 2;
      windowLabel = '02:00 PM – 10:00 PM';
    } else {
      shiftNum = 3;
      windowLabel = '10:00 PM – 06:00 AM';
    }

    const shiftDateObj = new Date(now);
    if (totalMins < 360) {
      shiftDateObj.setDate(shiftDateObj.getDate() - 1);
    }
    const pad = (n: number) => String(n).padStart(2, '0');
    const dateIso = `${shiftDateObj.getFullYear()}-${pad(shiftDateObj.getMonth() + 1)}-${pad(shiftDateObj.getDate())}`;
    const dateCanonical = `${pad(shiftDateObj.getDate())}/${pad(shiftDateObj.getMonth() + 1)}/${shiftDateObj.getFullYear()}`;

    return { shiftNum, windowLabel, dateIso, dateCanonical };
  }, []);

  // Default is LIVE ON when the page is opened
  const [isLive, setIsLive] = useState<boolean>(true);
  const [selectedShift, setSelectedShift] = useState<number>(() => getLiveShiftInfo().shiftNum);
  const [selectedDateIso, setSelectedDateIso] = useState<string>(() => getLiveShiftInfo().dateIso);

  const prevReportDateRef = useRef<string | undefined>(report?.date);

  // Sync date changes from the top navbar date picker
  useEffect(() => {
    if (!report?.date) return;
    if (prevReportDateRef.current === report.date) return;
    prevReportDateRef.current = report.date;

    const reportIso = toIsoDate(report.date);
    const live = getLiveShiftInfo();

    if (reportIso && reportIso !== live.dateIso) {
      // User picked a specific historical date at the top -> turn off Live!
      setIsLive(false);
      setSelectedDateIso(reportIso);
    } else if (reportIso === live.dateIso) {
      setSelectedDateIso(reportIso);
    }
  }, [report?.date, getLiveShiftInfo, toIsoDate]);

  const handleToggleLive = () => {
    if (!isLive) {
      const live = getLiveShiftInfo();
      setIsLive(true);
      setSelectedDateIso(live.dateIso);
      setSelectedShift(live.shiftNum);
      if (onSelectDate) {
        onSelectDate(live.dateCanonical);
      }
    } else {
      setIsLive(false);
    }
  };

  const handleSelectShift = (sNum: number) => {
    setIsLive(false);
    setSelectedShift(sNum);
  };

  // Load telemetry and build per-machine assigned slides
  const loadSlideData = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    try {
      const liveInfo = getLiveShiftInfo();
      const primaryTargetDate = isLive ? liveInfo.dateIso : (selectedDateIso || liveInfo.dateIso);
      const targetShiftNum = isLive ? liveInfo.shiftNum : (selectedShift || liveInfo.shiftNum);
      const targetShiftName = `Shift ${targetShiftNum}`;
      const targetWindowLabel = targetShiftNum === 1
        ? '06:00 AM – 02:00 PM'
        : targetShiftNum === 2
        ? '02:00 PM – 10:00 PM'
        : '10:00 PM – 06:00 AM';

      // Employee metrics for target date & shift strictly via same-origin server API (merges MongoDB RFID mapped names)
      const fetchRailwayEmployeeData = async (dStr: string, sName?: string) => {
        try {
          let localUrl = `/api/iot/dashboard/employee?date=${encodeURIComponent(dStr)}&_t=${Date.now()}`;
          if (sName) localUrl += `&shiftName=${encodeURIComponent(sName)}`;
          const localRes = await fetch(localUrl, { cache: 'no-store' });
          if (localRes.ok) {
            const localJson = await localRes.json();
            if (Array.isArray(localJson?.data) && localJson.data.length > 0) {
              return localJson.data;
            }
          }
        } catch (_) {}
        if (sName) {
          try {
            const url2 = `/api/iot/dashboard/employee?date=${encodeURIComponent(dStr)}&_t=${Date.now()}`;
            const res2 = await fetch(url2, { cache: 'no-store' });
            if (res2.ok) {
              const json2 = await res2.json();
              if (Array.isArray(json2?.data) && json2.data.length > 0) {
                return json2.data;
              }
            }
          } catch (_) {}
        }
        return [];
      };

      // 2. Fetch live IoT devices, mappings, fresh settings, and live/historical machine telemetry
      const [lightStatus, liveOverview, devices, iotEmployees, rfidRes, deviceMappings, freshSettingsRes] = await Promise.all([
        isLive ? iotApi.getLightweightMachineStatus().catch(() => null) : Promise.resolve(null),
        iotApi.getSpinfoOverview({ shift: String(targetShiftNum), fromDate: primaryTargetDate }).catch(() => null),
        iotApi.getDevices().catch(() => [] as DeviceHealth[]),
        iotApi.getEmployees().catch(() => [] as Employee[]),
        fetch(`/api/iot/employees?_t=${Date.now()}`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null),
        iotApi.getMachineMappings().catch(() => [] as MachineMapping[]),
        fetch(`/api/settings?_t=${Date.now()}`, { cache: 'no-store' }).then(r => r.json()).catch(() => null)
      ]);

      // Build authoritative RFID Card ID -> Mapped Operator lookup across both registeredMappings & iotEmployees
      const rfidMappedEmpMap = new Map<string, { employeeName: string; tNo?: string | null; workerId?: string | null }>();
      for (const e of (iotEmployees || [])) {
        if (e?.employeeId && e?.employeeName && e.employeeName !== e.employeeId) {
          rfidMappedEmpMap.set(String(e.employeeId).trim(), { employeeName: e.employeeName });
        }
      }
      for (const r of (rfidRes?.registeredMappings || [])) {
        if (r?.employeeId && r?.employeeName) {
          rfidMappedEmpMap.set(String(r.employeeId).trim(), {
            employeeName: r.employeeName,
            tNo: r.tNo,
            workerId: r.workerId
          });
        }
      }

      const effectiveSettings: SystemSettings = (freshSettingsRes && freshSettingsRes.data)
        ? freshSettingsRes.data
        : (settings || ({} as SystemSettings));

      // Resolve effective date-range machine mapping from Settings for target date
      const effectiveDateMap = resolveEffectiveMappingForDate(
        primaryTargetDate,
        effectiveSettings?.iotMachineAllocationPeriods || [],
        effectiveSettings?.iotMachineMappingByDate || {},
        effectiveSettings?.iotMachineMapping || {}
      );

      // Fetch employee performance for target date & shift
      const employeeMetrics: EmployeeMetric[] = await fetchRailwayEmployeeData(primaryTargetDate, targetShiftName);

      const lightMachines = lightStatus?.machines || [];
      const liveMachines = liveOverview?.machines || [];

      // Locate historical report for primaryTargetDate
      const targetReport = (history || []).find(r => {
        if (!r || !r.date) return false;
        const rIso = toIsoDate(r.date);
        return rIso === primaryTargetDate && (!r.shed || normalizeShed(r.shed) === normalizeShed(selectedShed || 'Shed 1'));
      }) || report;

      // 1. Physical Frame -> IoT Machine Unit (strictly from Tab 5 Configuration, e.g. SP044 -> M1)
      const frameToIotMap: Record<string, string> = {
        ...(effectiveSettings?.frameToIotProfileMapping || {})
      };

      if (effectiveSettings?.iotProfileToFrameMapping) {
        Object.entries(effectiveSettings.iotProfileToFrameMapping).forEach(([k, v]) => {
          if (k && v) {
            const cleanK = k.trim().toUpperCase();
            const cleanV = String(v).trim().toUpperCase();
            if (cleanK.startsWith('SP') || cleanK.startsWith('K')) frameToIotMap[cleanK] = cleanV;
            else if (cleanV.startsWith('SP') || cleanV.startsWith('K')) frameToIotMap[cleanV] = cleanK;
          }
        });
      }

      // Check persistent localStorage for Tab 5 assignments
      let savedPairsFromStorage: any[] = [];
      if (typeof window !== 'undefined') {
        try {
          const savedProfile = localStorage.getItem('frameToIotProfileMapping') || localStorage.getItem('iotProfileToFrameMapping');
          if (savedProfile) {
            const parsed = JSON.parse(savedProfile);
            if (parsed && typeof parsed === 'object') {
              Object.entries(parsed).forEach(([k, v]: [string, any]) => {
                if (k && v) {
                  const cleanK = k.trim().toUpperCase();
                  const cleanV = String(v).trim().toUpperCase();
                  if (cleanK.startsWith('SP') || cleanK.startsWith('K')) frameToIotMap[cleanK] = cleanV;
                  else if (cleanV.startsWith('SP') || cleanV.startsWith('K')) frameToIotMap[cleanV] = cleanK;
                }
              });
            }
          }
          const savedProd = localStorage.getItem('productionMappings') || localStorage.getItem('production_mappings');
          if (savedProd) {
            const parsed = JSON.parse(savedProd);
            if (parsed && typeof parsed === 'object') {
              Object.entries(parsed).forEach(([k, v]: [string, any]) => {
                if (k && v) {
                  const cleanK = k.trim().toUpperCase();
                  const cleanV = String(v).trim().toUpperCase();
                  if (cleanK.startsWith('SP') || cleanK.startsWith('K')) frameToIotMap[cleanK] = cleanV;
                  else if (cleanV.startsWith('SP') || cleanV.startsWith('K')) frameToIotMap[cleanV] = cleanK;
                }
              });
            }
          }
          const savedPairs = localStorage.getItem('iotMachinePairs');
          if (savedPairs) {
            const parsed = JSON.parse(savedPairs);
            if (Array.isArray(parsed)) {
              savedPairsFromStorage = parsed;
            }
          }
        } catch (_) {}
      }

      // Combine all machine pairs from settings and localStorage
      const allMachinePairs = [
        ...(Array.isArray(effectiveSettings?.machinePairs) ? effectiveSettings.machinePairs : []),
        ...savedPairsFromStorage
      ];

      // Helper to match worker details (photo, token) from Employee Master
      const resolveWorkerMaster = (empIdOrName: string) => {
        if (!empIdOrName) return null;
        const clean = empIdOrName.trim().toLowerCase();
        return workers.find(w => 
          (w.tNo && w.tNo.trim().toLowerCase() === clean) ||
          (w.id && w.id.trim().toLowerCase() === clean) ||
          (w.name && w.name.trim().toLowerCase() === clean)
        ) || null;
      };

      const builtSlides: AssignedMachineSlide[] = [];

      // ONLY SHOW MACHINES THAT ARE EXPLICITLY ASSIGNED IN CONFIGURATION (Tab 5)
      const candidateFrames = new Set<string>();
      Object.entries(frameToIotMap).forEach(([k, v]) => {
        const cleanK = (k || '').trim().toUpperCase();
        const cleanV = (v || '').trim().toUpperCase();
        if (cleanK && cleanK !== 'NONE' && cleanK !== 'UNASSIGNED') {
          if (cleanK.startsWith('SP') || cleanK.startsWith('K') || cleanK.startsWith('RF')) {
            candidateFrames.add(cleanK);
          } else if (cleanV.startsWith('SP') || cleanV.startsWith('K') || cleanV.startsWith('RF')) {
            candidateFrames.add(cleanV);
          }
        }
      });

      candidateFrames.forEach(frameNo => {
        // 1. Resolve IoT Machine Unit (holds RFID devices, card taps, and completed rounds)
        let iotName = (frameToIotMap[frameNo] || frameNo).trim().toUpperCase();
        if (iotName === frameNo) {
          const rev = Object.entries(frameToIotMap).find(([k, v]) => v.trim().toUpperCase() === frameNo);
          if (rev) iotName = rev[0].trim().toUpperCase();
        }

        // 2. Resolve Paired RF Machine strictly from Settings (holds live status, speed, production, EM left/right)
        const cleanNum = frameNo.replace(/\D/g, '');
        const normalizeRf = (raw?: string | null): string => {
          if (!raw) return '';
          const digits = raw.replace(/\D/g, '');
          if (!digits) return '';
          const num = parseInt(digits, 10);
          if (isNaN(num)) return '';
          return `RF${String(num).padStart(2, '0')}`;
        };

        let pairedRfNo = '';

        // Priority 1: Check date-specific effective mapping from Settings for today's active date
        if (effectiveDateMap) {
          const mapped = resolveMappedDevice(effectiveDateMap, frameNo);
          const norm = normalizeRf(mapped);
          if (norm) pairedRfNo = norm;
        }

        // Priority 2: Direct lookup in settings.iotMachineMapping or machineToMachineMapping
        if (!pairedRfNo) {
          const direct = resolveMappedDevice(effectiveSettings?.iotMachineMapping, frameNo) ||
                         resolveMappedDevice(effectiveSettings?.machineToMachineMapping, frameNo);
          const norm = normalizeRf(direct);
          if (norm) pairedRfNo = norm;
        }

        // Priority 3: Lookup in machinePairs from settings or localStorage
        if (!pairedRfNo) {
          for (const pair of allMachinePairs) {
            const sFrame = String(pair?.spinningFrame || '').trim().toUpperCase();
            if (sFrame === frameNo || sFrame.replace(/\D/g, '') === cleanNum) {
              const tel = String(pair?.telemetryMachine || pair?.iotMachine || '').trim().toUpperCase();
              if (tel && tel !== 'NONE' && tel !== 'UNASSIGNED') {
                const norm = normalizeRf(tel);
                if (norm) {
                  pairedRfNo = norm;
                  break;
                }
              }
            }
          }
        }

        // Priority 4: Natural RF fallback from spinning frame number (e.g. SP009 -> RF09, SP044 -> RF44)
        if (!pairedRfNo && cleanNum) {
          pairedRfNo = normalizeRf(cleanNum);
        }

        // 2 Devices for this IoT Machine (D1 for Left / LH side, D2 for Right / RH side)
        const devMap = deviceMappings.find(dm => 
          dm.name?.trim().toUpperCase() === iotName || 
          dm.mappingId?.trim().toUpperCase() === iotName
        );
        let stationList = devMap?.stationIds || [];
        if (stationList.length === 0) {
          const matchingDevs = devices.filter(d => 
            (d.machineId && d.machineId.toUpperCase() === iotName) || 
            (d.machineName && d.machineName.toUpperCase() === iotName)
          );
          if (matchingDevs.length > 0) {
            stationList = matchingDevs.map(d => d.deviceId);
          } else {
            stationList = ['IOT_D1', 'IOT_D2'];
          }
        }

        const d1DeviceId = stationList[0] || 'IOT_D1';
        const d2DeviceId = stationList[1] || 'IOT_D2';

        const naturalRf = normalizeRf(cleanNum);

        // Telemetry lookup using tiered priority order (NEVER allow natural fallback to preempt pairedRfNo!)
        const findTelemetryMachine = (list: any[]) => {
          if (!Array.isArray(list) || list.length === 0) return undefined;

          // Tier 1: Exact match on configured paired RF number from Settings (e.g. RF44)
          if (pairedRfNo) {
            const exact = list.find(m => {
              const mId = String(m.machine || m.machineId || '').trim().toUpperCase();
              return mId === pairedRfNo;
            });
            if (exact) return exact;

            // Tier 2: Numeric match on paired RF number (e.g. RF44 matches RF044)
            const pInt = parseInt(pairedRfNo.replace(/\D/g, ''), 10);
            if (!isNaN(pInt)) {
              const numMatch = list.find(m => {
                const mId = String(m.machine || m.machineId || '').trim().toUpperCase();
                const mInt = parseInt(mId.replace(/\D/g, ''), 10);
                return !isNaN(mInt) && mInt === pInt && mId.startsWith('RF');
              });
              if (numMatch) return numMatch;
            }
          }

          // Tier 3: If and ONLY IF no pairedRfNo was configured, fallback to natural RF (e.g. RF09)
          if (!pairedRfNo && naturalRf) {
            const nat = list.find(m => {
              const mId = String(m.machine || m.machineId || '').trim().toUpperCase();
              return mId === naturalRf || mId === `RF${cleanNum}`;
            });
            if (nat) return nat;
          }

          // Tier 4: Direct frameNo match
          const directFrame = list.find(m => {
            const mId = String(m.machine || m.machineId || '').trim().toUpperCase();
            return mId === frameNo;
          });
          if (directFrame) return directFrame;

          return undefined;
        };

        const lightM = findTelemetryMachine(lightMachines);
        const liveM = findTelemetryMachine(liveMachines);

        const roman = targetShiftNum === 1 ? 'I' : targetShiftNum === 2 ? 'II' : 'III';
        const reportEntry = targetReport?.entries?.find(e => {
          if (!e.frameNo || e.frameNo.trim().toUpperCase() !== frameNo) return false;
          if (!e.shift) return true;
          const sStr = String(e.shift).trim().toUpperCase();
          return sStr === roman || sStr === String(targetShiftNum) || sStr.includes(String(targetShiftNum));
        }) || targetReport?.entries?.find(e => e.frameNo && e.frameNo.trim().toUpperCase() === frameNo);

        let rawCount = String(lightM?.count || liveM?.count || reportEntry?.count || '').trim();
        if (rawCount && /\bch\s*\d+$/i.test(rawCount)) {
          rawCount = rawCount.replace(/\s*ch\s*\d+$/i, ' CH');
        }
        let yarnCount = rawCount || '-';

        let productionKg = 0;
        if (typeof lightM?.shiftProduction === 'number' && lightM.shiftProduction > 0) {
          productionKg = lightM.shiftProduction;
        } else if (typeof lightM?.production === 'number' && lightM.production > 0) {
          productionKg = lightM.production;
        } else if (typeof liveM?.shiftProduction === 'number' && liveM.shiftProduction > 0) {
          productionKg = liveM.shiftProduction;
        } else if (typeof (liveM as any)?.production === 'number' && (liveM as any).production > 0) {
          productionKg = Number((liveM as any).production);
        } else if ((reportEntry as any)?.productionKg && (reportEntry as any).productionKg > 0) {
          productionKg = Number((reportEntry as any).productionKg);
        } else if ((reportEntry as any)?.actualKg && (reportEntry as any).actualKg > 0) {
          productionKg = Number((reportEntry as any).actualKg);
        }

        let gpsActual = 0;
        if (typeof lightM?.gps === 'number' && lightM.gps > 0) {
          gpsActual = lightM.gps;
        } else if (typeof liveM?.gps === 'number' && liveM.gps > 0) {
          gpsActual = liveM.gps;
        } else if (reportEntry?.gpsActual && reportEntry.gpsActual > 0) {
          gpsActual = reportEntry.gpsActual;
        } else if (productionKg > 0) {
          const spindles = Number((reportEntry as any)?.spindles || 1200);
          gpsActual = Number(((productionKg * 1000) / spindles / 8).toFixed(1));
        }

        // Machine Live Running Status: RUNNING, DOFFING, STOPPED from paired telemetry machine (RF44 / RF09)
        let machineLiveStatus: 'RUNNING' | 'DOFFING' | 'STOPPED' = 'RUNNING';
        if (isLive) {
          const rawRunStatus = String(lightM?.runStatus || liveM?.runStatus || (liveM as any)?.status || '').toUpperCase();
          if (rawRunStatus.includes('DOFF')) {
            machineLiveStatus = 'DOFFING';
          } else if (rawRunStatus === 'STOP' || rawRunStatus === 'OFFLINE' || rawRunStatus.includes('STOP')) {
            machineLiveStatus = 'STOPPED';
          } else if (rawRunStatus === 'RUN' || rawRunStatus.includes('RUN') || (lightM?.speed || 0) > 500) {
            machineLiveStatus = 'RUNNING';
          }
        } else {
          machineLiveStatus = (productionKg > 0 || gpsActual > 0 || reportEntry) ? 'RUNNING' : 'STOPPED';
        }

        let rpm = 0;
        if (machineLiveStatus !== 'STOPPED' && machineLiveStatus !== 'DOFFING') {
          rpm = Number(lightM?.speed ?? liveM?.spindleSpeedCurrent ?? liveM?.speed ?? (productionKg > 0 ? 17160 : 0));
        }

        // EM Left and EM Right from paired telemetry machine (RF44 / RF09)
        const sideL = (liveM?.sides || []).find((s: any) => String(s.side).toUpperCase() === 'L');
        const sideR = (liveM?.sides || []).find((s: any) => String(s.side).toUpperCase() === 'R');

        let emLeft = 0;
        let emRight = 0;
        if (machineLiveStatus !== 'STOPPED') {
          if (typeof lightM?.emLeft === 'number' && lightM.emLeft > 0) {
            emLeft = lightM.emLeft;
          } else if (typeof sideL?.endMendingTime === 'number' && sideL.endMendingTime > 0) {
            emLeft = Number(sideL.endMendingTime);
          }

          if (typeof lightM?.emRight === 'number' && lightM.emRight > 0) {
            emRight = lightM.emRight;
          } else if (typeof sideR?.endMendingTime === 'number' && sideR.endMendingTime > 0) {
            emRight = Number(sideR.endMendingTime);
          }
        }
        const emAvg = Number(((emLeft + emRight) / 2).toFixed(2)) || (reportEntry?.doffEmt || 0);

        // Auto-select operator for Device 1 (D1) and Device 2 (D2) for this live shift strictly from today's taps
        const resolveDeviceAuto = (devId: string, sideIndex: number) => {
          const cleanDevId = devId.trim().toUpperCase();
          const defaultSide = sideIndex === 0 ? 'LH' : 'RH';

          const devObj = devices.find(d => 
            (d.deviceId && d.deviceId.toUpperCase() === cleanDevId) ||
            (d.machineId && d.machineId.toUpperCase() === cleanDevId)
          );

          let side = defaultSide;
          if (devObj?.side) {
            const s = devObj.side.toUpperCase();
            if (s.includes('RIGHT') || s === 'RH') side = 'RH';
            else if (s.includes('LEFT') || s === 'LH') side = 'LH';
            else side = devObj.side;
          }

          // Check employee metrics for this device strictly from target date & shift
          const met = employeeMetrics.find(m => 
            (m.machineId && m.machineId.toUpperCase() === cleanDevId) || 
            (devObj?.deviceId && m.machineId && m.machineId.toUpperCase() === devObj.deviceId.toUpperCase()) ||
            (m.machineId && m.machineId.toUpperCase() === iotName)
          );

          const metTaps = Array.isArray(met?.taps) ? met.taps : [];
          const hasTapsToday = metTaps.length > 0 || Number(met?.roundsCompleted || met?.rounds || 0) > 0;

          if (!hasTapsToday) {
            // Fallback: check reportEntry for assigned operator from Daily Report (especially for historical dates!)
            const siderRaw = reportEntry?.siderName || reportEntry?.siderId || (reportEntry?.siderIds && reportEntry.siderIds[sideIndex]);
            const matchedSider = siderRaw ? resolveWorkerMaster(siderRaw) : null;

            if (matchedSider || siderRaw) {
              const operatorName = matchedSider?.name || siderRaw || 'OPERATOR';
              const operatorToken = matchedSider?.tNo || siderRaw || '—';
              const operatorPhoto = matchedSider?.photoUrl;
              const estRounds = gpsActual > 0 ? Math.min(60, Math.max(10, Math.round((gpsActual / 6) * 60))) : 0;
              const estTaps = estRounds;

              return {
                deviceId: devId,
                side,
                operatorName,
                operatorToken,
                operatorPhoto,
                isAssigned: true,
                tapsCount: estTaps,
                rounds: estRounds,
                startTimeIso: null,
                endTimeIso: null,
                lastTapTime: isLive ? '' : 'Completed Shift',
                lastTapTimestamp: 0,
                metric: null
              };
            }

            return {
              deviceId: devId,
              side,
              operatorName: 'No operator is active',
              operatorToken: '—',
              operatorPhoto: undefined,
              isAssigned: false,
              tapsCount: 0,
              rounds: 0,
              startTimeIso: null,
              endTimeIso: null,
              lastTapTime: '',
              lastTapTimestamp: 0,
              metric: null
            };
          }

          // If operator has tapped and initiated activation today:
          let rawId = met?.employeeId || '';
          const mappedRfid = rawId ? rfidMappedEmpMap.get(String(rawId).trim()) : undefined;
          let rawName = mappedRfid?.employeeName || met?.employeeName || '';

          // Parse Name(Token) format (e.g. "Mangal(33786)" -> Name: Mangal, Token: 33786)
          let extName = rawName ? String(rawName).trim() : '';
          let extToken = mappedRfid?.tNo ? String(mappedRfid.tNo).trim() : (rawId ? String(rawId).trim() : '');
          const match = extName.match(/^([^\(]+)\s*\(([0-9A-Za-z]+)\)$/);
          if (match) {
            extName = match[1].trim();
            extToken = match[2].trim();
          }

          // Match in Employee Master
          const matched =
            (mappedRfid?.workerId ? workers.find(w => w.id === mappedRfid.workerId) : null) ||
            resolveWorkerMaster(extToken) ||
            resolveWorkerMaster(rawId) ||
            resolveWorkerMaster(extName);
          const operatorName = matched?.name || extName || (rawId ? `RFID ${rawId}` : 'OPERATOR');
          const operatorToken = matched?.tNo || mappedRfid?.tNo || (extToken !== rawId ? extToken : '') || rawId || '—';
          const operatorPhoto = matched?.photoUrl;

          // Real Live Taps from Railway API
          const tapsCount = metTaps.length > 0 ? metTaps.length : Number(met?.rounds || 0);
          const devRounds = Number(met?.roundsCompleted ?? met?.rounds ?? (tapsCount > 0 ? tapsCount : 0));

          // Activity Window start & end times directly from Railway API taps
          const startTimeIso = metTaps.length > 0 ? (metTaps[0].time as string) : null;
          const endTimeIso = metTaps.length > 0 ? (metTaps[metTaps.length - 1].time as string) : null;

          let lastTapDisplay = '';
          let lastTapTimestamp = 0;
          if (endTimeIso) {
            try {
              const d = new Date(endTimeIso);
              if (!isNaN(d.getTime())) {
                lastTapDisplay = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
                lastTapTimestamp = d.getTime();
              }
            } catch (_) {}
          }

          return {
            deviceId: devId,
            side,
            operatorName,
            operatorToken,
            operatorPhoto,
            isAssigned: true,
            tapsCount,
            rounds: devRounds,
            startTimeIso,
            endTimeIso,
            lastTapTime: lastTapDisplay,
            lastTapTimestamp,
            metric: met
          };
        };

        const d1 = resolveDeviceAuto(d1DeviceId, 0);
        const d2 = resolveDeviceAuto(d2DeviceId, 1);

        const isAnyOperatorActive = d1.isAssigned || d2.isAssigned;

        let d1Taps = d1.tapsCount;
        let d2Taps = d2.tapsCount;
        let totalTaps = d1Taps + d2Taps;
        
        const expectedRounds = 60;
        const targetTaps = 120;
        const d1TargetTaps = 60;
        const d2TargetTaps = 60;

        // Rounds: from device rounds or max rounds completed
        let completedRounds = isAnyOperatorActive
          ? Math.max(d1.rounds || 0, d2.rounds || 0, Math.round(totalTaps / 2))
          : 0;

        // Activity Window: earliest tap to latest tap across D1 & D2 (e.g. 06:03 AM – 12:08 PM)
        const formatTimeAmPm = (iso?: string | null) => {
          if (!iso) return '';
          const d = new Date(iso);
          if (isNaN(d.getTime())) return '';
          return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        };

        const validStartTimes = [d1.startTimeIso, d2.startTimeIso].filter(Boolean) as string[];
        const validEndTimes = [d1.endTimeIso, d2.endTimeIso].filter(Boolean) as string[];

        const earliestStart = validStartTimes.length > 0 ? validStartTimes.sort()[0] : null;
        const latestEnd = validEndTimes.length > 0 ? validEndTimes.sort().reverse()[0] : null;

        let activityWindow = '0';
        if (isAnyOperatorActive) {
          if (earliestStart && latestEnd) {
            activityWindow = `${formatTimeAmPm(earliestStart)} – ${formatTimeAmPm(latestEnd)}`;
          } else {
            activityWindow = targetWindowLabel;
          }
        }

        // Overall last tap time between D1 and D2
        let lastTapTime = 'No Taps Recorded';
        if (isAnyOperatorActive) {
          if (latestEnd) {
            lastTapTime = formatTimeAmPm(latestEnd);
          } else {
            const d1Ts = d1.lastTapTimestamp || 0;
            const d2Ts = d2.lastTapTimestamp || 0;
            if (d1Ts > 0 || d2Ts > 0) {
              lastTapTime = d1Ts >= d2Ts ? d1.lastTapTime : d2.lastTapTime;
            }
          }
          if (!lastTapTime && totalTaps > 0) {
            lastTapTime = 'Recorded';
          }
        }

        // Calculate performance score directly based on completed rounds (max 60)
        let performanceScore = (isAnyOperatorActive && completedRounds > 0) 
          ? Math.min(100, Math.max(0, Math.round((completedRounds / expectedRounds) * 100))) 
          : 0;

        // Best Performer condition: proper rounds completed (cadence >= 75% or 45+ rounds)
        const isBestPerformer = isAnyOperatorActive && performanceScore >= 75 && machineLiveStatus !== 'STOPPED';

        // MAX INCENTIVE: Incentive amount for this count from Incentive Master
        let maxIncentive = 0;
        const countCandidates = [yarnCount, reportEntry?.count].filter(Boolean) as string[];
        for (const testCount of countCandidates) {
          if (maxIncentive > 0 || !testCount || testCount === '-') continue;
          const cleanCount = testCount.trim().toLowerCase();
          const cleanDigits = cleanCount.match(/\d+/)?.[0] || '';

          // 1. Direct or normalized match in Incentive Master rules
          let matchedRule = rules.find(r => {
            if (!r?.count) return false;
            const rc = r.count.trim().toLowerCase();
            if (rc === cleanCount) return true;
            const rNorm = rc.replace(/[\s\-_/]/g, '');
            const cNorm = cleanCount.replace(/[\s\-_/]/g, '');
            return rNorm === cNorm || cNorm.includes(rNorm) || rNorm.includes(cNorm);
          });

          // 2. Count digits + category match (e.g. 40 and ch/cw/pc/dy)
          if (!matchedRule && cleanDigits) {
            matchedRule = rules.find(r => {
              if (!r?.count) return false;
              const rc = r.count.trim().toLowerCase();
              const rDigits = rc.match(/\d+/)?.[0];
              if (rDigits === cleanDigits) {
                if ((cleanCount.includes('ch') && rc.includes('ch')) ||
                    (cleanCount.includes('cw') && rc.includes('cw')) ||
                    (cleanCount.includes('pc') && rc.includes('pc')) ||
                    (cleanCount.includes('dy') && rc.includes('dy'))) {
                  return true;
                }
              }
              return false;
            });
          }

          // 3. Fallback to count digits match
          if (!matchedRule && cleanDigits) {
            matchedRule = rules.find(r => {
              if (!r?.count) return false;
              const rDigits = r.count.trim().toLowerCase().match(/\d+/)?.[0];
              return rDigits === cleanDigits;
            });
          }

          if (matchedRule) {
            let maxAmount = 0;
            if (Array.isArray(matchedRule.payouts) && matchedRule.payouts.length > 0) {
              matchedRule.payouts.forEach((p: any) => {
                const amt = Number(p.amount || 0);
                if (amt > maxAmount) maxAmount = amt;
              });
            }
            if (Array.isArray((matchedRule as any).rules) && (matchedRule as any).rules.length > 0) {
              (matchedRule as any).rules.forEach((r: any) => {
                const amt = Number(r.amount || 0);
                if (amt > maxAmount) maxAmount = amt;
              });
            }
            if (Array.isArray((matchedRule as any).slabs) && (matchedRule as any).slabs.length > 0) {
              (matchedRule as any).slabs.forEach((s: any) => {
                const amt = Number(s.amount || 0);
                if (amt > maxAmount) maxAmount = amt;
              });
            }
            maxIncentive = maxAmount;
          }
        }

        // EARNED INCENTIVE: Calculated based on performance score and max incentive
        let earnedIncentive = (isAnyOperatorActive && maxIncentive > 0 && performanceScore > 0) 
          ? Math.round(maxIncentive * (performanceScore / 100)) 
          : 0;

        // When STOPPED: all data becomes 0 as requested
        if (machineLiveStatus === 'STOPPED') {
          rpm = 0;
          productionKg = 0;
          gpsActual = 0;
          maxIncentive = 0;
          earnedIncentive = 0;
          performanceScore = 0;
          completedRounds = 0;
          totalTaps = 0;
          d1Taps = 0;
          d2Taps = 0;
          emLeft = 0;
          emRight = 0;
        }

        // Check if dual operators exist across the 2 devices
        const hasDualOperators = Boolean(
          d1.isAssigned && d2.isAssigned && 
          d1.operatorToken !== '—' && d2.operatorToken !== '—' &&
          (d1.operatorToken !== d2.operatorToken || d1.operatorName.toLowerCase() !== d2.operatorName.toLowerCase())
        );

        // Primary operator display details
        const primary = d1.isAssigned ? d1 : (d2.isAssigned ? d2 : {
          operatorName: 'No operator is active',
          operatorToken: '—',
          operatorPhoto: undefined
        });

        builtSlides.push({
          id: `slide-${frameNo}-${iotName}`,
          frameNo,
          rfMachineNo: pairedRfNo,
          iotMachineName: iotName,
          yarnCount,
          rpm,
          productionKg,
          gpsActual,
          maxIncentive,
          earnedIncentive,
          incentiveAmount: maxIncentive,
          machineLiveStatus,
          operatorName: primary.operatorName,
          operatorToken: primary.operatorToken,
          operatorPhoto: primary.operatorPhoto,
          hasDualOperators,
          d1OperatorName: d1.operatorName,
          d1OperatorToken: d1.operatorToken,
          d1OperatorPhoto: d1.operatorPhoto,
          d2OperatorName: d2.operatorName,
          d2OperatorToken: d2.operatorToken,
          d2OperatorPhoto: d2.operatorPhoto,
          completedRounds,
          expectedRounds,
          totalTaps,
          targetTaps,
          d1Taps,
          d2Taps,
          d1TargetTaps,
          d2TargetTaps,
          d1DeviceId,
          d2DeviceId,
          performanceScore,
          emLeft,
          emRight,
          emAvg,
          activityWindow,
          liveShiftNum: targetShiftNum,
          liveShiftName: targetShiftName,
          lastTapTime,
          isBestPerformer
        });
      });

      // Sort: Best performers first, then numeric frame order
      builtSlides.sort((a, b) => {
        if (a.isBestPerformer && !b.isBestPerformer) return -1;
        if (!a.isBestPerformer && b.isBestPerformer) return 1;
        return a.frameNo.localeCompare(b.frameNo, undefined, { numeric: true });
      });

      setSlides(builtSlides);
      setCurrentIndex(prev => (builtSlides.length > 0 && prev >= builtSlides.length ? 0 : prev));
    } catch (err) {
      console.error('Error preparing IoT TV Performance slides:', err);
    } finally {
      if (!isSilent) setIsLoading(false);
    }
  }, [
    isLive,
    selectedDateIso,
    selectedShift,
    report,
    history,
    machines,
    workers,
    rules,
    settings,
    selectedShed,
    getLiveShiftInfo,
    toIsoDate
  ]);

  // Periodic 45s background live refresh (only active when isLive is true)
  useEffect(() => {
    loadSlideData(false);
    if (!isLive) return;
    const interval = setInterval(() => {
      loadSlideData(true);
    }, 45000);
    return () => clearInterval(interval);
  }, [loadSlideData, isLive]);

  // Slide Rotation Timer
  useEffect(() => {
    if (!isPlaying || slides.length <= 1) return;

    setTimeRemaining(SLIDE_DURATION);
    const tick = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          setCurrentIndex(curr => (curr + 1) % slides.length);
          return SLIDE_DURATION;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(tick);
  }, [isPlaying, slides.length, currentIndex]);

  const nextSlide = () => {
    if (slides.length === 0) return;
    setCurrentIndex((currentIndex + 1) % slides.length);
    setTimeRemaining(SLIDE_DURATION);
  };

  const prevSlide = () => {
    if (slides.length === 0) return;
    setCurrentIndex((currentIndex - 1 + slides.length) % slides.length);
    setTimeRemaining(SLIDE_DURATION);
  };

  if (isLoading) {
    return (
      <div className="min-h-[75vh] flex flex-col items-center justify-center bg-white border-2 border-slate-200 text-stone-900 rounded-3xl p-10 shadow-lg relative overflow-hidden">
        {/* Ambient background glow */}
        <div className="absolute w-72 h-72 bg-emerald-100/40 rounded-full blur-3xl pointer-events-none -top-10 -left-10" />
        <div className="absolute w-72 h-72 bg-teal-100/30 rounded-full blur-3xl pointer-events-none -bottom-10 -right-10" />

        {/* Bouncing Ball Animation Container */}
        <div className="relative flex flex-col items-center justify-center mb-6 z-10">
          {/* Main Bouncing Ball with squash & stretch and dynamic shadow */}
          <div className="relative w-28 h-32 flex flex-col items-center justify-end">
            <motion.div
              animate={{
                y: [0, -60, 0],
                scaleY: [0.75, 1.18, 0.75],
                scaleX: [1.28, 0.88, 1.28]
              }}
              transition={{
                duration: 0.65,
                repeat: Infinity,
                ease: ["easeOut", "easeIn"]
              }}
              className="w-14 h-14 rounded-full bg-gradient-to-tr from-emerald-600 via-emerald-500 to-teal-400 shadow-xl shadow-emerald-500/40 relative z-10 flex items-center justify-center cursor-default select-none"
            >
              {/* Ball 3D glossy highlight */}
              <div className="absolute top-2 left-3 w-4 h-2.5 rounded-full bg-white/70 rotate-[-25deg] blur-[0.5px]" />
              <Activity size={20} className="text-white/85" />
            </motion.div>

            {/* Synchronized floor shadow */}
            <motion.div
              animate={{
                scale: [1.35, 0.45, 1.35],
                opacity: [0.6, 0.15, 0.6]
              }}
              transition={{
                duration: 0.65,
                repeat: Infinity,
                ease: ["easeOut", "easeIn"]
              }}
              className="w-12 h-3 rounded-full bg-emerald-950/20 blur-[3px] mt-1"
            />
          </div>

          {/* Staggered 3-Ball Bouncing Wave */}
          <div className="flex items-center gap-2.5 mt-4">
            {[0, 1, 2].map(i => (
              <motion.div
                key={i}
                animate={{
                  y: [0, -14, 0],
                  scale: [1, 1.15, 1]
                }}
                transition={{
                  duration: 0.55,
                  repeat: Infinity,
                  delay: i * 0.15,
                  ease: "easeInOut"
                }}
                className={cn(
                  "w-3 h-3 rounded-full shadow-xs",
                  i === 0 ? "bg-emerald-500 shadow-emerald-500/30" :
                  i === 1 ? "bg-teal-500 shadow-teal-500/30" : "bg-emerald-600 shadow-emerald-600/30"
                )}
              />
            ))}
          </div>
        </div>

        <h3 className="text-xl font-black uppercase tracking-wider text-stone-800 z-10">
          Syncing Live Shift Telemetry...
        </h3>
        <p className="text-xs text-slate-500 mt-1 z-10">
          Loading assigned machines, rounds &amp; device taps for the live shift
        </p>
      </div>
    );
  }

  // If no assigned machines found
  if (slides.length === 0) {
    return (
      <div className="min-h-[75vh] flex flex-col items-center justify-center bg-white border-2 border-amber-300 text-stone-900 rounded-3xl p-12 text-center shadow-xl">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-300 flex items-center justify-center mb-4">
          <AlertTriangle size={34} className="text-amber-600" />
        </div>
        <h3 className="text-2xl font-black uppercase tracking-wide text-stone-900">
          Machine is not assigned
        </h3>
        <p className="text-sm text-slate-600 max-w-md mt-2 leading-relaxed font-medium">
          IoT TV Dashboard displays machines only when they are actively assigned. 
          Please assign spinning frames in <span className="text-emerald-600 font-bold">IoT Configuration → 5. Machine Mapping</span> to view live slides.
        </p>
      </div>
    );
  }

  const currentSlide = slides[currentIndex] || slides[0];

  return (
    <div className="w-full min-h-[85vh] bg-slate-100/90 rounded-3xl p-4 sm:p-6 lg:p-8 flex flex-col space-y-4">
      {/* 1. TOP CONTROLS & ROTATION HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white px-6 py-3.5 rounded-2xl border border-slate-200 shadow-md">
        {/* Left Side: Machine Number and Shift Information / Selectors */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Machine Numbers */}
          <span className="text-xs font-black uppercase tracking-wider text-slate-800">
            MACHINE {currentIndex + 1} OF {slides.length} ({currentSlide.frameNo}{currentSlide.rfMachineNo ? ` · ${currentSlide.rfMachineNo}` : ''})
          </span>

          <span className="text-slate-300">•</span>

          {/* Shift Display / Selector */}
          {isLive ? (
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                CURRENT SHIFT {currentSlide.liveShiftNum}
              </span>
              <span className="text-[11px] font-bold text-slate-500 uppercase">
                ({currentSlide.activityWindow && currentSlide.activityWindow !== '0' ? currentSlide.activityWindow : 'LIVE'})
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 px-2">Shift:</span>
              {[1, 2, 3].map(sNum => (
                <button
                  key={sNum}
                  type="button"
                  onClick={() => handleSelectShift(sNum)}
                  className={cn(
                    "px-3 py-1 rounded-lg text-xs font-black uppercase transition-all cursor-pointer",
                    currentSlide.liveShiftNum === sNum
                      ? "bg-emerald-600 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-white"
                  )}
                >
                  Shift {sNum}
                </button>
              ))}
              <span className="text-[11px] font-mono font-bold text-slate-500 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                {toCanonicalDate(selectedDateIso)}
              </span>
            </div>
          )}
        </div>

        {/* Right Side: LIVE Button, Timer & Rotation Controls */}
        <div className="flex items-center gap-3 self-end sm:self-auto">
          {/* LIVE Button */}
          <button
            type="button"
            onClick={handleToggleLive}
            className={cn(
              "flex items-center gap-2 px-3.5 py-1.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer shadow-xs",
              isLive
                ? "bg-emerald-600 text-white border border-emerald-500 shadow-emerald-500/20 hover:bg-emerald-700 active:scale-95"
                : "bg-slate-100 text-slate-600 border border-slate-300 hover:bg-slate-200 hover:text-emerald-700 active:scale-95"
            )}
            title={isLive ? "Live Telemetry Active (Click to pause live)" : "Click to return to Live Telemetry"}
          >
            <span className={cn(
              "w-2.5 h-2.5 rounded-full inline-block",
              isLive ? "bg-white animate-pulse" : "bg-slate-400"
            )} />
            <span>LIVE</span>
          </button>

          {/* Progress Timer */}
          <div className="flex items-center gap-2 px-3 py-1 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 text-xs font-mono font-bold">
            <Clock size={13} className="text-emerald-600" />
            <span>{timeRemaining}s</span>
          </div>

          {/* Prev / Next & Pause Buttons */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={prevSlide}
              className="p-1.5 hover:bg-white text-slate-700 hover:text-black rounded-lg transition-colors cursor-pointer"
              title="Previous Machine"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={() => setIsPlaying(prev => !prev)}
              className="p-1.5 hover:bg-white text-slate-700 hover:text-black rounded-lg transition-colors cursor-pointer"
              title={isPlaying ? "Pause Rotation" : "Play Rotation"}
            >
              {isPlaying ? <Pause size={15} /> : <Play size={15} />}
            </button>
            <button
              type="button"
              onClick={nextSlide}
              className="p-1.5 hover:bg-white text-slate-700 hover:text-black rounded-lg transition-colors cursor-pointer"
              title="Next Machine"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* 2. MAIN TV SLIDE CARD (White Background, Yellow if Doffing, Light Red if Stopped) */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentSlide.id}
          initial={{ opacity: 0, scale: 0.98, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: -10 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className={cn(
            "w-full rounded-3xl p-6 sm:p-8 md:p-10 border-4 shadow-2xl relative overflow-hidden transition-all",
            currentSlide.machineLiveStatus === 'DOFFING'
              ? "bg-amber-100/95 border-amber-500 shadow-amber-300/60"
              : currentSlide.machineLiveStatus === 'STOPPED'
                ? "bg-red-50/95 border-red-500 shadow-red-300/60"
                : currentSlide.isBestPerformer
                  ? "border-emerald-500 shadow-emerald-200/50 bg-gradient-to-br from-white via-emerald-50/20 to-white"
                  : currentSlide.operatorName === 'No operator is active'
                    ? "border-slate-300 shadow-slate-200/50 bg-white"
                    : currentSlide.performanceScore < 40
                      ? "border-red-600 shadow-red-200/60 bg-gradient-to-br from-white via-red-50/25 to-white animate-[redAlertBlink_1.2s_ease-in-out_infinite]"
                      : "border-slate-300 shadow-slate-200/50 bg-white"
          )}
        >
          {/* Custom style for red alert blinking when worst / lagging performer */}
          <style dangerouslySetInnerHTML={{ __html: `
            @keyframes redAlertBlink {
              0%, 100% {
                border-color: #dc2626;
                box-shadow: 0 0 35px rgba(220, 38, 38, 0.45), inset 0 0 15px rgba(220, 38, 38, 0.08);
                background-color: #ffffff;
              }
              50% {
                border-color: #f87171;
                box-shadow: 0 0 10px rgba(220, 38, 38, 0.15);
                background-color: #fef2f2;
              }
            }
          `}} />

          {/* 👏 Clap celebration overlay for BEST PERFORMER */}
          {currentSlide.isBestPerformer && currentSlide.machineLiveStatus === 'RUNNING' && <ClapCelebration />}

          {/* 🚨 Flashing Red Emergency Banner for WORST / LAGGING PERFORMER */}
          {(currentSlide.performanceScore < 40 || currentSlide.machineLiveStatus === 'STOPPED') && 
            currentSlide.machineLiveStatus !== 'DOFFING' && 
            currentSlide.operatorName !== 'No operator is active' && (
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="w-full mb-6 p-3 rounded-2xl bg-gradient-to-r from-red-600 via-rose-600 to-red-600 text-white flex items-center justify-between px-6 shadow-xl border-2 border-red-400 animate-pulse"
            >
              <div className="flex items-center gap-3">
                <span className="w-3.5 h-3.5 rounded-full bg-white animate-ping" />
                <span className="text-xs sm:text-sm font-black uppercase tracking-wider">
                  ⚠️ ATTENTION: {currentSlide.machineLiveStatus === 'STOPPED' ? 'MACHINE IS STOPPED (ALL DATA ZERO)' : 'LOW ROUNDS / LAGGING CADENCE DETECTED ON THIS FRAME!'}
                </span>
              </div>
              <span className="text-xs font-mono font-black bg-black/25 px-3 py-1 rounded-xl">
                {currentSlide.completedRounds} ROUNDS COMPLETED
              </span>
            </motion.div>
          )}

          {/* TOP BANNER RIBBON (SP44 + Status + Count | Max Incentive | Speed | Production) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-6 items-center pb-6 border-b border-slate-200 mb-6">
            {/* Top-Left: Machine No & Status & Yarn Count & Current GPS */}
            <div className="lg:col-span-5">
              <div className="flex flex-wrap items-baseline gap-3">
                <div className="flex items-baseline gap-2.5">
                  <h1 className="text-5xl sm:text-7xl font-black text-stone-900 tracking-tight leading-none">
                    {currentSlide.frameNo}
                  </h1>
                  {currentSlide.rfMachineNo && (
                    <span className="text-2xl sm:text-4xl font-extrabold text-stone-400 tracking-tight">
                      ({currentSlide.rfMachineNo})
                    </span>
                  )}
                </div>
                {/* Live Status Badge */}
                {currentSlide.machineLiveStatus === 'DOFFING' ? (
                  <span className="px-3.5 py-1.5 rounded-2xl bg-amber-200 text-amber-950 border-2 border-amber-400 font-black text-xs sm:text-sm uppercase tracking-wider flex items-center gap-1.5 shadow-xs">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-600 animate-ping" />
                    DOFFING
                  </span>
                ) : currentSlide.machineLiveStatus === 'STOPPED' ? (
                  <span className="px-3.5 py-1.5 rounded-2xl bg-red-100 text-red-900 border-2 border-red-400 font-black text-xs sm:text-sm uppercase tracking-wider flex items-center gap-1.5 shadow-xs">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-600" />
                    STOPPED
                  </span>
                ) : (
                  <span className="px-3.5 py-1.5 rounded-2xl bg-emerald-100 text-emerald-900 border-2 border-emerald-400 font-black text-xs sm:text-sm uppercase tracking-wider flex items-center gap-1.5 shadow-xs">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 animate-pulse" />
                    RUNNING
                  </span>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <span className="text-xl sm:text-2xl font-black text-black">
                  COUNT: {currentSlide.yarnCount}
                </span>
                <span className="text-slate-300 font-bold">•</span>
                <span className="px-3.5 py-1 rounded-xl bg-slate-200/90 border border-slate-300 text-stone-900 text-sm sm:text-base font-black uppercase">
                  CURRENT GPS: {currentSlide.gpsActual.toFixed(1)}
                </span>
              </div>
            </div>

            {/* Top-Right Metrics: MAX INCENTIVE | SPEED | PRODUCTION spread evenly */}
            <div className="lg:col-span-7 grid grid-cols-3 gap-4 sm:gap-6">
              {/* 1. Max Incentive */}
              <div className="flex flex-col items-start p-3 sm:p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200/80 shadow-2xs">
                <span className="text-xs sm:text-sm font-black uppercase tracking-widest text-emerald-800 flex items-center gap-1.5 mb-1">
                  <span>💰</span> MAX INCENTIVE
                </span>
                <span className="text-3xl sm:text-5xl xl:text-6xl font-black text-emerald-600 tabular-nums">
                  ₹{currentSlide.maxIncentive.toLocaleString('en-IN')}
                </span>
              </div>

              {/* 2. Speed (RPM) */}
              <div className="flex flex-col items-start p-3 sm:p-4 rounded-2xl bg-slate-50 border border-slate-200 shadow-2xs">
                <span className="text-xs sm:text-sm font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5 mb-1">
                  <span>⚡</span> SPEED
                </span>
                <div className="text-3xl sm:text-5xl xl:text-6xl font-black text-stone-900 tabular-nums flex items-baseline gap-1">
                  <span>{currentSlide.rpm.toLocaleString()}</span>
                  <span className="text-xs sm:text-base font-bold text-slate-400">RPM</span>
                </div>
              </div>

              {/* 3. Production (kg) */}
              <div className="flex flex-col items-start p-3 sm:p-4 rounded-2xl bg-slate-50 border border-slate-200 shadow-2xs">
                <span className="text-xs sm:text-sm font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5 mb-1">
                  <span>📦</span> PRODUCTION
                </span>
                <div className="text-3xl sm:text-5xl xl:text-6xl font-black text-stone-900 tabular-nums flex items-baseline gap-1">
                  <span>{currentSlide.productionKg.toFixed(1)}</span>
                  <span className="text-xs sm:text-base font-bold text-slate-400">KG</span>
                </div>
              </div>
            </div>
          </div>

          {/* MAIN GRID: OPERATOR PHOTO (LEFT) & 3 EXPANDED BIG TELEMETRY ROWS (RIGHT) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 xl:gap-8 items-stretch">
            {/* LEFT COLUMN: BIGGER OPERATOR PHOTO + NAME & T. NO (Full Height) */}
            <div className="lg:col-span-4 xl:col-span-4 flex flex-col justify-between items-center h-full">
              {/* Operator Photo Box */}
              <div className={cn(
                "w-full max-w-[380px] h-[360px] sm:h-[400px] xl:h-[430px] rounded-3xl overflow-hidden border-4 shadow-2xl bg-slate-100 relative flex items-center justify-center transition-all",
                currentSlide.isBestPerformer 
                  ? "border-emerald-500 shadow-emerald-200/80" 
                  : currentSlide.operatorName === 'No operator is active'
                    ? "border-slate-300 shadow-slate-200/50"
                    : "border-red-500 shadow-red-200/80"
              )}>
                {currentSlide.operatorPhoto ? (
                  <img 
                    src={currentSlide.operatorPhoto} 
                    alt={currentSlide.operatorName} 
                    className="w-full h-full object-cover" 
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-slate-400">
                    <User size={84} className="mb-2 text-slate-300" />
                    <span className="text-sm font-black uppercase tracking-wider text-slate-400">NO PHOTO</span>
                  </div>
                )}
                {/* Shift Badge */}
                <div className={cn(
                  "absolute top-4 right-4 px-3.5 py-1.5 rounded-full text-white text-xs font-black uppercase tracking-wider shadow-lg flex items-center gap-1.5",
                  isLive ? "bg-emerald-500" : "bg-slate-700"
                )}>
                  {isLive && <span className="w-2 h-2 rounded-full bg-white animate-ping" />}
                  {currentSlide.liveShiftName}
                </div>
              </div>

              {/* Name & T. NO Box (Directly below the photo) */}
              <div className="w-full max-w-[380px] mt-4 p-5 bg-slate-50 border-2 border-slate-200 rounded-3xl text-center shadow-md">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-0.5">
                  OPERATOR NAME
                </span>
                <h2 className={cn(
                  "text-xl sm:text-3xl font-black uppercase tracking-tight truncate",
                  currentSlide.operatorName === 'No operator is active' ? "text-slate-400 italic text-lg sm:text-2xl" : "text-stone-900"
                )}>
                  {currentSlide.operatorName}
                </h2>
                <div className={cn(
                  "text-sm sm:text-base font-mono font-black mt-1",
                  currentSlide.operatorName === 'No operator is active' ? "text-slate-400" : "text-emerald-700"
                )}>
                  T. NO: {currentSlide.operatorToken}
                </div>

                {/* If 2 separate operators for D1 & D2, show both details */}
                {currentSlide.hasDualOperators && currentSlide.d1OperatorName && currentSlide.d2OperatorName && (
                  <div className="mt-3 pt-3 border-t border-slate-200 text-xs font-mono text-slate-600 text-left space-y-1">
                    <div className="truncate">
                      <span className="font-bold text-cyan-800">D1:</span> {currentSlide.d1OperatorName} ({currentSlide.d1OperatorToken})
                    </div>
                    <div className="truncate">
                      <span className="font-bold text-amber-800">D2:</span> {currentSlide.d2OperatorName} ({currentSlide.d2OperatorToken})
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT COLUMN: 3 BIG EXPANDED ROWS (Stretches Full Height, No Bottom Gap) */}
            <div className="lg:col-span-8 xl:col-span-8 flex flex-col justify-between gap-5 h-full">
              {/* LINE 1 (flex-1): [Rounds] | [Total Taps] | [Device Taps D1 / D2] */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 flex-1">
                {/* Box 1: Rounds */}
                <div className="p-5 sm:p-6 bg-slate-50 border-2 border-slate-200 rounded-3xl flex flex-col items-center justify-between text-center shadow-md">
                  <span className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-500">
                    ROUNDS
                  </span>
                  <div className="text-4xl sm:text-6xl xl:text-7xl font-black text-stone-900 tabular-nums my-auto py-1">
                    {currentSlide.completedRounds}
                  </div>
                  <span className="text-[11px] font-bold text-emerald-600 uppercase">
                    Live Completed Rounds
                  </span>
                </div>

                {/* Box 2: Total Taps */}
                <div className="p-5 sm:p-6 bg-slate-50 border-2 border-slate-200 rounded-3xl flex flex-col items-center justify-between text-center shadow-md">
                  <span className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-500">
                    TOTAL TAPS
                  </span>
                  <div className="text-4xl sm:text-6xl xl:text-7xl font-black text-stone-900 tabular-nums my-auto py-1">
                    {currentSlide.totalTaps}
                  </div>
                  <span className="text-[11px] font-bold text-emerald-600 uppercase">
                    Live Shift Taps
                  </span>
                </div>

                {/* Box 3: D1 & D2 Taps Balanced Side-by-Side (No shrinking) */}
                <div className="p-4 sm:p-5 bg-slate-50 border-2 border-slate-200 rounded-3xl flex flex-col justify-between shadow-md">
                  <span className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-500 text-center mb-1">
                    DEVICE TAPS (D1 / D2)
                  </span>
                  <div className="grid grid-cols-2 gap-2.5 my-auto">
                    <div className="flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-2xl bg-cyan-50 border-2 border-cyan-200 shadow-2xs">
                      <span className="text-xs font-mono font-black text-cyan-800 uppercase tracking-wider">
                        D1 (LH)
                      </span>
                      <div className="text-2xl sm:text-4xl font-black text-cyan-900 tabular-nums mt-0.5">
                        {currentSlide.d1Taps}
                      </div>
                      <span className="text-[10px] font-bold text-slate-400">Taps</span>
                    </div>
                    <div className="flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-2xl bg-amber-50 border-2 border-amber-200 shadow-2xs">
                      <span className="text-xs font-mono font-black text-amber-800 uppercase tracking-wider">
                        D2 (RH)
                      </span>
                      <div className="text-2xl sm:text-4xl font-black text-amber-900 tabular-nums mt-0.5">
                        {currentSlide.d2Taps}
                      </div>
                      <span className="text-[10px] font-bold text-slate-400">Taps</span>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 text-center uppercase">
                    Live Device Taps
                  </span>
                </div>
              </div>

              {/* LINE 2 (flex-1): PERFORMANCE SCORE SECTION (BIG AMOUNT & BIG SCORE) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1">
                {/* Left Half: EARNED INCENTIVE (BIG HERO AMOUNT) */}
                <div className={cn(
                  "p-6 sm:p-7 rounded-3xl border-3 shadow-xl flex flex-col justify-between transition-all",
                  currentSlide.isBestPerformer
                    ? "bg-gradient-to-br from-emerald-50/90 via-white to-emerald-100/50 border-emerald-500 shadow-emerald-200/50"
                    : "bg-gradient-to-br from-amber-50/70 via-white to-orange-100/40 border-amber-400 shadow-amber-200/40"
                )}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="text-2xl sm:text-3xl">💰</span>
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 block leading-tight">
                          LIVE SHIFT INCENTIVE
                        </span>
                        <h3 className="text-base sm:text-xl font-black uppercase tracking-wider text-stone-900 leading-tight">
                          EARNED INCENTIVE
                        </h3>
                      </div>
                    </div>
                    <span className="px-3 py-1 rounded-xl bg-slate-100 border border-slate-300 text-slate-700 text-xs font-black uppercase tracking-wider">
                      Max: ₹{currentSlide.maxIncentive.toLocaleString('en-IN')}
                    </span>
                  </div>

                  {/* Giant Big Amount */}
                  <div className="my-2">
                    <span className="text-6xl sm:text-7xl xl:text-8xl font-black tracking-tight tabular-nums text-emerald-600 drop-shadow-sm">
                      ₹{currentSlide.earnedIncentive.toLocaleString('en-IN')}
                    </span>
                  </div>

                  <div className="text-xs font-bold text-slate-500">
                    {currentSlide.operatorName === 'No operator is active'
                      ? 'No active operator taps'
                      : `Calculated from ${currentSlide.performanceScore}% round cadence`}
                  </div>
                </div>

                {/* Right Half: PERFORMANCE SCORE (BIG HERO SCORE) */}
                <div className={cn(
                  "p-6 sm:p-7 rounded-3xl border-3 shadow-xl flex flex-col justify-between transition-all",
                  currentSlide.isBestPerformer
                    ? "bg-gradient-to-br from-emerald-50/90 via-white to-emerald-100/50 border-emerald-500 shadow-emerald-200/50"
                    : "bg-gradient-to-br from-red-50/80 via-white to-rose-100/50 border-red-500 shadow-red-200/50"
                )}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className={cn(
                        "w-9 h-9 rounded-xl flex items-center justify-center text-white font-black shadow-sm",
                        currentSlide.isBestPerformer ? "bg-emerald-500" : "bg-red-600"
                      )}>
                        {currentSlide.isBestPerformer ? <Trophy size={20} /> : <AlertTriangle size={20} />}
                      </div>
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 block leading-tight">
                          CADENCE RATING
                        </span>
                        <h3 className="text-base sm:text-xl font-black uppercase tracking-wider text-stone-900 leading-tight">
                          PERFORMANCE SCORE
                        </h3>
                      </div>
                    </div>
                    <span className={cn(
                      "px-3 py-1 rounded-xl text-xs font-black uppercase tracking-wider border",
                      currentSlide.operatorName === 'No operator is active'
                        ? "bg-slate-100 text-slate-600 border-slate-300"
                        : currentSlide.isBestPerformer 
                          ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                          : "bg-red-100 text-red-800 border-red-300"
                    )}>
                      {currentSlide.operatorName === 'No operator is active'
                        ? 'No Operator Active'
                        : currentSlide.isBestPerformer ? 'Best Performer' : 'Lagging Cadence'}
                    </span>
                  </div>

                  {/* Giant Big Score */}
                  <div className="my-2">
                    <span className={cn(
                      "text-6xl sm:text-7xl xl:text-8xl font-black tracking-tight tabular-nums drop-shadow-sm",
                      currentSlide.isBestPerformer 
                        ? "text-emerald-600" 
                        : currentSlide.operatorName === 'No operator is active'
                          ? "text-slate-400"
                          : "text-red-600"
                    )}>
                      {currentSlide.performanceScore}%
                    </span>
                  </div>

                  <div className="text-xs font-bold text-slate-500">
                    {currentSlide.operatorName === 'No operator is active'
                      ? 'Waiting for operator RFID card tap'
                      : 'Live shift patrol cadence across LH & RH'}
                  </div>
                </div>
              </div>

              {/* LINE 3 (flex-1): [E M (LH:EM, RH:EM)] | [ACTIVE WIND TIME] */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1">
                {/* Box 1: E M (LH: EM, RH: EM) */}
                <div className="p-5 sm:p-6 bg-slate-50 border-2 border-slate-200 rounded-3xl shadow-md flex flex-col justify-between">
                  <span className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-500 text-center mb-1">
                    E M (END-MENDING QUALITY)
                  </span>
                  <div className="flex items-center justify-around gap-6 my-auto py-1">
                    <div className="text-center">
                      <span className="text-[11px] font-black uppercase tracking-wider text-cyan-800 block mb-0.5">
                        LH: EM ({currentSlide.d1DeviceId})
                      </span>
                      <div className="text-3xl sm:text-5xl font-black text-cyan-900 tabular-nums">
                        {currentSlide.emLeft.toFixed(2)} <span className="text-xs sm:text-sm font-bold text-slate-400">min</span>
                      </div>
                    </div>
                    <span className="text-slate-300 text-3xl sm:text-4xl font-light">|</span>
                    <div className="text-center">
                      <span className="text-[11px] font-black uppercase tracking-wider text-amber-800 block mb-0.5">
                        RH: EM ({currentSlide.d2DeviceId})
                      </span>
                      <div className="text-3xl sm:text-5xl font-black text-amber-900 tabular-nums">
                        {currentSlide.emRight.toFixed(2)} <span className="text-xs sm:text-sm font-bold text-slate-400">min</span>
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 text-center uppercase">
                    Live End-Mending Patrol Interval{currentSlide.rfMachineNo ? ` (${currentSlide.rfMachineNo})` : ''}
                  </span>
                </div>

                {/* Box 2: Active Wind Time (small) & Last Tap Time (in same box below) */}
                <div className="p-5 sm:p-6 bg-slate-50 border-2 border-slate-200 rounded-3xl shadow-md flex flex-col justify-between">
                  {/* Top: Active Wind Time (small) */}
                  <div className="text-center pb-2.5 border-b border-slate-200">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-0.5">
                      ACTIVE WIND TIME
                    </span>
                    <div className="text-sm sm:text-base font-bold text-slate-700 font-mono">
                      {currentSlide.operatorName === 'No operator is active' ? (
                        <span>0 <span className="text-xs text-slate-400 font-sans font-normal">(No data)</span></span>
                      ) : (
                        <span>{currentSlide.activityWindow} <span className="text-xs text-slate-400">({currentSlide.liveShiftName})</span></span>
                      )}
                    </div>
                  </div>

                  {/* Bottom: Last Tap Time (prominent) */}
                  <div className="text-center pt-2 my-auto">
                    <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-slate-500 block mb-1">
                      LAST TAP TIME
                    </span>
                    <div className="text-2xl sm:text-4xl xl:text-5xl font-black text-stone-900 font-mono tabular-nums">
                      {currentSlide.lastTapTime || 'No Taps Recorded'}
                    </div>
                  </div>

                  <span className="text-[10px] font-bold text-slate-400 text-center uppercase">
                    Live Shift Patrol Window &amp; RFID Tap
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Slide Indicator Dots */}
          <div className="flex items-center justify-center gap-1.5 mt-8 pt-4 border-t border-slate-100">
            {slides.map((s, idx) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setCurrentIndex(idx);
                  setTimeRemaining(SLIDE_DURATION);
                }}
                className={cn(
                  "h-2 rounded-full transition-all cursor-pointer",
                  idx === currentIndex 
                    ? (s.isBestPerformer ? "w-8 bg-emerald-500" : s.operatorName === 'No operator is active' ? "w-8 bg-slate-700" : "w-8 bg-red-600")
                    : "w-2 bg-slate-300 hover:bg-slate-400"
                )}
                title={`Go to Machine ${s.frameNo} (${s.operatorName})`}
              />
            ))}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
