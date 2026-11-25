import React from 'react';

interface PrintBrandHeaderProps {
  compact?: boolean;
  className?: string;
}

/**
 * Shared brand header rendering the mill emblem and full title logo
 * ("SCM Textile Spinners (A Unit of Space Textiles Pvt Ltd)") on printable views.
 */
export const PrintBrandHeader: React.FC<PrintBrandHeaderProps> = ({
  compact = false,
  className = '',
}) => (
  <img
    src="/scm-logo-horizontal.png"
    alt="SCM Textile Spinners (A Unit of Space Textiles Pvt Ltd)"
    className={`w-auto object-contain mx-auto block ${
      compact ? 'h-8 max-w-[180px] mb-1' : 'h-11 max-w-[240px] mb-1.5'
    } ${className}`}
  />
);
