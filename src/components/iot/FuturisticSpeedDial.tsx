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
 * Features:
 * - Animated gauge sweep from 0 to target on mount / page open
 * - Sweeps down to 0 if machine status is Stopped or Doffing
 * - Sci-Fi HUD outer bracket arcs and segmented radial tick bars
 * - Center pod with parameter label, digital high-contrast numbers, and status pill
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
    const duration = 1100; // 1.1s smooth futuristic sweep
    const startTime = performance.now();

    const frame = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      // Futuristic exponential ease out
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

  const cx = size / 2;
  const cy = size / 2;
  const scale = size / 126;

  // 26 radial tick segments spanning 250 degrees (from 145 deg to 395 deg)
  const totalTicks = 26;
  const startDeg = 145;
  const sweepDeg = 250;
  const rIn = 45 * scale;
  const rOut = 54 * scale;

  const fraction = max > 0 ? Math.min(1, Math.max(0, animatedVal / max)) : 0;
  const activeCount = Math.round(fraction * totalTicks);

  const ticks = Array.from({ length: totalTicks }, (_, i) => {
    const angleDeg = startDeg + (i / (totalTicks - 1)) * sweepDeg;
    const rad = (angleDeg * Math.PI) / 180;
    const x1 = cx + rIn * Math.cos(rad);
    const y1 = cy + rIn * Math.sin(rad);
    const x2 = cx + rOut * Math.cos(rad);
    const y2 = cy + rOut * Math.sin(rad);
    const isActive = i < activeCount && !isStoppedOrDoffing;
    return { i, x1, y1, x2, y2, isActive, angleDeg };
  });

  // Color schemes for futuristic glow
  const colorMap = {
    cyan: { active: '#06b6d4', glow: 'rgba(6, 182, 212, 0.4)', strokeGrad: ['#00e5ff', '#0ea5e9'] },
    emerald: { active: '#10b981', glow: 'rgba(16, 185, 129, 0.4)', strokeGrad: ['#34d399', '#059669'] },
    amber: { active: '#f59e0b', glow: 'rgba(245, 158, 11, 0.4)', strokeGrad: ['#fbbf24', '#d97706'] },
    rose: { active: '#f43f5e', glow: 'rgba(244, 63, 94, 0.4)', strokeGrad: ['#fb7185', '#e11d48'] },
    indigo: { active: '#6366f1', glow: 'rgba(99, 102, 241, 0.4)', strokeGrad: ['#818cf8', '#4f46e5'] }
  };
  const theme = colorMap[colorScheme] || colorMap.cyan;

  // Center status badge pill styling
  let badgeText = 'Normal';
  let badgeBg = '#ecfdf5';
  let badgeBorder = '#a7f3d0';
  let badgeColor = '#15803d';
  let badgeDot = '#22c55e';

  if (status === 'STOP' || status === 'OFFLINE') {
    badgeText = 'Stopped';
    badgeBg = '#fef2f2';
    badgeBorder = '#fecaca';
    badgeColor = '#b91c1c';
    badgeDot = '#ef4444';
  } else if (status === 'DOFF') {
    badgeText = 'Doffing';
    badgeBg = '#fefce8';
    badgeBorder = '#fef08a';
    badgeColor = '#a16207';
    badgeDot = '#f59e0b';
  }

  // Display value formatting
  let displayString = '';
  if (isStoppedOrDoffing) {
    displayString = '0';
  } else if (customUnit === '%' || customUnit === 'kg' || customUnit === 'min') {
    displayString = animatedVal.toFixed(animatedVal >= 100 ? 0 : 1);
  } else {
    displayString = Math.round(animatedVal).toLocaleString();
  }

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0, userSelect: 'none' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id={`dialGrad-${colorScheme}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={theme.strokeGrad[0]} />
            <stop offset="100%" stopColor={theme.strokeGrad[1]} />
          </linearGradient>
          <filter id={`dialGlow-${colorScheme}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Outer Sci-Fi HUD bracket arcs */}
        <path
          d={`M ${cx - 57 * scale} ${cy} A ${57 * scale} ${57 * scale} 0 0 1 ${cx - 28 * scale} ${cy - 50 * scale}`}
          fill="none"
          stroke="#06b6d4"
          strokeWidth="1.2"
          opacity="0.35"
        />
        <path
          d={`M ${cx + 57 * scale} ${cy} A ${57 * scale} ${57 * scale} 0 0 0 ${cx + 28 * scale} ${cy - 50 * scale}`}
          fill="none"
          stroke="#06b6d4"
          strokeWidth="1.2"
          opacity="0.35"
        />
        {/* Subtle bottom bracket arcs */}
        <path
          d={`M ${cx - 57 * scale} ${cy} A ${57 * scale} ${57 * scale} 0 0 0 ${cx - 32 * scale} ${cy + 47 * scale}`}
          fill="none"
          stroke="#06b6d4"
          strokeWidth="1.2"
          opacity="0.35"
        />
        <path
          d={`M ${cx + 57 * scale} ${cy} A ${57 * scale} ${57 * scale} 0 0 1 ${cx + 32 * scale} ${cy + 47 * scale}`}
          fill="none"
          stroke="#06b6d4"
          strokeWidth="1.2"
          opacity="0.35"
        />

        {/* 26 Radial Segmented Ticks */}
        {ticks.map(t => (
          <line
            key={`tick-${t.i}`}
            x1={t.x1}
            y1={t.y1}
            x2={t.x2}
            y2={t.y2}
            stroke={t.isActive ? `url(#dialGrad-${colorScheme})` : '#e2e8f0'}
            strokeWidth={t.isActive ? 3.2 * scale : 2.0 * scale}
            strokeLinecap="round"
            filter={t.isActive ? `url(#dialGlow-${colorScheme})` : undefined}
          />
        ))}

        {/* Center Circular Pod */}
        <circle
          cx={cx}
          cy={cy}
          r={37 * scale}
          fill="#ffffff"
          stroke="#e2e8f0"
          strokeWidth="1.5"
        />
        <circle
          cx={cx}
          cy={cy}
          r={35 * scale}
          fill="none"
          stroke="#f8fafc"
          strokeWidth="1"
        />

        {/* Dial Center: Top Label (e.g. RPM) */}
        <text
          x={cx}
          y={cy - 16 * scale}
          textAnchor="middle"
          fill="#64748b"
          fontSize={8.5 * scale}
          fontWeight="800"
          letterSpacing="0.08em"
        >
          {label}
        </text>

        {/* Dial Center: Big Digital Speed Value */}
        <text
          x={cx}
          y={cy + 3 * scale}
          textAnchor="middle"
          fill="#0f172a"
          fontSize={(displayString.length > 5 ? 13 : displayString.length > 4 ? 15 : 17) * scale}
          fontWeight="900"
          fontFamily="monospace"
          letterSpacing="-0.02em"
        >
          {displayString}
        </text>

        {/* Dial Center: Bottom Status Pill */}
        <g transform={`translate(${cx - 24 * scale}, ${cy + 10 * scale})`}>
          <rect
            x={0}
            y={0}
            width={48 * scale}
            height={14 * scale}
            rx={7 * scale}
            fill={badgeBg}
            stroke={badgeBorder}
            strokeWidth="0.8"
          />
          <circle
            cx={7 * scale}
            cy={7 * scale}
            r={2.5 * scale}
            fill={badgeDot}
          />
          <text
            x={26 * scale}
            y={10 * scale}
            textAnchor="middle"
            fill={badgeColor}
            fontSize={7.2 * scale}
            fontWeight="800"
          >
            {badgeText}
          </text>
        </g>
      </svg>
    </div>
  );
};
