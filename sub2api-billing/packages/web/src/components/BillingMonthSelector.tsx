import type { JSX } from 'react';

export interface BillingMonthSelectorProps {
  months: readonly string[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function BillingMonthSelector({
  months,
  value,
  onChange,
  disabled = false,
}: BillingMonthSelectorProps): JSX.Element {
  return (
    <label className="flex h-10 min-w-[156px] items-center gap-2 rounded-2xl border border-[var(--border-soft)] bg-white/5 px-3 text-sm">
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-dim)]">
        Month
      </span>
      <select
        className="min-w-0 flex-1 border-0 bg-transparent px-0 py-0 text-sm font-medium text-[var(--text)] outline-none"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled || months.length === 0}
      >
        {months.map((month) => (
          <option key={month} value={month}>
            {month}
          </option>
        ))}
      </select>
    </label>
  );
}
