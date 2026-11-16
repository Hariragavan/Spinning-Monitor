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
import { cn, calculateIncentive, getActiveRule } from '@/lib/utils';

export interface IotTvPerformanceProps {
  report?: DailyReport;
  machines?: MachineMasterItem[];
  workers?: Sider[];
  rules?: IncentiveRule[];
  settings?: SystemSettings;
  selectedShed?: Shed;
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
  selectedShed = 'Shed 1'
}) => {
  const [slides, setSlides] = useState<AssignedMachineSlide[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [timeRemaining, setTimeRemaining] = useState(15);
  const SLIDE_DURATION = 15; // seconds per assigned machine slide

  // Load live telemetry and build per-machine assigned slides
  const loadSlideData = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    try {
      // 1. Determine Current Live Date and Shift (IST: Shift 1 = 06-14, Shift 2 = 14-22, Shift 3 = 22-06)
      const now = new Date();
      const hours = now.getHours();
      const minutes = now.getMinutes();
      const totalMins = hours * 60 + minutes;

      let liveShiftNum = 1;
      let liveWindowLabel = '06:00 AM – 02:00 PM';
      if (totalMins >= 360 && totalMins < 840) {
        liveShiftNum = 1;
        liveWindowLabel = '06:00 AM – 02:00 PM';
      } else if (totalMins >= 840 && totalMins < 1320) {
        liveShiftNum = 2;
        liveWindowLabel = '02:00 PM – 10:00 PM';
      } else {
        liveShiftNum = 3;
        liveWindowLabel = '10:00 PM – 06:00 AM';
      }

      // If Shift 3 runs between midnight and 06:00, the shift date belongs to yesterday
      const shiftDateObj = new Date(now);
      if (totalMins < 360) {
        shiftDateObj.setDate(shiftDateObj.getDate() - 1);
      }
      const yStr = shiftDateObj.getFullYear();
      const mStr = String(shiftDateObj.getMonth() + 1).padStart(2, '0');
      const dStr = String(shiftDateObj.getDate()).padStart(2, '0');
      const liveShiftDate = `${yStr}-${mStr}-${dStr}`;
      const liveShiftName = `Shift ${liveShiftNum}`;

      // 2. Fetch live IoT devices, employee metrics, mappings, and live machine telemetry
      const [lightStatus, liveOverview, rawEmpMetrics, devices, iotEmployees, deviceMappings] = await Promise.all([
        iotApi.getLightweightMachineStatus().catch(() => null),
        iotApi.getSpinfoOverview({ shift: String(liveShiftNum), fromDate: liveShiftDate }).catch(() => null),
        iotApi.getEmployeePerformance({ date: liveShiftDate, shiftName: liveShiftName }).catch(() => [] as EmployeeMetric[]),
        iotApi.getDevices().catch(() => [] as DeviceHealth[]),
        iotApi.getEmployees().catch(() => [] as Employee[]),
        iotApi.getMachineMappings().catch(() => [] as MachineMapping[])
      ]);

      // Strictly only use today's live shift metrics, never old historical data
      const employeeMetrics = rawEmpMetrics || [];

      // Also fetch live card taps strictly for today's live shift
      let recentCardTaps: any[] = [];
      try {
        const ctRes = await fetch(`/api/iot/card-taps?date=${liveShiftDate}&shift=${liveShiftNum}&limit=500&_t=${Date.now()}`, { cache: 'no-store' });
        if (ctRes.ok) {
          const ctJson = await ctRes.json();
          if (Array.isArray(ctJson?.data)) {
            recentCardTaps = ctJson.data.filter((t: any) => t.shiftDate === liveShiftDate);
          }
        }
      } catch (_) {}

      const lightMachines = lightStatus?.machines || [];
      const liveMachines = liveOverview?.machines || [];

      // 1. Physical Frame -> IoT Machine Unit (strictly from Tab 5 Configuration, e.g. SP044 -> M1)
      const frameToIotMap: Record<string, string> = {
        ...(settings?.frameToIotProfileMapping || {})
      };

      if (settings?.iotProfileToFrameMapping) {
        Object.entries(settings.iotProfileToFrameMapping).forEach(([k, v]) => {
          if (k && v) {
            const cleanK = k.trim().toUpperCase();
            const cleanV = String(v).trim().toUpperCase();
            if (cleanK.startsWith('SP') || cleanK.startsWith('K')) frameToIotMap[cleanK] = cleanV;
            else if (cleanV.startsWith('SP') || cleanV.startsWith('K')) frameToIotMap[cleanV] = cleanK;
          }
        });
      }

      // Check persistent localStorage for Tab 5 assignments
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
        } catch (_) {}
      }

      // 2. Physical Frame -> Paired Telemetry Machine in Settings (e.g. SP044 -> RF44)
      const frameToTelemetryMap: Record<string, string> = {
        ...(settings?.iotMachineMapping || settings?.machineToMachineMapping || {})
      };
      if (Array.isArray(settings?.machinePairs)) {
        settings.machinePairs.forEach((pair: any) => {
          if (pair?.spinningFrame && pair?.telemetryMachine) {
            frameToTelemetryMap[pair.spinningFrame.trim().toUpperCase()] = pair.telemetryMachine.trim().toUpperCase();
          }
        });
      }

      const devOpMapFromSettings = settings?.iotDeviceOperatorMapping || {};

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
          if (cleanK.startsWith('SP') || cleanK.startsWith('K')) {
            candidateFrames.add(cleanK);
          } else if (cleanV.startsWith('SP') || cleanV.startsWith('K')) {
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

        // 2. Resolve Paired Telemetry Machine from Settings (holds live status, speed, production, EM left/right)
        let telemetryName = (frameToTelemetryMap[frameNo] || '').trim().toUpperCase();
        const cleanNum = frameNo.replace(/\D/g, '');
        const naturalRf = cleanNum ? `RF${cleanNum.padStart(2, '0')}` : '';

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

        // Telemetry lookup: match paired telemetry machine (RF44), natural RF44, or frameNo in lightMachines and liveMachines
        const matchFinder = (m: any) => {
          const mId = String(m.machine || m.machineId || '').trim().toUpperCase();
          if (!mId) return false;
          if (telemetryName && mId === telemetryName) return true;
          if (naturalRf && (mId === naturalRf || mId === `RF${cleanNum}`)) return true;
          if (mId === frameNo) return true;
          const mNum = mId.replace(/\D/g, '');
          return Boolean(cleanNum && mNum && mNum === cleanNum);
        };

        const lightM = lightMachines.find(matchFinder);
        const liveM = liveMachines.find(matchFinder);

        const reportEntry = report?.entries?.find(e => e.frameNo && e.frameNo.trim().toUpperCase() === frameNo);
        let yarnCount = String(lightM?.count || liveM?.count || reportEntry?.count || '').trim() || '-';

        // Machine Live Running Status: RUNNING, DOFFING, STOPPED from paired telemetry machine (RF44)
        let machineLiveStatus: 'RUNNING' | 'DOFFING' | 'STOPPED' = 'RUNNING';
        const rawRunStatus = String(lightM?.runStatus || liveM?.runStatus || (liveM as any)?.status || '').toUpperCase();
        if (rawRunStatus.includes('DOFF')) {
          machineLiveStatus = 'DOFFING';
        } else if (rawRunStatus === 'STOP' || rawRunStatus === 'OFFLINE' || rawRunStatus.includes('STOP')) {
          machineLiveStatus = 'STOPPED';
        } else if (rawRunStatus === 'RUN' || rawRunStatus.includes('RUN') || (lightM?.speed || 0) > 500) {
          machineLiveStatus = 'RUNNING';
        }

        let rpm = 0;
        if (machineLiveStatus !== 'STOPPED' && machineLiveStatus !== 'DOFFING') {
          rpm = Number(lightM?.speed ?? liveM?.spindleSpeedCurrent ?? liveM?.speed ?? 0);
        }

        let productionKg = 0;
        if (machineLiveStatus !== 'STOPPED') {
          productionKg = Number(
            lightM?.shiftProduction ?? 
            lightM?.production ?? 
            liveM?.shiftProduction ?? 
            (liveM as any)?.production ?? 
            0
          );
        }

        let gpsActual = 0;
        if (machineLiveStatus !== 'STOPPED') {
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
        }

        // EM Left and EM Right from paired telemetry machine (RF44)
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
        const emAvg = Number(((emLeft + emRight) / 2).toFixed(2));

        // Auto-select operator for Device 1 (D1) and Device 2 (D2) for this live shift from API & Card Taps
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

          // 1. Settings override (if any)
          const override = devOpMapFromSettings[cleanDevId];

          // 2. Recent live card taps for this device strictly for liveShiftDate
          const matchingTaps = recentCardTaps.filter(t => 
            (t.shiftDate === liveShiftDate) && (
              (t.machineId && t.machineId.toUpperCase() === cleanDevId) ||
              (t.deviceId && t.deviceId.toUpperCase() === cleanDevId) ||
              (devObj?.deviceId && t.deviceId && t.deviceId.toUpperCase() === devObj.deviceId.toUpperCase())
            )
          );
          const latestLiveTap = matchingTaps.length > 0 ? matchingTaps[0] : null;

          // 3. Employee metrics for this device strictly for liveShiftDate
          const met = employeeMetrics.find(m => 
            (m.machineId && m.machineId.toUpperCase() === cleanDevId) || 
            (devObj?.deviceId && m.machineId && m.machineId.toUpperCase() === devObj.deviceId.toUpperCase()) ||
            (m.machineId && m.machineId.toUpperCase() === iotName)
          );
          const lastMetTap = met?.taps && met.taps.length > 0 ? met.taps[met.taps.length - 1] : null;

          // 4. Resolve raw operator name and ID
          let rawName = 
            override?.employeeName || 
            latestLiveTap?.employeeName || 
            met?.employeeName || 
            devObj?.assignedEmployeeName || 
            (devObj as any)?.employeeName || 
            '';

          let rawId = 
            override?.employeeId || 
            latestLiveTap?.employeeId || 
            met?.employeeId || 
            devObj?.assignedEmployeeId || 
            (devObj as any)?.employeeId || 
            '';

          // 5. Fallback: check employees list assignedDeviceIds
          if (!rawName) {
            const emp = iotEmployees.find(e => 
              e.assignedDeviceIds && e.assignedDeviceIds.some(aid => 
                aid.toUpperCase() === cleanDevId || 
                (devObj?.deviceId && aid.toUpperCase() === devObj.deviceId.toUpperCase())
              )
            );
            if (emp) {
              rawName = emp.employeeName;
              rawId = emp.employeeId;
            }
          }

          // 6. Fallback: report entry sider
          if (!rawName && sideIndex === 0 && reportEntry) {
            rawName = reportEntry.siderName || (reportEntry.siderIds && reportEntry.siderIds[0]) || '';
            rawId = (reportEntry.siderIds && reportEntry.siderIds[0]) || '';
          }

          // Parse Name(Token) format (e.g. "Mangal(33786)" -> Name: Mangal, Token: 33786)
          let extName = rawName ? String(rawName).trim() : '';
          let extToken = rawId ? String(rawId).trim() : '';
          const match = extName.match(/^([^\(]+)\s*\(([0-9A-Za-z]+)\)$/);
          if (match) {
            extName = match[1].trim();
            extToken = match[2].trim();
          }

          // Match in Employee Master
          const matched = resolveWorkerMaster(extToken) || resolveWorkerMaster(rawId) || resolveWorkerMaster(extName);
          const operatorName = matched?.name || extName || (rawId ? `Operator #${rawId}` : 'OPERATOR');
          const operatorToken = matched?.tNo || extToken || rawId || '-';
          const operatorPhoto = matched?.photoUrl;
          const isAssigned = Boolean(
            matched ||
            (extName && extName.toLowerCase() !== 'unassigned' && extName !== 'null') ||
            (extToken && extToken.toLowerCase() !== 'unassigned' && extToken !== 'null')
          );

          // Real Live Taps strictly for today (0 if none)
          let tapsCount = 0;
          if (latestLiveTap?.cardTap !== undefined && Number(latestLiveTap.cardTap) > 0) {
            tapsCount = Number(latestLiveTap.cardTap);
          } else if (lastMetTap?.cardTap !== undefined && Number(lastMetTap.cardTap) > 0) {
            tapsCount = Number(lastMetTap.cardTap);
          } else if (matchingTaps.length > 0) {
            tapsCount = matchingTaps.length;
          }

          // Device rounds
          let devRounds = 0;
          if (met?.roundsCompleted !== undefined && Number(met.roundsCompleted) > 0) {
            devRounds = Number(met.roundsCompleted);
          } else if (tapsCount > 0) {
            devRounds = Math.round(tapsCount / 2);
          }

          // Last tap timestamp formatted (e.g. "08:34 AM")
          let lastTapIso = latestLiveTap?.tapTime || (lastMetTap as any)?.tapTime;
          let lastTapDisplay = '';
          let lastTapTimestamp = 0;
          if (lastTapIso) {
            try {
              const d = new Date(lastTapIso);
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
            isAssigned,
            tapsCount,
            rounds: devRounds,
            lastTapTime: lastTapDisplay,
            lastTapTimestamp,
            metric: met
          };
        };

        const d1 = resolveDeviceAuto(d1DeviceId, 0);
        const d2 = resolveDeviceAuto(d2DeviceId, 1);

        let d1Taps = d1.tapsCount;
        let d2Taps = d2.tapsCount;
        let totalTaps = d1Taps + d2Taps;
        
        const expectedRounds = 60;
        const targetTaps = 120;
        const d1TargetTaps = 60;
        const d2TargetTaps = 60;

        // Rounds: from device rounds or calculated from taps (2 taps = 1 round)
        let completedRounds = Math.max(
          d1.rounds || 0,
          d2.rounds || 0,
          Math.round(totalTaps / 2)
        );

        // Overall last tap time between D1 and D2
        let lastTapTime = '';
        const d1Ts = d1.lastTapTimestamp || 0;
        const d2Ts = d2.lastTapTimestamp || 0;
        if (d1Ts > 0 || d2Ts > 0) {
          lastTapTime = d1Ts >= d2Ts ? d1.lastTapTime : d2.lastTapTime;
        }
        if (!lastTapTime) {
          lastTapTime = totalTaps > 0 ? 'Recorded' : 'No Taps Recorded';
        }

        // Calculate performance score directly based on completed rounds (max 60)
        let performanceScore = completedRounds > 0 
          ? Math.min(100, Math.max(0, Math.round((completedRounds / expectedRounds) * 100))) 
          : 0;

        // Best Performer condition: proper rounds completed (cadence >= 75% or 45+ rounds)
        const isBestPerformer = performanceScore >= 75 && machineLiveStatus !== 'STOPPED';

        // MAX INCENTIVE: Incentive amount for this count from Incentive Master
        let maxIncentive = 0;
        if (rules && rules.length > 0 && yarnCount && yarnCount !== '-') {
          const cleanCount = yarnCount.trim().toLowerCase();
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
        let earnedIncentive = maxIncentive > 0 && performanceScore > 0 
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
          d1.operatorToken !== '-' && d2.operatorToken !== '-' &&
          (d1.operatorToken !== d2.operatorToken || d1.operatorName.toLowerCase() !== d2.operatorName.toLowerCase())
        );

        // Primary operator display details
        const primary = d1.isAssigned ? d1 : (d2.isAssigned ? d2 : d1);

        builtSlides.push({
          id: `slide-${frameNo}-${iotName}`,
          frameNo,
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
          activityWindow: liveWindowLabel,
          liveShiftNum,
          liveShiftName,
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
  }, [report, machines, workers, rules, settings, selectedShed]);

  // Periodic 45s background live refresh
  useEffect(() => {
    loadSlideData(false);
    const interval = setInterval(() => {
      loadSlideData(true);
    }, 45000);
    return () => clearInterval(interval);
  }, [loadSlideData]);

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
      <div className="min-h-[75vh] flex flex-col items-center justify-center bg-white border-2 border-slate-200 text-stone-900 rounded-3xl p-10 shadow-lg">
        <Activity size={44} className="text-emerald-500 animate-spin mb-4" />
        <h3 className="text-xl font-black uppercase tracking-wider text-stone-800">
          Syncing Live Shift Telemetry...
        </h3>
        <p className="text-xs text-slate-500 mt-1">
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
      {/* 1. TOP CONTROLS & LIVE ROTATION HEADER (Clean White Bar) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white px-6 py-3.5 rounded-2xl border border-slate-200 shadow-md">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-black uppercase tracking-widest text-emerald-700">
              LIVE TV TELEMETRY (1-MIN REFRESH)
            </span>
          </div>
          <span className="text-slate-300">•</span>
          <span className="text-xs font-black uppercase tracking-wider text-slate-800">
            MACHINE {currentIndex + 1} OF {slides.length} ({currentSlide.frameNo})
          </span>
          <span className="text-slate-300">•</span>
          <span className="text-[11px] font-bold text-slate-500 uppercase">
            LIVE {currentSlide.liveShiftName} ({currentSlide.activityWindow})
          </span>
        </div>

        {/* Slide Controls & Timer */}
        <div className="flex items-center gap-3 self-end sm:self-auto">
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
          {(currentSlide.performanceScore < 40 || currentSlide.machineLiveStatus === 'STOPPED') && currentSlide.machineLiveStatus !== 'DOFFING' && (
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
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-5xl sm:text-7xl font-black text-stone-900 tracking-tight leading-none">
                  {currentSlide.frameNo}
                </h1>
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
                currentSlide.isBestPerformer ? "border-emerald-500 shadow-emerald-200/80" : "border-red-500 shadow-red-200/80"
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
                {/* Live Shift Active Badge */}
                <div className="absolute top-4 right-4 px-3.5 py-1.5 rounded-full bg-emerald-500 text-white text-xs font-black uppercase tracking-wider shadow-lg flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                  {currentSlide.liveShiftName}
                </div>
              </div>

              {/* Name & T. NO Box (Directly below the photo) */}
              <div className="w-full max-w-[380px] mt-4 p-5 bg-slate-50 border-2 border-slate-200 rounded-3xl text-center shadow-md">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-0.5">
                  OPERATOR NAME
                </span>
                <h2 className="text-xl sm:text-3xl font-black text-stone-900 uppercase tracking-tight truncate">
                  {currentSlide.operatorName}
                </h2>
                <div className="text-sm sm:text-base font-mono font-black text-emerald-700 mt-1">
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
                    Calculated from {currentSlide.performanceScore}% round cadence
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
                      currentSlide.isBestPerformer 
                        ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                        : "bg-red-100 text-red-800 border-red-300"
                    )}>
                      {currentSlide.isBestPerformer ? 'Best Performer' : 'Lagging Cadence'}
                    </span>
                  </div>

                  {/* Giant Big Score */}
                  <div className="my-2">
                    <span className={cn(
                      "text-6xl sm:text-7xl xl:text-8xl font-black tracking-tight tabular-nums drop-shadow-sm",
                      currentSlide.isBestPerformer ? "text-emerald-600" : "text-red-600"
                    )}>
                      {currentSlide.performanceScore}%
                    </span>
                  </div>

                  <div className="text-xs font-bold text-slate-500">
                    Live shift patrol cadence across LH &amp; RH
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
                    Live End-Mending Patrol Interval
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
                      {currentSlide.activityWindow} <span className="text-xs text-slate-400">({currentSlide.liveShiftName})</span>
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
                    ? (s.isBestPerformer ? "w-8 bg-emerald-500" : "w-8 bg-red-600")
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
