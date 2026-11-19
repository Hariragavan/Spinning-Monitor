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
 * Stylish High-Performance Speedometer Dial (Transparent Edition)
 * Exactly matching the reference speed-test instrument:
 * - Thick, bold 260° perimeter band (140° bottom-left to 400° bottom-right)
 * - Active track with blazing Pink -> Coral -> Orange -> Electric Yellow gradient
 * - Inactive track in sleek dark navy slate (#1e293b) with clean radial cuts
 * - Floating diamond spearhead needle with 3D faceted center spine
 * - Sporty condensed scale numbers (0, 5, 10, 15, 20)
 * - Bold italic 'RPM' label and high-contrast digital speed readout
 * - Completely transparent background (no container box or background pod)
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
  const cy = 54;
  const arcRadius = 42;
  const bandThickness = 11;
  const startAngleDeg = 140;
  const sweepDeg = 260;

  // Fraction (0 to 1)
  const fraction = max > 0 ? Math.min(1, Math.max(0, animatedVal / max)) : 0;

  // Needle rotation from -130° (bottom-left, 0 RPM) to +130° (bottom-right, max RPM)
  const needleRotationDeg = -130 + fraction * sweepDeg;

  // Math helper for polar coordinates (0 deg is 3 o'clock, 90 deg is 6 o'clock)
  const polarToXY = (deg: number, r: number) => {
    const rad = (deg * Math.PI) / 180;
    return {
      x: cx + r * Math.cos(rad),
      y: cy + r * Math.sin(rad)
    };
  };

  // Full 260° background arc: from 140° clockwise to 400°
  const pBgStart = polarToXY(startAngleDeg, arcRadius);
  const pBgEnd = polarToXY(startAngleDeg + sweepDeg, arcRadius);
  const bgArcPath = `M ${pBgStart.x.toFixed(2)} ${pBgStart.y.toFixed(2)} A ${arcRadius} ${arcRadius} 0 1 1 ${pBgEnd.x.toFixed(2)} ${pBgEnd.y.toFixed(2)}`;

  // Active arc path (from 140° to current angle)
  let activeArcPath = '';
  if (fraction > 0.005) {
    const activeAngle = startAngleDeg + fraction * sweepDeg;
    const pActiveEnd = polarToXY(activeAngle, arcRadius);
    const largeArc = fraction * sweepDeg > 180 ? 1 : 0;
    activeArcPath = `M ${pBgStart.x.toFixed(2)} ${pBgStart.y.toFixed(2)} A ${arcRadius} ${arcRadius} 0 ${largeArc} 1 ${pActiveEnd.x.toFixed(2)} ${pActiveEnd.y.toFixed(2)}`;
  }

  // Scale markings placed cleanly along inside perimeter: 0, 5, 10, 15, 20
  const scaleMarks = [
    { label: '0', x: 40, y: 72 },
    { label: '5', x: 37, y: 44 },
    { label: '10', x: 65, y: 27 },
    { label: '15', x: 93, y: 44 },
    { label: '20', x: 90, y: 72 }
  ];

  // Display value formatting
  let displayString = '';
  if (isStoppedOrDoffing) {
    displayString = '0';
  } else if (customUnit === '%' || customUnit === 'kg' || customUnit === 'min') {
    displayString = animatedVal.toFixed(animatedVal >= 100 ? 0 : 1);
  } else {
    displayString = Math.round(animatedVal).toLocaleString();
  }

  // Dynamic needle color based on current fraction / status
  let needleTipColor = '#fde047'; // Electric yellow
  let needleBaseColor = 'rgba(234, 88, 12, 0.4)';
  if (status === 'STOP' || status === 'OFFLINE') {
    needleTipColor = '#f43f5e';
    needleBaseColor = 'rgba(225, 29, 72, 0.3)';
  } else if (status === 'DOFF') {
    needleTipColor = '#fb923c';
    needleBaseColor = 'rgba(234, 88, 12, 0.3)';
  } else if (fraction < 0.3) {
    needleTipColor = '#f43f5e';
    needleBaseColor = 'rgba(225, 29, 72, 0.3)';
  } else if (fraction < 0.6) {
    needleTipColor = '#fb923c';
    needleBaseColor = 'rgba(249, 115, 22, 0.3)';
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
        viewBox="0 0 130 96"
        style={{ overflow: 'visible' }}
      >
        <defs>
          {/* Active Gradient: Pink -> Coral -> Orange -> Electric Yellow (Exact Match to Reference) */}
          <linearGradient id="speedDialStylishGrad" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ec4899" />
            <stop offset="20%" stopColor="#f43f5e" />
            <stop offset="50%" stopColor="#f97316" />
            <stop offset="80%" stopColor="#facc15" />
            <stop offset="100%" stopColor="#fde047" />
          </linearGradient>

          {/* Floating Diamond Needle Gradient */}
          <linearGradient id="stylishNeedleGrad" x1="0%" y1="0%" x2="0%" y2="1">
            <stop offset="0%" stopColor={needleTipColor} />
            <stop offset="100%" stopColor={needleBaseColor} />
          </linearGradient>

          {/* Subtle Glow Filter for Needle */}
          <filter id="stylishNeedleGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="0" stdDeviation="1.5" floodColor={needleTipColor} floodOpacity="0.5" />
          </filter>
        </defs>

        {/* 1. Inactive Thick Band Track (Sleek Dark Navy Slate with flat radial ends) */}
        <path
          d={bgArcPath}
          fill="none"
          stroke="#1e293b"
          strokeWidth={bandThickness}
          strokeLinecap="butt"
        />

        {/* 2. Active Thick Band Track (Blazing Pink -> Orange -> Yellow Gradient) */}
        {activeArcPath && (
          <path
            d={activeArcPath}
            fill="none"
            stroke="url(#speedDialStylishGrad)"
            strokeWidth={bandThickness}
            strokeLinecap="butt"
          />
        )}

        {/* 3. Scale Number Markings: 0, 5, 10, 15, 20 (Bold Sporty Condensed Typography) */}
        {scaleMarks.map(m => (
          <text
            key={`scale-${m.label}`}
            x={m.x}
            y={m.y}
            textAnchor="middle"
            fill="#0f172a"
            fontSize="8"
            fontWeight="900"
            fontFamily='"Arial Black", "Barlow Condensed", system-ui, sans-serif'
          >
            {m.label}
          </text>
        ))}

        {/* 4. Floating Diamond Spear Needle (No Pivot Circle, 3D Faceted Spine) */}
        <g
          transform={`rotate(${needleRotationDeg.toFixed(2)}, ${cx}, ${cy})`}
          style={{ transition: 'transform 0.05s linear' }}
        >
          {/* Diamond Polygon */}
          <polygon
            points={`${cx},${cy - 33} ${cx + 3.4},${cy - 19} ${cx},${cy - 6} ${cx - 3.4},${cy - 19}`}
            fill="url(#stylishNeedleGrad)"
            filter="url(#stylishNeedleGlow)"
          />
          {/* Center 3D Facet Spine */}
          <line
            x1={cx}
            y1={cy - 32}
            x2={cx}
            y2={cy - 7}
            stroke="rgba(255, 255, 255, 0.75)"
            strokeWidth="0.8"
          />
        </g>

        {/* 5. Center Label: Italic Sporty 'RPM' */}
        <text
          x={cx}
          y={cy + 13}
          textAnchor="middle"
          fill="#64748b"
          fontSize="7.5"
          fontWeight="900"
          fontStyle="italic"
          fontFamily='"Arial Black", system-ui, sans-serif'
          letterSpacing="0.08em"
        >
          {label}
        </text>

        {/* 6. Digital Readout: Big High-Contrast Bold Number */}
        <text
          x={cx}
          y={cy + 28}
          textAnchor="middle"
          fill="#0f172a"
          fontSize={displayString.length > 5 ? '16' : displayString.length > 4 ? '17.5' : '19'}
          fontWeight="900"
          fontFamily='system-ui, -apple-system, sans-serif'
          letterSpacing="-0.02em"
        >
          {displayString}
        </text>
      </svg>
    </div>
  );
};
