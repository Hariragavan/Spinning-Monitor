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
 * High-Performance Futuristic Speedometer Dial (Dynamic Blue Theme)
 * - Large spacious circular meter arc touching left and right boundaries
 * - 260° perimeter band (140° bottom-left to 400° bottom-right)
 * - Dynamic blue gradient: Light sky blue -> Rich cobalt -> Deep royal sapphire
 * - Frosted white track with opacity underlay
 * - Redesigned sleek 3D aerodynamic diamond needle with glowing metallic pivot
 * - Fluid animation on initial mount / refresh, run status change (e.g. drop to 0 on stop), and live telemetry updates
 * - Clean digital readout placed below the meter
 */
export const FuturisticSpeedDial: React.FC<FuturisticSpeedDialProps> = ({
  value,
  max = 20000,
  status,
  label = 'RPM',
  customUnit,
  size = 146
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

    // Duration: 1.1s for large sweeps (start from 0, stop, or doff), 500ms for live telemetry adjustments
    const duration = diff > 2500 ? 1100 : 550;
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

  const svgHeight = Math.round(size * 0.72);

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
      {/* 1. Large Circular Speedometer Arc touching left and right edges */}
      <svg
        width={size}
        height={svgHeight}
        viewBox="0 0 144 104"
        style={{ overflow: 'visible' }}
      >
        <defs>
          {/* Active Gradient: Dynamic blue shades (Light cyan-blue -> Cobalt -> Deep royal blue) */}
          <linearGradient id="speedDialBlueGrad" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#7dd3fc" />
            <stop offset="25%" stopColor="#38bdf8" />
            <stop offset="55%" stopColor="#0284c7" />
            <stop offset="80%" stopColor="#2563eb" />
            <stop offset="100%" stopColor="#1d4ed8" />
          </linearGradient>

          {/* Sleek Needle Gradient Left Facet (Light cyan glow) */}
          <linearGradient id="needleLeftFacetGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#bae6fd" />
            <stop offset="100%" stopColor="#38bdf8" />
          </linearGradient>

          {/* Sleek Needle Gradient Right Facet (Deep sapphire blue) */}
          <linearGradient id="needleRightFacetGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#0284c7" />
            <stop offset="100%" stopColor="#1e40af" />
          </linearGradient>

          {/* Metallic Hub Gradient */}
          <radialGradient id="needleHubGrad" cx="40%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="45%" stopColor="#cbd5e1" />
            <stop offset="85%" stopColor="#64748b" />
            <stop offset="100%" stopColor="#334155" />
          </radialGradient>

          {/* Glowing Drop Shadow Filter for Needle */}
          <filter id="stylishBlueNeedleGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="0" stdDeviation="1.5" floodColor="#0284c7" floodOpacity="0.5" />
          </filter>
        </defs>

        {/* Inactive Track Underlay (Subtle crisp border for white track definition) */}
        <path
          d={bgArcPath}
          fill="none"
          stroke="rgba(203, 213, 225, 0.45)"
          strokeWidth={bandThickness + 1.2}
          strokeLinecap="butt"
        />

        {/* Inactive Track: Frosted white with opacity */}
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

        {/* Scale Number Markings: 0, 5, 10, 15, 20 */}
        {scaleMarks.map(m => (
          <text
            key={`scale-${m.label}`}
            x={m.x}
            y={m.y}
            textAnchor="middle"
            fill="#334155"
            fontSize="9"
            fontWeight="800"
            fontFamily="system-ui, -apple-system, sans-serif"
          >
            {m.label}
          </text>
        ))}

        {/* Redesigned Sleek 3D Aerodynamic Needle */}
        <g transform={`rotate(${needleRotationDeg.toFixed(2)}, ${cx}, ${cy})`}>
          {/* Left 3D Facet */}
          <polygon
            points={`${cx},${cy - 47} ${cx - 3.4},${cy - 24} ${cx - 2},${cy - 5} ${cx},${cy - 5}`}
            fill="url(#needleLeftFacetGrad)"
            filter="url(#stylishBlueNeedleGlow)"
          />
          {/* Right 3D Facet */}
          <polygon
            points={`${cx},${cy - 47} ${cx + 3.4},${cy - 24} ${cx + 2},${cy - 5} ${cx},${cy - 5}`}
            fill="url(#needleRightFacetGrad)"
            filter="url(#stylishBlueNeedleGlow)"
          />
          {/* Center Spine Line (Bright highlight) */}
          <line
            x1={cx}
            y1={cy - 46}
            x2={cx}
            y2={cy - 5}
            stroke="rgba(255, 255, 255, 0.95)"
            strokeWidth="0.8"
          />

          {/* Central Pivot Hub (Metallic ring with glowing cyan core) */}
          <circle
            cx={cx}
            cy={cy}
            r="6.5"
            fill="url(#needleHubGrad)"
            stroke="#ffffff"
            strokeWidth="0.9"
            style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.25))' }}
          />
          <circle
            cx={cx}
            cy={cy}
            r="3"
            fill="#0284c7"
            stroke="#38bdf8"
            strokeWidth="0.6"
          />
        </g>
      </svg>

      {/* 2. Digital RPM Readout placed cleanly BELOW the meter */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginTop: '-3px',
          textAlign: 'center'
        }}
      >
        <span
          style={{
            fontSize: displayString.length > 5 ? '18px' : '20px',
            fontWeight: 800,
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
            fontWeight: 700,
            color: '#64748b',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginTop: '1px',
            fontFamily: 'system-ui, -apple-system, sans-serif'
          }}
        >
          {label}
        </span>
      </div>
    </div>
  );
};
