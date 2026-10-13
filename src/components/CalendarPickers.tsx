import React, { useRef } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';
import { cn, parseUniversalDateParts } from '../lib/utils';

interface CalendarDatePickerProps {
  value: string; // "DD/MM/YYYY" or "YYYY-MM-DD"
  onChange: (ddmmyyyy: string, isoDate?: string) => void;
  className?: string;
  label?: string;
  disabled?: boolean;
}

export const CalendarDatePicker: React.FC<CalendarDatePickerProps> = ({
  value,
  onChange,
  className,
  label,
  disabled = false,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  // Convert DD/MM/YYYY to YYYY-MM-DD for native input[type="date"]
  let isoDate = '';
  let displayDate = value || '';

  if (value) {
    if (value.includes('-') && value.split('-')[0].length === 4) {
      isoDate = value;
      const [y, m, d] = value.split('-');
      displayDate = `${d}/${m}/${y}`;
    } else {
      const parts = parseUniversalDateParts(value);
      if (parts && parts.year > 2000) {
        isoDate = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
        displayDate = `${String(parts.day).padStart(2, '0')}/${String(parts.month).padStart(2, '0')}/${parts.year}`;
      } else {
        const today = new Date();
        isoDate = today.toISOString().split('T')[0];
        displayDate = value;
      }
    }
  } else {
    const today = new Date();
    isoDate = today.toISOString().split('T')[0];
  }

  const handleNativeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newIso = e.target.value;
    if (!newIso) return;
    const [y, m, d] = newIso.split('-');
    const newDDMMYYYY = `${d}/${m}/${y}`;
    onChange(newDDMMYYYY, newIso);
  };

  const openPicker = () => {
    if (disabled) return;
    if (inputRef.current) {
      try {
        if ('showPicker' in HTMLInputElement.prototype) {
          inputRef.current.showPicker();
        } else {
          inputRef.current.focus();
        }
      } catch {
        inputRef.current.focus();
      }
    }
  };

  return (
    <div className={cn('relative inline-flex items-center', className)}>
      {label && <span className="text-xs font-bold text-stone-500 mr-2 uppercase tracking-wider">{label}</span>}
      <button
        type="button"
        onClick={openPicker}
        disabled={disabled}
        className={cn(
          "group inline-flex items-center gap-2.5 px-3 py-1.5 rounded-xl border border-stone-200/90 bg-white shadow-sm hover:border-emerald-500 hover:bg-emerald-50/20 active:scale-[0.98] transition-all duration-150 cursor-pointer text-stone-800 text-xs font-bold",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <span className="p-1 rounded-lg bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100 transition-colors">
          <Calendar size={14} className="stroke-[2.5]" />
        </span>
        <span className="font-mono tracking-tight font-black text-stone-900 text-xs">
          {displayDate || 'Select Date'}
        </span>
        <ChevronDown size={13} className="text-stone-400 group-hover:text-emerald-600 transition-colors" />
      </button>

      {/* Hidden native date input that provides the calendar view */}
      <input
        ref={inputRef}
        type="date"
        value={isoDate}
        onChange={handleNativeChange}
        disabled={disabled}
        className="absolute inset-0 w-full h-full opacity-0 pointer-events-none -z-10"
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  );
};

interface CalendarMonthPickerProps {
  month: number; // 1-12
  year: number; // e.g. 2026
  onChange: (month: number, year: number) => void;
  className?: string;
  label?: string;
  disabled?: boolean;
}

export const CalendarMonthPicker: React.FC<CalendarMonthPickerProps> = ({
  month,
  year,
  onChange,
  className,
  label,
  disabled = false,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const safeMonth = Math.max(1, Math.min(12, month || 1));
  const safeYear = year || new Date().getFullYear();
  const isoMonth = `${safeYear}-${String(safeMonth).padStart(2, '0')}`;

  const monthName = new Date(safeYear, safeMonth - 1, 1).toLocaleString('default', {
    month: 'long',
    year: 'numeric',
  });

  const handleNativeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value; // "YYYY-MM"
    if (!val) return;
    const [yStr, mStr] = val.split('-');
    const newY = parseInt(yStr, 10);
    const newM = parseInt(mStr, 10);
    if (!isNaN(newY) && !isNaN(newM)) {
      onChange(newM, newY);
    }
  };

  const openPicker = () => {
    if (disabled) return;
    if (inputRef.current) {
      try {
        if ('showPicker' in HTMLInputElement.prototype) {
          inputRef.current.showPicker();
        } else {
          inputRef.current.focus();
        }
      } catch {
        inputRef.current.focus();
      }
    }
  };

  return (
    <div className={cn('relative inline-flex items-center', className)}>
      {label && <span className="text-xs font-bold text-stone-500 mr-2 uppercase tracking-wider">{label}</span>}
      <button
        type="button"
        onClick={openPicker}
        disabled={disabled}
        className={cn(
          "group inline-flex items-center gap-2.5 px-3 py-1.5 rounded-xl border border-stone-200/90 bg-white shadow-sm hover:border-indigo-500 hover:bg-indigo-50/20 active:scale-[0.98] transition-all duration-150 cursor-pointer text-stone-800 text-xs font-bold",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <span className="p-1 rounded-lg bg-indigo-50 text-indigo-600 group-hover:bg-indigo-100 transition-colors">
          <Calendar size={14} className="stroke-[2.5]" />
        </span>
        <span className="font-semibold text-stone-900 text-xs tracking-tight">
          {monthName}
        </span>
        <ChevronDown size={13} className="text-stone-400 group-hover:text-indigo-600 transition-colors" />
      </button>

      {/* Hidden native month input that triggers calendar month selection */}
      <input
        ref={inputRef}
        type="month"
        value={isoMonth}
        onChange={handleNativeChange}
        disabled={disabled}
        className="absolute inset-0 w-full h-full opacity-0 pointer-events-none -z-10"
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  );
};
