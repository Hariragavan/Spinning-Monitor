'use client';

import React, { useState, useEffect, useRef } from 'react';

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
 * High-Performance Futuristic Speedometer Dial (Teal / Turquoise Theme matching design)
 * - Large spacious circular meter arc touching boundaries
 * - 260° perimeter band (140° bottom-left to 400° bottom-right)
 * - Turquoise to deep teal gradient: #2dd4bf -> #14b8a6 -> #0d9488 -> #0f766e -> #115e59
 * - Sleek dark teal needle with cyan hub ring + core matching reference image
 * - Fluid animation on initial mount / refresh, run status change (e.g. drop to 0 on stop), and live telemetry updates
 * - Clean digital readout placed below the meter (Bold number + Italic RPM)
 */
export const FuturisticSpeedDial: React.FC<FuturisticSpeedDialProps> = ({
  value,
  max = 20000,
  status,
  label = 'RPM',
  customUnit,
  size = 160
}) => {
  const isStoppedOrDoffing = status === 'STOP' || status === 'OFFLINE' || status === 'DOFF';
  const targetVal = isStoppedOrDoffing ? 0 : Math.max(0, value);
  const [animatedVal, setAnimatedVal] = useState<number>(0);
  const currentValRef = useRef<number>(0);

  // Keep ref updated with latest animated value so re-triggers start from exact current position
  useEffect(() => {
    currentValRef.current = animatedVal;
  }, [animatedVal]);

  // Smooth animation trigger on refresh / load, status change, and live data updates
  useEffect(() => {
    let animId: number;
    const startVal = currentValRef.current;
    const endVal = targetVal;
    const diff = Math.abs(endVal - startVal);

    // Duration: 1.0s for large sweeps (start from 0, stop, or doff), 500ms for live telemetry adjustments
    const duration = diff > 2500 ? 1000 : 500;
    const startTime = performance.now();

    const frame = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      // Smooth aerodynamic ease-out cubic
      const ease = 1 - Math.pow(1 - progress, 3);
      const current = startVal + (endVal - startVal) * ease;
      setAnimatedVal(current);

      if (progress < 1) {
        animId = requestAnimationFrame(frame);
      } else {
        setAnimatedVal(endVal);
      }
    };

    animId = requestAnimationFrame(frame);

    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [targetVal, status]);

  // SVG Geometry - Meter circle reaches right up to left and right boundaries
  const cx = 72;
  const cy = 60;
  const arcRadius = 57;
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
    { label: '0', x: 34, y: 94 },
    { label: '5', x: 26, y: 55 },
    { label: '10', x: 72, y: 22 },
    { label: '15', x: 118, y: 55 },
    { label: '20', x: 110, y: 94 }
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

  const svgHeight = Math.round(size * 0.73);

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
      {/* 1. Circular Speedometer Arc */}
      <svg
        width={size}
        height={svgHeight}
        viewBox="0 0 144 104"
        style={{ overflow: 'visible' }}
      >
        <defs>
          {/* Active Gradient: Turquoise to Deep Teal matching image */}
          <linearGradient id="speedDialTealGrad" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#2dd4bf" />
            <stop offset="25%" stopColor="#14b8a6" />
            <stop offset="55%" stopColor="#0d9488" />
            <stop offset="82%" stopColor="#0f766e" />
            <stop offset="100%" stopColor="#115e59" />
          </linearGradient>

          {/* Needle Gradient Left Facet */}
          <linearGradient id="needleTealLeftGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#0d9488" />
            <stop offset="100%" stopColor="#0f766e" />
          </linearGradient>

          {/* Needle Gradient Right Facet */}
          <linearGradient id="needleTealRightGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#0f766e" />
            <stop offset="100%" stopColor="#042f2e" />
          </linearGradient>

          {/* Glowing Drop Shadow Filter for Needle */}
          <filter id="stylishTealNeedleGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="1" stdDeviation="1.2" floodColor="#042f2e" floodOpacity="0.45" />
          </filter>
        </defs>

        {/* Inactive Track Underlay */}
        <path
          d={bgArcPath}
          fill="none"
          stroke="rgba(203, 213, 225, 0.45)"
          strokeWidth={bandThickness + 1}
          strokeLinecap="butt"
        />

        {/* Inactive Track (soft tinted) */}
        <path
          d={bgArcPath}
          fill="none"
          stroke="rgba(241, 245, 249, 0.9)"
          strokeWidth={bandThickness}
          strokeLinecap="butt"
        />

        {/* Active Track: Vibrant Turquoise to Deep Teal Gradient */}
        {activeArcPath && (
          <path
            d={activeArcPath}
            fill="none"
            stroke="url(#speedDialTealGrad)"
            strokeWidth={bandThickness}
            strokeLinecap="butt"
          />
        )}

        {/* Scale Number Markings: 0, 5, 10, 15, 20 */}
        {scaleMarks.map(m => (
          <text
            key={`scale-${m.label}`}
            x={m.x}
            y={m.y}
            textAnchor="middle"
            fill="#0f172a"
            fontSize="9.5"
            fontWeight="900"
            fontFamily="system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
          >
            {m.label}
          </text>
        ))}

        {/* Sleek Tapered Teal Needle with Cyan Hub Ring & Core matching reference */}
        <g transform={`rotate(${needleRotationDeg.toFixed(2)}, ${cx}, ${cy})`}>
          {/* Left Facet */}
          <polygon
            points={`${cx},${cy - 48} ${cx - 3.2},${cy - 14} ${cx - 1.8},${cy - 5} ${cx},${cy - 5}`}
            fill="url(#needleTealLeftGrad)"
            filter="url(#stylishTealNeedleGlow)"
          />
          {/* Right Facet */}
          <polygon
            points={`${cx},${cy - 48} ${cx + 3.2},${cy - 14} ${cx + 1.8},${cy - 5} ${cx},${cy - 5}`}
            fill="url(#needleTealRightGrad)"
            filter="url(#stylishTealNeedleGlow)"
          />
          {/* Center Spine Line (Mint highlight) */}
          <line
            x1={cx}
            y1={cy - 47}
            x2={cx}
            y2={cy - 6}
            stroke="#5eead4"
            strokeWidth="0.7"
          />

          {/* Central Pivot Hub: Dark teal ring with bright cyan core matching image */}
          <circle
            cx={cx}
            cy={cy}
            r="7.5"
            fill="#042f2e"
            stroke="#0f766e"
            strokeWidth="1.2"
            style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}
          />
          <circle
            cx={cx}
            cy={cy}
            r="4.2"
            fill="#2dd4bf"
            stroke="#14b8a6"
            strokeWidth="0.8"
          />
        </g>
      </svg>

      {/* 2. Digital RPM Readout placed cleanly BELOW the meter */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginTop: '-4px',
          textAlign: 'center'
        }}
      >
        <span
          style={{
            fontSize: displayString.length > 5 ? '19px' : '22px',
            fontWeight: 900,
            fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
            color: '#0f172a',
            letterSpacing: '-0.02em',
            lineHeight: 1.15
          }}
        >
          {displayString}
        </span>
        <span
          style={{
            fontSize: '11px',
            fontWeight: 800,
            fontStyle: 'italic',
            color: '#475569',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            marginTop: '1px',
            fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
          }}
        >
          {label}
        </span>
      </div>
    </div>
  );
};
