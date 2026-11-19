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
 * Futuristic Tachometer / Speedometer Dial Component
 * Designed after modern automotive & speed-test dials:
 * - Dark cockpit pod background
 * - 260° perimeter arc track with vibrant gradient
 * - Scale numbers: 0, 5, 10, 15, 20
 * - Sharp diamond / spearhead needle indicator
 * - Sweeps smoothly from 0 to current RPM on mount / open
 * - Sweeps down to 0 if machine status is Stopped or Doffing
 * - High-contrast center digital readout with status indicator
 */
export const FuturisticSpeedDial: React.FC<FuturisticSpeedDialProps> = ({
  value,
  max = 20000,
  status,
  label = 'RPM',
  customUnit,
  size = 126,
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
  let gradStart = '#06b6d4'; // Cyan
  let gradEnd = '#2563eb';   // Royal Blue
  let needleGlow = 'rgba(6, 182, 212, 0.5)';
  let needleTipColor = '#38bdf8';
  let needleBaseColor = '#1d4ed8';

  if (status === 'STOP' || status === 'OFFLINE') {
    gradStart = '#fb7185';
    gradEnd = '#e11d48';
    needleGlow = 'rgba(225, 29, 72, 0.5)';
    needleTipColor = '#f43f5e';
    needleBaseColor = '#9f1239';
  } else if (status === 'DOFF') {
    gradStart = '#fde047';
    gradEnd = '#ea580c';
    needleGlow = 'rgba(234, 88, 12, 0.5)';
    needleTipColor = '#f59e0b';
    needleBaseColor = '#c2410c';
  } else if (colorScheme === 'emerald') {
    gradStart = '#34d399';
    gradEnd = '#059669';
    needleGlow = 'rgba(16, 185, 129, 0.5)';
    needleTipColor = '#34d399';
    needleBaseColor = '#047857';
  } else if (colorScheme === 'amber') {
    gradStart = '#fbbf24';
    gradEnd = '#d97706';
    needleGlow = 'rgba(245, 158, 11, 0.5)';
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
  let badgeColor = '#22c55e';
  if (status === 'STOP' || status === 'OFFLINE') {
    badgeText = 'Stopped';
    badgeColor = '#ef4444';
  } else if (status === 'DOFF') {
    badgeText = 'Doffing';
    badgeColor = '#f59e0b';
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
        style={{ overflow: 'visible', filter: 'drop-shadow(0 4px 10px rgba(0, 0, 0, 0.18))' }}
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
          <filter id={`needleGlowFilter-${status}`} x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor={needleGlow} floodOpacity="0.8" />
          </filter>
        </defs>

        {/* 1. Dark Cockpit Circular Housing */}
        <circle
          cx={cx}
          cy={cy}
          r={62}
          fill="#0b1329"
          stroke="#1e293b"
          strokeWidth="1.5"
        />

        {/* Inner subtle glow rim */}
        <circle
          cx={cx}
          cy={cy}
          r={57}
          fill="none"
          stroke="#1e293b"
          strokeWidth="0.8"
          strokeDasharray="2 3"
          opacity="0.6"
        />

        {/* 2. Minor Radial Ticks */}
        {minorTicks.map((t, idx) => (
          <line
            key={`tick-${idx}`}
            x1={t.pt1.x.toFixed(2)}
            y1={t.pt1.y.toFixed(2)}
            x2={t.pt2.x.toFixed(2)}
            y2={t.pt2.y.toFixed(2)}
            stroke={t.isMajor ? '#64748b' : '#334155'}
            strokeWidth={t.isMajor ? '1.5' : '0.9'}
            strokeLinecap="round"
          />
        ))}

        {/* 3. Inactive Background Arc Track */}
        <path
          d={bgArcPath}
          fill="none"
          stroke="#1e293b"
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

        {/* 5. Scale Number Markings: 0, 5, 10, 15, 20 */}
        {scaleMarks.map(m => {
          const pt = polarToXY(m.deg, 34);
          return (
            <text
              key={`scale-${m.label}`}
              x={pt.x.toFixed(2)}
              y={(pt.y + 2.8).toFixed(2)}
              textAnchor="middle"
              fill="#94a3b8"
              fontSize="7.5"
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
            stroke="rgba(255, 255, 255, 0.45)"
            strokeWidth="0.8"
          />
          {/* Pivot Circle */}
          <circle
            cx={cx}
            cy={cy}
            r={4.2}
            fill="#0b1329"
            stroke={needleTipColor}
            strokeWidth="1.6"
          />
          <circle
            cx={cx}
            cy={cy}
            r={1.8}
            fill="#ffffff"
          />
        </g>

        {/* 7. Center Speed Label (e.g. RPM / SPEED TEST) */}
        <text
          x={cx}
          y={cy + 13}
          textAnchor="middle"
          fill="#94a3b8"
          fontSize="7"
          fontWeight="800"
          fontFamily="system-ui, -apple-system, sans-serif"
          letterSpacing="0.08em"
        >
          {label}
        </text>

        {/* 8. Digital Speedometer Readout */}
        <text
          x={cx}
          y={cy + 25}
          textAnchor="middle"
          fill="#ffffff"
          fontSize={displayString.length > 5 ? '13' : displayString.length > 4 ? '14.5' : '16'}
          fontWeight="900"
          fontFamily="system-ui, -apple-system, sans-serif"
          letterSpacing="-0.02em"
        >
          {displayString}
        </text>

        {/* 9. Small Running / Stopped Status Dot Indicator */}
        <g transform={`translate(${cx - 18}, ${cy + 30})`}>
          <circle cx={4} cy={4} r={2.2} fill={badgeColor} />
          <text
            x={10}
            y={6.5}
            fill={badgeColor}
            fontSize="6.2"
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
