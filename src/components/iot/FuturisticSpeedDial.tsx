'use client';

import React, { useState, useEffect, useRef } from 'react';

export interface FuturisticSpeedDialProps {
  value: number;
  max?: number;
  status: 'RUN' | 'DOFF' | 'STOP' | 'OFFLINE';
  label?: string;
  customUnit?: string;
  size?: number;
  colorScheme?: 'teal' | 'cyan' | 'emerald' | 'amber' | 'rose' | 'indigo';
}

/**
 * High-Performance Futuristic Speedometer Dial
 * Exact Style matching "Idea 2: Teal Green (Modern & Professional)"
 * Palette:
 * - #E6FFFA (light teal background / pill)
 * - #14B8A6 (vibrant teal)
 * - #0F766E (dark teal)
 * - #0F172A (dark navy text)
 *
 * - Half-circle / 260° horseshoe perimeter arc touching left and right boundaries
 * - Smooth Teal Gradient: #2dd4bf -> #14B8A6 -> #0F766E
 * - Frosted white track underlay with subtle teal edge definition
 * - Sleek dark teal tapered needle with glowing pivot hub
 * - Fluid requestAnimationFrame ease-out animation on initial mount / refresh,
 *   run status changes (e.g. drop to 0 on stop/doff), and live telemetry updates
 * - Clean digital readout placed below the meter
 */
export const FuturisticSpeedDial: React.FC<FuturisticSpeedDialProps> = ({
  value,
  max = 20000,
  status,
  label = 'RPM',
  customUnit,
  size = 146,
  colorScheme = 'teal'
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

    // Duration: 1.1s for large sweeps (start from 0, stop, or doff), 550ms for live telemetry adjustments
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

  // Determine color theme based on status and colorScheme
  const isTeal = colorScheme === 'teal' || (status === 'RUN' && colorScheme !== 'amber' && colorScheme !== 'rose');
  const isDoff = status === 'DOFF' || colorScheme === 'amber';
  const isStop = status === 'STOP' || colorScheme === 'rose';

  // Palette assignments
  const labelColor = isStop ? '#b91c1c' : isDoff ? '#b45309' : '#0F766E';
  const needleFacetLeft = isStop ? '#f87171' : isDoff ? '#fbbf24' : '#14B8A6';
  const needleFacetRight = isStop ? '#dc2626' : isDoff ? '#d97706' : '#0F766E';
  const hubStroke = isStop ? '#b91c1c' : isDoff ? '#b45309' : '#0F766E';
  const hubFill = isStop ? '#ef4444' : isDoff ? '#f59e0b' : '#14B8A6';
  const hubCoreFill = isStop ? '#fecaca' : isDoff ? '#fef08a' : '#5eead4';
  const glowColor = isStop ? '#ef4444' : isDoff ? '#f59e0b' : '#0F766E';

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
          {/* Active Gradient: Teal Green Theme (Idea 2: #2dd4bf -> #14B8A6 -> #0F766E) */}
          {isTeal && (
            <linearGradient id="speedDialTealGrad" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#2dd4bf" />
              <stop offset="45%" stopColor="#14B8A6" />
              <stop offset="85%" stopColor="#0F766E" />
              <stop offset="100%" stopColor="#115E59" />
            </linearGradient>
          )}

          {/* Doffing Amber Gradient */}
          {isDoff && (
            <linearGradient id="speedDialAmberGrad" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#fef08a" />
              <stop offset="50%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#b45309" />
            </linearGradient>
          )}

          {/* Stopped Rose/Red Gradient */}
          {isStop && (
            <linearGradient id="speedDialRoseGrad" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#fecaca" />
              <stop offset="50%" stopColor="#ef4444" />
              <stop offset="100%" stopColor="#b91c1c" />
            </linearGradient>
          )}

          {/* Sleek Needle Left Facet Gradient */}
          <linearGradient id="needleFacetLeftGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={needleFacetLeft} />
            <stop offset="100%" stopColor={needleFacetRight} />
          </linearGradient>

          {/* Glowing Drop Shadow Filter for Needle */}
          <filter id="stylishNeedleGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="0" stdDeviation="1.5" floodColor={glowColor} floodOpacity="0.45" />
          </filter>
        </defs>

        {/* Inactive Track Underlay (Subtle crisp border for track definition) */}
        <path
          d={bgArcPath}
          fill="none"
          stroke="rgba(15, 118, 110, 0.12)"
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

        {/* Active Track: Gradient fill */}
        {activeArcPath && (
          <path
            d={activeArcPath}
            fill="none"
            stroke={
              isStop
                ? 'url(#speedDialRoseGrad)'
                : isDoff
                ? 'url(#speedDialAmberGrad)'
                : 'url(#speedDialTealGrad)'
            }
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
            fill="#0F172A"
            fontSize="9.5"
            fontWeight="800"
            fontFamily="system-ui, -apple-system, sans-serif"
          >
            {m.label}
          </text>
        ))}

        {/* Sleek Tapered Needle (Idea 2: #0F766E dark teal with metallic pivot) */}
        <g transform={`rotate(${needleRotationDeg.toFixed(2)}, ${cx}, ${cy})`}>
          {/* Left Facet */}
          <polygon
            points={`${cx},${cy - 47} ${cx - 3.2},${cy - 22} ${cx - 2},${cy - 5} ${cx},${cy - 5}`}
            fill="url(#needleFacetLeftGrad)"
            filter="url(#stylishNeedleGlow)"
          />
          {/* Right Facet */}
          <polygon
            points={`${cx},${cy - 47} ${cx + 3.2},${cy - 22} ${cx + 2},${cy - 5} ${cx},${cy - 5}`}
            fill={needleFacetRight}
            filter="url(#stylishNeedleGlow)"
          />
          {/* Center Spine Line (Subtle highlight) */}
          <line
            x1={cx}
            y1={cy - 46}
            x2={cx}
            y2={cy - 5}
            stroke="rgba(255, 255, 255, 0.85)"
            strokeWidth="0.8"
          />

          {/* Central Pivot Hub (Teal outer ring with cyan/mint core) */}
          <circle
            cx={cx}
            cy={cy}
            r="7"
            fill={hubFill}
            stroke={hubStroke}
            strokeWidth="1.2"
            style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.22))' }}
          />
          <circle
            cx={cx}
            cy={cy}
            r="3.5"
            fill={hubCoreFill}
            stroke={hubStroke}
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
          marginTop: '-3px',
          textAlign: 'center'
        }}
      >
        <span
          style={{
            fontSize: displayString.length > 5 ? '19px' : '22px',
            fontWeight: 900,
            fontFamily: 'system-ui, -apple-system, sans-serif',
            color: '#0F172A',
            letterSpacing: '-0.02em',
            lineHeight: 1.12
          }}
        >
          {displayString}
        </span>
        <span
          style={{
            fontSize: '10px',
            fontWeight: 800,
            color: labelColor,
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
