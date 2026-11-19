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
 * Stylish High-Performance Speedometer Dial (Blue Dynamic Theme)
 * Exactly matching the reference speed-test instrument:
 * - Thick, bold 260° perimeter band (140° bottom-left to 400° bottom-right)
 * - Active track with Blue shades: Low speed in light blue -> High speed in deep rich royal blue
 * - Inactive track in light frosted white with opacity (rgba(255, 255, 255, 0.85)) with subtle crisp underlay
 * - Large spacious circular meter filling available space
 * - Floating diamond spearhead needle with 3D faceted center spine and electric blue glow
 * - Bold sporty scale numbers (0, 5, 10, 15, 20)
 * - Prominent RPM digital number & label placed cleanly BELOW the meter
 * - Completely transparent background (no container box or background pod)
 */
export const FuturisticSpeedDial: React.FC<FuturisticSpeedDialProps> = ({
  value,
  max = 20000,
  status,
  label = 'RPM',
  customUnit,
  size = 140
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

  const cx = 70;
  const cy = 48;
  const arcRadius = 46;
  const bandThickness = 12;
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
    { label: '0', x: 44, y: 72 },
    { label: '5', x: 41, y: 44 },
    { label: '10', x: 70, y: 24 },
    { label: '15', x: 99, y: 44 },
    { label: '20', x: 96, y: 72 }
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

  // Needle color theme: vibrant glowing cyan-blue
  const needleTipColor = '#38bdf8'; // Electric sky cyan
  const needleBodyColor = '#0284c7'; // Rich bright blue
  const needleBaseColor = 'rgba(29, 78, 216, 0.4)'; // Royal blue tint

  const svgHeight = Math.round(size * 0.65);

  return (
    <div
      style={{
        position: 'relative',
        width: size,
        flexShrink: 0,
        userSelect: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      {/* 1. Large Circular Speedometer Arc */}
      <svg
        width={size}
        height={svgHeight}
        viewBox="0 0 140 92"
        style={{ overflow: 'visible' }}
      >
        <defs>
          {/* Active Gradient: Blue shades (Low in light blue/cyan -> High in deep rich royal blue) */}
          <linearGradient id="speedDialBlueGrad" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#7dd3fc" />
            <stop offset="25%" stopColor="#38bdf8" />
            <stop offset="60%" stopColor="#0284c7" />
            <stop offset="85%" stopColor="#2563eb" />
            <stop offset="100%" stopColor="#1d4ed8" />
          </linearGradient>

          {/* Floating Diamond Needle Gradient */}
          <linearGradient id="stylishBlueNeedleGrad" x1="0%" y1="0%" x2="0%" y2="1">
            <stop offset="0%" stopColor={needleTipColor} />
            <stop offset="50%" stopColor={needleBodyColor} />
            <stop offset="100%" stopColor={needleBaseColor} />
          </linearGradient>

          {/* Glowing Drop Shadow Filter for Needle */}
          <filter id="stylishBlueNeedleGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="0" stdDeviation="1.5" floodColor="#0284c7" floodOpacity="0.6" />
          </filter>
        </defs>

        {/* Inactive Track Underlay (Subtle crisp border for white track definition) */}
        <path
          d={bgArcPath}
          fill="none"
          stroke="rgba(203, 213, 225, 0.5)"
          strokeWidth={bandThickness + 1.5}
          strokeLinecap="butt"
        />

        {/* Inactive Track: Light white with opacity */}
        <path
          d={bgArcPath}
          fill="none"
          stroke="rgba(255, 255, 255, 0.88)"
          strokeWidth={bandThickness}
          strokeLinecap="butt"
        />

        {/* Active Track: Gradient from Light Blue to Deep Royal Blue */}
        {activeArcPath && (
          <path
            d={activeArcPath}
            fill="none"
            stroke="url(#speedDialBlueGrad)"
            strokeWidth={bandThickness}
            strokeLinecap="butt"
          />
        )}

        {/* Scale Number Markings: 0, 5, 10, 15, 20 (Bold Sporty Typography) */}
        {scaleMarks.map(m => (
          <text
            key={`scale-${m.label}`}
            x={m.x}
            y={m.y}
            textAnchor="middle"
            fill="#1e293b"
            fontSize="8.5"
            fontWeight="900"
            fontFamily='"Arial Black", "Barlow Condensed", system-ui, sans-serif'
          >
            {m.label}
          </text>
        ))}

        {/* Floating Diamond Spear Needle (No Pivot Circle, 3D Faceted Spine) */}
        <g
          transform={`rotate(${needleRotationDeg.toFixed(2)}, ${cx}, ${cy})`}
          style={{ transition: 'transform 0.05s linear' }}
        >
          {/* Diamond Polygon */}
          <polygon
            points={`${cx},${cy - 36} ${cx + 3.8},${cy - 20} ${cx},${cy - 6} ${cx - 3.8},${cy - 20}`}
            fill="url(#stylishBlueNeedleGrad)"
            filter="url(#stylishBlueNeedleGlow)"
          />
          {/* Center 3D Facet Spine */}
          <line
            x1={cx}
            y1={cy - 35}
            x2={cx}
            y2={cy - 7}
            stroke="rgba(255, 255, 255, 0.9)"
            strokeWidth="0.9"
          />
        </g>
      </svg>

      {/* 2. Digital RPM Readout placed cleanly BELOW the meter */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginTop: '-1px',
          textAlign: 'center'
        }}
      >
        <span
          style={{
            fontSize: displayString.length > 5 ? '17px' : '19px',
            fontWeight: 900,
            fontFamily: 'system-ui, -apple-system, sans-serif',
            color: '#0f172a',
            letterSpacing: '-0.02em',
            lineHeight: 1.15
          }}
        >
          {displayString}
        </span>
        <span
          style={{
            fontSize: '9.5px',
            fontWeight: 800,
            color: '#64748b',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            fontStyle: 'italic',
            marginTop: '1px'
          }}
        >
          {label}
        </span>
      </div>
    </div>
  );
};
