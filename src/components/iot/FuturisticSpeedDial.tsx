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
 * Half-Circle Tachometer / Speedometer Dial Component (No Background Edition)
 * Features:
 * - Transparent background (no container pod)
 * - 180° Half-circle arch from left (180°) to right (0°)
 * - Vibrant color gradient scaling from low light red -> orange -> yellow -> high light green
 * - Needle indicator rotating smoothly along the 180° arc
 * - Center RPM label and prominent digital readout below the half circle
 * - No status badge under RPM (clean uncluttered layout)
 */
export const FuturisticSpeedDial: React.FC<FuturisticSpeedDialProps> = ({
  value,
  max = 20000,
  status,
  label = 'RPM',
  customUnit,
  size = 132
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
  const cy = 60;
  const arcRadius = 45;

  // Fraction (0 to 1)
  const fraction = max > 0 ? Math.min(1, Math.max(0, animatedVal / max)) : 0;

  // In half circle, 0 fraction is 180° (left), 1 fraction is 0° (right)
  // Rotating needle from -90° (left, 0 RPM) to +90° (right, max RPM)
  const needleRotationDeg = -90 + fraction * 180;

  // Background 180° half-circle arc: from (cx - r, cy) to (cx + r, cy)
  const bgArcStart = { x: cx - arcRadius, y: cy };
  const bgArcEnd = { x: cx + arcRadius, y: cy };
  const bgArcPath = `M ${bgArcStart.x} ${bgArcStart.y} A ${arcRadius} ${arcRadius} 0 0 1 ${bgArcEnd.x} ${bgArcEnd.y}`;

  // Active arc path (from fraction 0 to current fraction)
  let activeArcPath = '';
  if (fraction > 0.005) {
    const rad = (fraction * 180 * Math.PI) / 180;
    // Current point: x = cx - r * cos(rad), y = cy - r * sin(rad)
    const curX = cx - arcRadius * Math.cos(rad);
    const curY = cy - arcRadius * Math.sin(rad);
    activeArcPath = `M ${bgArcStart.x} ${bgArcStart.y} A ${arcRadius} ${arcRadius} 0 0 1 ${curX.toFixed(2)} ${curY.toFixed(2)}`;
  }

  // Scale markings around half circle: 0, 5, 10, 15, 20
  const scaleMarks = [
    { label: '0', x: cx - arcRadius - 4, y: cy + 11 },
    { label: '5', x: 38, y: 31 },
    { label: '10', x: 65, y: 19 },
    { label: '15', x: 92, y: 31 },
    { label: '20', x: cx + arcRadius + 4, y: cy + 11 }
  ];

  // Minor ticks around the half circle (17 ticks from 0 to 180°)
  const ticks = Array.from({ length: 17 }, (_, i) => {
    const f = i / 16;
    const rad = (f * 180 * Math.PI) / 180;
    const isMajor = i % 4 === 0;
    const r1 = isMajor ? arcRadius - 7 : arcRadius - 4.5;
    const r2 = arcRadius - 1.5;
    return {
      x1: cx - r1 * Math.cos(rad),
      y1: cy - r1 * Math.sin(rad),
      x2: cx - r2 * Math.cos(rad),
      y2: cy - r2 * Math.sin(rad),
      isMajor
    };
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

  // Needle color dynamic based on speed / status
  let needleColor = '#16a34a'; // Green for good running
  if (status === 'STOP' || status === 'OFFLINE') {
    needleColor = '#ef4444';
  } else if (status === 'DOFF') {
    needleColor = '#f59e0b';
  } else if (fraction < 0.25) {
    needleColor = '#f87171';
  } else if (fraction < 0.6) {
    needleColor = '#f59e0b';
  }

  const height = Math.round(size * 0.74);

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
        viewBox="0 0 130 92"
        style={{ overflow: 'visible' }}
      >
        <defs>
          {/* Half-meter scaling gradient: Low Red -> Light Orange -> Yellow -> High Light Green */}
          <linearGradient id="halfMeterGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#f87171" />
            <stop offset="25%" stopColor="#fb923c" />
            <stop offset="50%" stopColor="#facc15" />
            <stop offset="78%" stopColor="#86efac" />
            <stop offset="100%" stopColor="#22c55e" />
          </linearGradient>

          {/* Needle Filter */}
          <filter id="halfMeterNeedleGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="0" stdDeviation="1.5" floodColor={needleColor} floodOpacity="0.35" />
          </filter>
        </defs>

        {/* 1. Inactive Background Track (Soft Light Slate, with no card pod bg) */}
        <path
          d={bgArcPath}
          fill="none"
          stroke="rgba(0, 0, 0, 0.08)"
          strokeWidth="7"
          strokeLinecap="round"
        />

        {/* 2. Soft Colored Scaling Track Preview */}
        <path
          d={bgArcPath}
          fill="none"
          stroke="url(#halfMeterGrad)"
          strokeWidth="6"
          strokeLinecap="round"
          opacity="0.35"
        />

        {/* 3. Minor Ticks on inside */}
        {ticks.map((t, idx) => (
          <line
            key={`tick-${idx}`}
            x1={t.x1.toFixed(2)}
            y1={t.y1.toFixed(2)}
            x2={t.x2.toFixed(2)}
            y2={t.y2.toFixed(2)}
            stroke={t.isMajor ? '#94a3b8' : 'rgba(0, 0, 0, 0.12)'}
            strokeWidth={t.isMajor ? '1.5' : '1'}
            strokeLinecap="round"
          />
        ))}

        {/* 4. Active Sweeping Gradient Arc Track (Vibrant Red to Green) */}
        {activeArcPath && (
          <path
            d={activeArcPath}
            fill="none"
            stroke="url(#halfMeterGrad)"
            strokeWidth="7"
            strokeLinecap="round"
          />
        )}

        {/* 5. Scale Numbers: 0, 5, 10, 15, 20 */}
        {scaleMarks.map(m => (
          <text
            key={`scale-${m.label}`}
            x={m.x}
            y={m.y}
            textAnchor="middle"
            fill="#64748b"
            fontSize="7.5"
            fontWeight="800"
            fontFamily="system-ui, -apple-system, sans-serif"
          >
            {m.label}
          </text>
        ))}

        {/* 6. Rotating Spear Needle */}
        <g
          transform={`rotate(${needleRotationDeg.toFixed(2)}, ${cx}, ${cy})`}
          style={{ transition: 'transform 0.05s linear' }}
        >
          {/* Diamond Spear Needle */}
          <polygon
            points={`${cx},${cy - 40} ${cx + 3},${cy - 20} ${cx + 1},${cy - 5} ${cx},${cy} ${cx - 1},${cy - 5} ${cx - 3},${cy - 20}`}
            fill={needleColor}
            filter="url(#halfMeterNeedleGlow)"
          />
          {/* Center spine */}
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

        {/* 7. Parameter Label: RPM below the needle pivot */}
        <text
          x={cx}
          y={cy + 13}
          textAnchor="middle"
          fill="#64748b"
          fontSize="7.5"
          fontWeight="800"
          fontFamily="system-ui, -apple-system, sans-serif"
          letterSpacing="0.08em"
        >
          {label}
        </text>

        {/* 8. Digital Readout: Big Bold RPM Number */}
        <text
          x={cx}
          y={cy + 28}
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
