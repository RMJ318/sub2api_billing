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
        <label className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <span className="text-[11px] uppercase tracking-[0.16em] text-[var(--text-dim)]">Date Start</span>
          <input
            type="date"
            value={start}
            onChange={(event) => onStartChange(event.target.value)}
            className="app-input"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <span className="text-[11px] uppercase tracking-[0.16em] text-[var(--text-dim)]">Date End</span>
          <input
            type="date"
            value={end}
            onChange={(event) => onEndChange(event.target.value)}
            className="app-input"
          />
        </label>
      </div>
      {validationMessage ? (
        <p className="text-sm text-[var(--danger)]">{validationMessage}</p>
      ) : null}
    </div>
  );
}
