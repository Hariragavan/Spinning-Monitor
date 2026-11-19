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
 * Styled after modern automotive & speed-test instruments:
 * - 240° open gauge arch (150° bottom-left to 390° bottom-right)
 * - Transparent background (no container pod)
 * - Color scaling from low speed (Pink/Red) -> Mid (Orange/Yellow) -> High (Green)
 * - Inactive track in soft slate; active track filled up to current speed
 * - Diamond spear needle rotating smoothly with aerodynamic easing
 * - Center RPM label and prominent digital readout below the pivot
 * - No redundant status badge under RPM
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
  const cy = 56;
  const arcRadius = 45;
  const startAngleDeg = 150;
  const sweepDeg = 240;

  // Fraction (0 to 1)
  const fraction = max > 0 ? Math.min(1, Math.max(0, animatedVal / max)) : 0;

  // Needle rotation from -120° (bottom-left, 0 RPM) to +120° (bottom-right, max RPM)
  const needleRotationDeg = -120 + fraction * sweepDeg;

  // Math helper for polar coordinates (0 deg is 3 o'clock, 90 deg is 6 o'clock)
  const polarToXY = (deg: number, r: number) => {
    const rad = (deg * Math.PI) / 180;
    return {
      x: cx + r * Math.cos(rad),
      y: cy + r * Math.sin(rad)
    };
  };

  // Full 240° background arc: from 150° clockwise to 390°
  const pBgStart = polarToXY(startAngleDeg, arcRadius);
  const pBgEnd = polarToXY(startAngleDeg + sweepDeg, arcRadius);
  const bgArcPath = `M ${pBgStart.x.toFixed(2)} ${pBgStart.y.toFixed(2)} A ${arcRadius} ${arcRadius} 0 1 1 ${pBgEnd.x.toFixed(2)} ${pBgEnd.y.toFixed(2)}`;

  // Active arc path (from 150° to current angle)
  let activeArcPath = '';
  if (fraction > 0.005) {
    const activeAngle = startAngleDeg + fraction * sweepDeg;
    const pActiveEnd = polarToXY(activeAngle, arcRadius);
    const largeArc = fraction * sweepDeg > 180 ? 1 : 0;
    activeArcPath = `M ${pBgStart.x.toFixed(2)} ${pBgStart.y.toFixed(2)} A ${arcRadius} ${arcRadius} 0 ${largeArc} 1 ${pActiveEnd.x.toFixed(2)} ${pActiveEnd.y.toFixed(2)}`;
  }

  // Scale markings around the inside of the gauge: 0, 5, 10, 15, 20
  const scaleMarks = [
    { label: '0', deg: 150, x: 36, y: 72 },
    { label: '5', deg: 210, x: 36, y: 40 },
    { label: '10', deg: 270, x: 65, y: 25 },
    { label: '15', deg: 330, x: 94, y: 40 },
    { label: '20', deg: 390, x: 94, y: 72 }
  ];

  // Minor tick lines around the inside of the track
  const minorTicks = Array.from({ length: 21 }, (_, i) => {
    const deg = startAngleDeg + (i / 20) * sweepDeg;
    const pt1 = polarToXY(deg, 39);
    const pt2 = polarToXY(deg, 42.5);
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

  // Dynamic needle color based on current fraction
  let needleColor = '#22c55e'; // Green for high speed
  if (status === 'STOP' || status === 'OFFLINE') {
    needleColor = '#ef4444';
  } else if (status === 'DOFF') {
    needleColor = '#f59e0b';
  } else if (fraction < 0.25) {
    needleColor = '#f43f5e';
  } else if (fraction < 0.55) {
    needleColor = '#fb923c';
  } else if (fraction < 0.78) {
    needleColor = '#eab308';
  }

  const height = Math.round(size * 0.76);

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
        viewBox="0 0 130 100"
        style={{ overflow: 'visible' }}
      >
        <defs>
          {/* Low to High Speed Gradient matching speed test instrument presets */}
          <linearGradient id="speedDialMultiGrad" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#f43f5e" />
            <stop offset="28%" stopColor="#fb923c" />
            <stop offset="55%" stopColor="#facc15" />
            <stop offset="82%" stopColor="#86efac" />
            <stop offset="100%" stopColor="#22c55e" />
          </linearGradient>

          {/* Needle Drop Shadow Filter */}
          <filter id="speedNeedleGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="0" stdDeviation="1.5" floodColor={needleColor} floodOpacity="0.35" />
          </filter>
        </defs>

        {/* 1. Inactive Background Arc Track (Soft Slate, No Pod Box) */}
        <path
          d={bgArcPath}
          fill="none"
          stroke="rgba(0, 0, 0, 0.08)"
          strokeWidth="7.5"
          strokeLinecap="round"
        />

        {/* 2. Soft Colored Scaling Track Preview */}
        <path
          d={bgArcPath}
          fill="none"
          stroke="url(#speedDialMultiGrad)"
          strokeWidth="6.5"
          strokeLinecap="round"
          opacity="0.22"
        />

        {/* 3. Radial Ticks */}
        {minorTicks.map((t, idx) => (
          <line
            key={`tick-${idx}`}
            x1={t.pt1.x.toFixed(2)}
            y1={t.pt1.y.toFixed(2)}
            x2={t.pt2.x.toFixed(2)}
            y2={t.pt2.y.toFixed(2)}
            stroke={t.isMajor ? '#94a3b8' : 'rgba(0, 0, 0, 0.12)'}
            strokeWidth={t.isMajor ? '1.5' : '1'}
            strokeLinecap="round"
          />
        ))}

        {/* 4. Active Sweeping Gradient Arc Track (Low Pink/Red -> Mid Orange/Yellow -> High Green) */}
        {activeArcPath && (
          <path
            d={activeArcPath}
            fill="none"
            stroke="url(#speedDialMultiGrad)"
            strokeWidth="7.5"
            strokeLinecap="round"
          />
        )}

        {/* 5. Scale Number Markings: 0, 5, 10, 15, 20 */}
        {scaleMarks.map(m => (
          <text
            key={`scale-${m.label}`}
            x={m.x}
            y={m.y}
            textAnchor="middle"
            fill="#64748b"
            fontSize="8"
            fontWeight="800"
            fontFamily="system-ui, -apple-system, sans-serif"
          >
            {m.label}
          </text>
        ))}

        {/* 6. Rotating Spear / Diamond Needle */}
        <g
          transform={`rotate(${needleRotationDeg.toFixed(2)}, ${cx}, ${cy})`}
          style={{ transition: 'transform 0.05s linear' }}
        >
          {/* Diamond Spear Polygon */}
          <polygon
            points={`${cx},${cy - 39} ${cx + 3.2},${cy - 19} ${cx + 1},${cy - 5} ${cx},${cy} ${cx - 1},${cy - 5} ${cx - 3.2},${cy - 19}`}
            fill={needleColor}
            filter="url(#speedNeedleGlow)"
          />
          {/* Center spine highlight */}
          <line
            x1={cx}
            y1={cy - 38}
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

        {/* 7. Center Speed Parameter Label */}
        <text
          x={cx}
          y={cy + 14}
          textAnchor="middle"
          fill="#64748b"
          fontSize="7.5"
          fontWeight="800"
          fontFamily="system-ui, -apple-system, sans-serif"
          letterSpacing="0.08em"
        >
          {label}
        </text>

        {/* 8. Digital Speed Readout (Big Bold Text) */}
        <text
          x={cx}
          y={cy + 29}
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
