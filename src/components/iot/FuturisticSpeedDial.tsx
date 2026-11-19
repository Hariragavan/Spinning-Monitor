'use client';

import React, { useState, useEffect } from 'react';

export interface FuturisticSpeedDialProps {
  value: number;
  max?: number;
  status: 'RUN' | 'DOFF' | 'STOP' | 'OFFLINE';
  label?: string;
  customUnit?: string;
  size?: number;
  colorScheme?: 'cyan' | 'emerald' | 'amber' | 'rose' | 'indigo';
}

/**
 * Futuristic Tachometer / Speedometer Dial Component (Clean White Edition)
 * Features:
 * - Crisp White pod housing with soft ambient depth
 * - 260° perimeter arc track with vibrant gradient sweep
 * - High-contrast scale numbers: 0, 5, 10, 15, 20
 * - Sharp diamond / spearhead needle indicator
 * - Sweeps smoothly from 0 to current RPM on mount / open
 * - Sweeps down to 0 if machine status is Stopped or Doffing
 * - Reduced gap with bold, prominent digital readout & status indicator
 */
export const FuturisticSpeedDial: React.FC<FuturisticSpeedDialProps> = ({
  value,
  max = 20000,
  status,
  label = 'RPM',
  customUnit,
  size = 132,
  colorScheme = 'cyan'
}) => {
  const isStoppedOrDoffing = status === 'STOP' || status === 'OFFLINE' || status === 'DOFF';
  const targetVal = isStoppedOrDoffing ? 0 : Math.max(0, value);
  const [animatedVal, setAnimatedVal] = useState<number>(0);

  useEffect(() => {
    let animId: number;
    const startVal = animatedVal;
    const endVal = targetVal;
    const duration = 1100; // 1.1s smooth aerodynamic sweep
    const startTime = performance.now();

    const frame = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      // Exponential aerodynamic ease-out
      const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      const current = startVal + (endVal - startVal) * ease;
      setAnimatedVal(current);

      if (progress < 1) {
        animId = requestAnimationFrame(frame);
      }
    };

    animId = requestAnimationFrame(frame);
    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [targetVal]);

  const cx = 65;
  const cy = 65;
  const arcRadius = 48;
  const startDeg = 140;
  const sweepDeg = 260;

  // Fraction of gauge (0 to 1)
  const fraction = max > 0 ? Math.min(1, Math.max(0, animatedVal / max)) : 0;
  const activeAngle = startDeg + fraction * sweepDeg;
  const needleRotation = activeAngle - 270; // 0 deg rotation is straight UP (270 deg)

  // Math helper for polar coordinates (0 deg is 3 o'clock)
  const polarToXY = (deg: number, r: number) => {
    const rad = (deg * Math.PI) / 180;
    return {
      x: cx + r * Math.cos(rad),
      y: cy + r * Math.sin(rad)
    };
  };

  // Background arc (140° to 400°)
  const pBgStart = polarToXY(startDeg, arcRadius);
  const pBgEnd = polarToXY(startDeg + sweepDeg, arcRadius);
  const bgArcPath = `M ${pBgStart.x.toFixed(2)} ${pBgStart.y.toFixed(2)} A ${arcRadius} ${arcRadius} 0 1 1 ${pBgEnd.x.toFixed(2)} ${pBgEnd.y.toFixed(2)}`;

  // Active arc path
  let activeArcPath = '';
  if (fraction > 0.005) {
    const pActiveEnd = polarToXY(activeAngle, arcRadius);
    const largeArcFlag = activeAngle - startDeg > 180 ? 1 : 0;
    activeArcPath = `M ${pBgStart.x.toFixed(2)} ${pBgStart.y.toFixed(2)} A ${arcRadius} ${arcRadius} 0 ${largeArcFlag} 1 ${pActiveEnd.x.toFixed(2)} ${pActiveEnd.y.toFixed(2)}`;
  }

  // Theme palettes matching the speed dial reference
  let gradStart = '#0284c7'; // Sky / Cyan
  let gradEnd = '#2563eb';   // Royal Blue
  let needleGlow = 'rgba(37, 99, 235, 0.35)';
  let needleTipColor = '#0284c7';
  let needleBaseColor = '#1d4ed8';

  if (status === 'STOP' || status === 'OFFLINE') {
    gradStart = '#f87171';
    gradEnd = '#dc2626';
    needleGlow = 'rgba(220, 38, 38, 0.35)';
    needleTipColor = '#ef4444';
    needleBaseColor = '#b91c1c';
  } else if (status === 'DOFF') {
    gradStart = '#fbbf24';
    gradEnd = '#ea580c';
    needleGlow = 'rgba(234, 88, 12, 0.35)';
    needleTipColor = '#f59e0b';
    needleBaseColor = '#c2410c';
  } else if (colorScheme === 'emerald') {
    gradStart = '#10b981';
    gradEnd = '#059669';
    needleGlow = 'rgba(16, 185, 129, 0.35)';
    needleTipColor = '#34d399';
    needleBaseColor = '#047857';
  } else if (colorScheme === 'amber') {
    gradStart = '#fbbf24';
    gradEnd = '#d97706';
    needleGlow = 'rgba(245, 158, 11, 0.35)';
    needleTipColor = '#fbbf24';
    needleBaseColor = '#b45309';
  }

  // Scale markings around the gauge: 0, 5, 10, 15, 20
  const scaleMarks = [
    { label: '0', deg: 140 },
    { label: '5', deg: 205 },
    { label: '10', deg: 270 },
    { label: '15', deg: 335 },
    { label: '20', deg: 400 }
  ];

  // Minor tick lines around the inside of the track
  const minorTicks = Array.from({ length: 21 }, (_, i) => {
    const deg = startDeg + (i / 20) * sweepDeg;
    const pt1 = polarToXY(deg, 42.5);
    const pt2 = polarToXY(deg, 45);
    const isMajor = i % 5 === 0;
    return { deg, pt1, pt2, isMajor };
  });

  // Display value formatting
  let displayString = '';
  if (isStoppedOrDoffing) {
    displayString = '0';
  } else if (customUnit === '%' || customUnit === 'kg' || customUnit === 'min') {
    displayString = animatedVal.toFixed(animatedVal >= 100 ? 0 : 1);
  } else {
    displayString = Math.round(animatedVal).toLocaleString();
  }

  // Status badge details
  let badgeText = 'Running';
  let badgeColor = '#16a34a';
  if (status === 'STOP' || status === 'OFFLINE') {
    badgeText = 'Stopped';
    badgeColor = '#dc2626';
  } else if (status === 'DOFF') {
    badgeText = 'Doffing';
    badgeColor = '#d97706';
  }

  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        flexShrink: 0,
        userSelect: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 130 130"
        style={{ overflow: 'visible', filter: 'drop-shadow(0 2px 6px rgba(0, 0, 0, 0.06))' }}
      >
        <defs>
          {/* Arc Track Gradient */}
          <linearGradient id={`speedArcGrad-${status}-${colorScheme}`} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor={gradStart} />
            <stop offset="100%" stopColor={gradEnd} />
          </linearGradient>

          {/* Needle Diamond Gradient */}
          <linearGradient id={`needleGrad-${status}-${colorScheme}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={needleTipColor} />
            <stop offset="100%" stopColor={needleBaseColor} />
          </linearGradient>

          {/* Glowing Filter */}
          <filter id={`needleGlowFilter-${status}`} x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor={needleGlow} floodOpacity="0.7" />
          </filter>
        </defs>

        {/* 1. White Cockpit Circular Housing */}
        <circle
          cx={cx}
          cy={cy}
          r={62}
          fill="#ffffff"
          stroke="#e2e8f0"
          strokeWidth="1.5"
        />

        {/* Inner subtle track guide rim */}
        <circle
          cx={cx}
          cy={cy}
          r={57}
          fill="none"
          stroke="#f1f5f9"
          strokeWidth="0.8"
        />

        {/* 2. Minor Radial Ticks */}
        {minorTicks.map((t, idx) => (
          <line
            key={`tick-${idx}`}
            x1={t.pt1.x.toFixed(2)}
            y1={t.pt1.y.toFixed(2)}
            x2={t.pt2.x.toFixed(2)}
            y2={t.pt2.y.toFixed(2)}
            stroke={t.isMajor ? '#94a3b8' : '#e2e8f0'}
            strokeWidth={t.isMajor ? '1.5' : '1'}
            strokeLinecap="round"
          />
        ))}

        {/* 3. Inactive Background Arc Track (Crisp light slate on white) */}
        <path
          d={bgArcPath}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth="7.5"
          strokeLinecap="round"
        />

        {/* 4. Active Sweeping Gradient Arc Track */}
        {activeArcPath && (
          <path
            d={activeArcPath}
            fill="none"
            stroke={`url(#speedArcGrad-${status}-${colorScheme})`}
            strokeWidth="7.5"
            strokeLinecap="round"
            filter={`url(#needleGlowFilter-${status})`}
          />
        )}

        {/* 5. Scale Number Markings: 0, 5, 10, 15, 20 (Dark Charcoal for high contrast) */}
        {scaleMarks.map(m => {
          const pt = polarToXY(m.deg, 34);
          return (
            <text
              key={`scale-${m.label}`}
              x={pt.x.toFixed(2)}
              y={(pt.y + 2.8).toFixed(2)}
              textAnchor="middle"
              fill="#475569"
              fontSize="8"
              fontWeight="800"
              fontFamily="system-ui, -apple-system, sans-serif"
            >
              {m.label}
            </text>
          );
        })}

        {/* 6. Rotating Spear / Diamond Needle */}
        <g
          transform={`rotate(${needleRotation.toFixed(2)}, ${cx}, ${cy})`}
          style={{ transition: 'transform 0.05s linear' }}
        >
          {/* Diamond Spear Polygon */}
          <polygon
            points={`${cx},${cy - 44} ${cx + 3.6},${cy - 24} ${cx + 1.2},${cy - 6} ${cx},${cy} ${cx - 1.2},${cy - 6} ${cx - 3.6},${cy - 24}`}
            fill={`url(#needleGrad-${status}-${colorScheme})`}
            filter={`url(#needleGlowFilter-${status})`}
          />
          {/* Subtle center spine for 3D bevel look */}
          <line
            x1={cx}
            y1={cy - 43}
            x2={cx}
            y2={cy}
            stroke="rgba(255, 255, 255, 0.7)"
            strokeWidth="0.8"
          />
          {/* Pivot Circle */}
          <circle
            cx={cx}
            cy={cy}
            r={4.2}
            fill="#ffffff"
            stroke={needleTipColor}
            strokeWidth="1.8"
          />
          <circle
            cx={cx}
            cy={cy}
            r={2}
            fill={needleTipColor}
          />
        </g>

        {/* 7. Center Speed Label (Tight gap) */}
        <text
          x={cx}
          y={cy + 10}
          textAnchor="middle"
          fill="#64748b"
          fontSize="7.5"
          fontWeight="800"
          fontFamily="system-ui, -apple-system, sans-serif"
          letterSpacing="0.08em"
        >
          {label}
        </text>

        {/* 8. Digital Speedometer Readout (Big, High Contrast Bold Text) */}
        <text
          x={cx}
          y={cy + 23}
          textAnchor="middle"
          fill="#0f172a"
          fontSize={displayString.length > 5 ? '15' : displayString.length > 4 ? '16.5' : '18'}
          fontWeight="900"
          fontFamily="system-ui, -apple-system, sans-serif"
          letterSpacing="-0.02em"
        >
          {displayString}
        </text>

        {/* 9. Small Running / Stopped Status Dot Indicator */}
        <g transform={`translate(${cx - 18}, ${cy + 28})`}>
          <circle cx={4} cy={4} r={2.2} fill={badgeColor} />
          <text
            x={10}
            y={6.5}
            fill={badgeColor}
            fontSize="6.5"
            fontWeight="800"
            fontFamily="system-ui, -apple-system, sans-serif"
          >
            {badgeText}
          </text>
        </g>
      </svg>
    </div>
  );
};
