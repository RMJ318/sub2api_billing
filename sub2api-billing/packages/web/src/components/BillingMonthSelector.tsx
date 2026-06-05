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
    <label className="flex min-w-[180px] items-center gap-3 rounded-2xl border border-[var(--border-soft)] bg-white/5 px-3 py-2.5 text-sm">
      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-dim)]">
        Month
      </span>
      <select
        className="app-select border-0 bg-transparent px-0 py-0 text-sm font-medium text-[var(--text)] shadow-none focus:border-0 focus:shadow-none"
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
