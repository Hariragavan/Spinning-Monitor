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
 * Modern Horseshoe Speedometer Dial Component
 * Designed after modern automotive & high-speed test gauges:
 * - Horseshoe 260° sweep arc (bottom-left to bottom-right)
 * - Color gradient scaling from Low Speed (Red) -> Orange -> Yellow -> High Speed (Green)
 * - Active arc fills dynamically up to current speed with gradient
 * - Sleek diamond spear needle with aerodynamic sweep animation
 * - Radial scale markings: 0, 5, 10, 15, 20
 * - Center RPM label and prominent digital readout below the needle pivot
 * - Completely transparent (no outer pod background)
 */
export const FuturisticSpeedDial: React.FC<FuturisticSpeedDialProps> = ({
  value,
  max = 20000,
  status,
  label = 'RPM',
  customUnit,
  size = 128
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
  const cy = 56;
  const arcRadius = 45;
  const startDeg = 140;
  const sweepDeg = 260;

  // Fraction (0 to 1)
  const fraction = max > 0 ? Math.min(1, Math.max(0, animatedVal / max)) : 0;

  // Horseshoe arc coordinates
  const pBgStart = {
    x: cx + arcRadius * Math.cos((startDeg * Math.PI) / 180),
    y: cy + arcRadius * Math.sin((startDeg * Math.PI) / 180)
  };
  const pBgEnd = {
    x: cx + arcRadius * Math.cos(((startDeg + sweepDeg) * Math.PI) / 180),
    y: cy + arcRadius * Math.sin(((startDeg + sweepDeg) * Math.PI) / 180)
  };

  // Background 260° arc path (over the top)
  const bgArcPath = `M ${pBgStart.x.toFixed(2)} ${pBgStart.y.toFixed(2)} A ${arcRadius} ${arcRadius} 0 1 1 ${pBgEnd.x.toFixed(2)} ${pBgEnd.y.toFixed(2)}`;

  // Active arc path from startDeg up to activeAngle
  let activeArcPath = '';
  if (fraction > 0.005) {
    const activeAngle = startDeg + fraction * sweepDeg;
    const pActiveEnd = {
      x: cx + arcRadius * Math.cos((activeAngle * Math.PI) / 180),
      y: cy + arcRadius * Math.sin((activeAngle * Math.PI) / 180)
    };
    const isLarge = fraction * sweepDeg > 180 ? 1 : 0;
    activeArcPath = `M ${pBgStart.x.toFixed(2)} ${pBgStart.y.toFixed(2)} A ${arcRadius} ${arcRadius} 0 ${isLarge} 1 ${pActiveEnd.x.toFixed(2)} ${pActiveEnd.y.toFixed(2)}`;
  }

  // Needle rotation: -130° at fraction 0 (points to 140°), +130° at fraction 1 (points to 400°)
  const needleRotationDeg = -130 + fraction * 260;

  // Scale numbers inside the arc: 0, 5, 10, 15, 20
  const scaleMarks = [
    { label: '0', x: 33, y: 84 },
    { label: '5', x: 32, y: 56 },
    { label: '10', x: 65, y: 28 },
    { label: '15', x: 98, y: 56 },
    { label: '20', x: 97, y: 84 }
  ];

  // Minor tick lines around the inside of the track (17 ticks)
  const minorTicks = Array.from({ length: 17 }, (_, i) => {
    const f = i / 16;
    const deg = startDeg + f * sweepDeg;
    const rad = (deg * Math.PI) / 180;
    const isMajor = i % 4 === 0;
    const r1 = isMajor ? arcRadius - 8 : arcRadius - 5.5;
    const r2 = arcRadius - 2;
    return {
      x1: cx + r1 * Math.cos(rad),
      y1: cy + r1 * Math.sin(rad),
      x2: cx + r2 * Math.cos(rad),
      y2: cy + r2 * Math.sin(rad),
      isMajor
    };
  });

  // Dynamic needle color based on current speed
  let needleColor = '#22c55e'; // Green for high running speed
  if (status === 'STOP' || status === 'OFFLINE') {
    needleColor = '#ef4444';
  } else if (status === 'DOFF') {
    needleColor = '#f59e0b';
  } else if (fraction < 0.25) {
    needleColor = '#ef4444'; // Red for low
  } else if (fraction < 0.55) {
    needleColor = '#f59e0b'; // Amber for mid
  } else if (fraction < 0.8) {
    needleColor = '#84cc16'; // Lime
  }

  // Value display formatting
  let displayString = '';
  if (isStoppedOrDoffing) {
    displayString = '0';
  } else if (customUnit === '%' || customUnit === 'kg' || customUnit === 'min') {
    displayString = animatedVal.toFixed(animatedVal >= 100 ? 0 : 1);
  } else {
    displayString = Math.round(animatedVal).toLocaleString();
  }

  const height = Math.round(size * 0.82);

  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: height,
        flexShrink: 0,
        userSelect: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <svg
        width={size}
        height={height}
        viewBox="0 0 130 104"
        style={{ overflow: 'visible' }}
      >
        <defs>
          {/* Low (Red) -> Mid (Yellow) -> High (Green) Scaling Gradient */}
          <linearGradient id="speedMeterArcGrad" x1="0%" y1="100%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="25%" stopColor="#f97316" />
            <stop offset="50%" stopColor="#eab308" />
            <stop offset="78%" stopColor="#84cc16" />
            <stop offset="100%" stopColor="#22c55e" />
          </linearGradient>

          {/* Needle Glow */}
          <filter id="speedNeedleFilter" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="0" stdDeviation="1.8" floodColor={needleColor} floodOpacity="0.45" />
          </filter>
        </defs>

        {/* 1. Inactive Background Track (Soft Light Slate Band) */}
        <path
          d={bgArcPath}
          fill="none"
          stroke="rgba(0, 0, 0, 0.08)"
          strokeWidth="9.5"
          strokeLinecap="round"
        />

        {/* 2. Soft Gradient Preview under the track */}
        <path
          d={bgArcPath}
          fill="none"
          stroke="url(#speedMeterArcGrad)"
          strokeWidth="9"
          strokeLinecap="round"
          opacity="0.25"
        />

        {/* 3. Radial Ticks */}
        {minorTicks.map((t, idx) => (
          <line
            key={`tick-${idx}`}
            x1={t.x1.toFixed(2)}
            y1={t.y1.toFixed(2)}
            x2={t.x2.toFixed(2)}
            y2={t.y2.toFixed(2)}
            stroke={t.isMajor ? '#64748b' : 'rgba(0, 0, 0, 0.15)'}
            strokeWidth={t.isMajor ? '1.5' : '1'}
            strokeLinecap="round"
          />
        ))}

        {/* 4. Active Sweeping Gradient Track (Vibrant Red -> Orange -> Yellow -> Green) */}
        {activeArcPath && (
          <path
            d={activeArcPath}
            fill="none"
            stroke="url(#speedMeterArcGrad)"
            strokeWidth="9.5"
            strokeLinecap="round"
          />
        )}

        {/* 5. Scale Markings: 0, 5, 10, 15, 20 */}
        {scaleMarks.map(m => (
          <text
            key={`scale-${m.label}`}
            x={m.x}
            y={m.y}
            textAnchor="middle"
            fill="#475569"
            fontSize="7.5"
            fontWeight="800"
            fontFamily="system-ui, -apple-system, sans-serif"
          >
            {m.label}
          </text>
        ))}

        {/* 6. Rotating Diamond Spear Needle */}
        <g
          transform={`rotate(${needleRotationDeg.toFixed(2)}, ${cx}, ${cy})`}
          style={{ transition: 'transform 0.05s linear' }}
        >
          {/* Diamond Spear Polygon */}
          <polygon
            points={`${cx},${cy - 40} ${cx + 3.2},${cy - 20} ${cx + 1.2},${cy - 5} ${cx},${cy} ${cx - 1.2},${cy - 5} ${cx - 3.2},${cy - 20}`}
            fill={needleColor}
            filter="url(#speedNeedleFilter)"
          />
          {/* Center 3D Spine */}
          <line
            x1={cx}
            y1={cy - 39}
            x2={cx}
            y2={cy}
            stroke="rgba(255, 255, 255, 0.85)"
            strokeWidth="0.8"
          />
          {/* Pivot Circle */}
          <circle
            cx={cx}
            cy={cy}
            r={3.8}
            fill="#ffffff"
            stroke={needleColor}
            strokeWidth="1.8"
          />
          <circle
            cx={cx}
            cy={cy}
            r={1.6}
            fill={needleColor}
          />
        </g>

        {/* 7. Center RPM Label below the needle pivot */}
        <text
          x={cx}
          y={cy + 15}
          textAnchor="middle"
          fill="#64748b"
          fontSize="7.5"
          fontWeight="800"
          fontFamily="system-ui, -apple-system, sans-serif"
          letterSpacing="0.08em"
        >
          {label}
        </text>

        {/* 8. Digital Speedometer Readout: Big High-Contrast Bold Text */}
        <text
          x={cx}
          y={cy + 30}
          textAnchor="middle"
          fill="#0f172a"
          fontSize={displayString.length > 5 ? '15.5' : displayString.length > 4 ? '17' : '18.5'}
          fontWeight="900"
          fontFamily="system-ui, -apple-system, sans-serif"
          letterSpacing="-0.02em"
        >
          {displayString}
        </text>
      </svg>
    </div>
  );
};
