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
    <label className="flex items-center gap-3 text-sm font-medium text-neutral-700 dark:text-neutral-300">
      <span>Billing Month</span>
      <select
        className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
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
