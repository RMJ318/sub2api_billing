import type { JSX } from 'react';

export interface DateRangeFilterProps {
  start: string;
  end: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  validationMessage?: string | null;
}

export function DateRangeFilter({
  start,
  end,
  onStartChange,
  onEndChange,
  validationMessage = null,
}: DateRangeFilterProps): JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-w-[180px] items-center gap-3 rounded-2xl border border-[var(--border-soft)] bg-white/5 px-3 py-2.5 text-sm">
          <span className="text-[11px] uppercase tracking-[0.16em] text-[var(--text-dim)]">From</span>
          <input
            type="date"
            value={start}
            onChange={(event) => onStartChange(event.target.value)}
            className="app-input border-0 bg-transparent px-0 py-0 text-sm font-medium text-[var(--text)] shadow-none focus:border-0 focus:shadow-none"
          />
        </label>
        <label className="flex min-w-[180px] items-center gap-3 rounded-2xl border border-[var(--border-soft)] bg-white/5 px-3 py-2.5 text-sm">
          <span className="text-[11px] uppercase tracking-[0.16em] text-[var(--text-dim)]">To</span>
          <input
            type="date"
            value={end}
            onChange={(event) => onEndChange(event.target.value)}
            className="app-input border-0 bg-transparent px-0 py-0 text-sm font-medium text-[var(--text)] shadow-none focus:border-0 focus:shadow-none"
          />
        </label>
      </div>
      {validationMessage ? (
        <p className="text-sm text-[var(--danger)]">{validationMessage}</p>
      ) : null}
    </div>
  );
}
