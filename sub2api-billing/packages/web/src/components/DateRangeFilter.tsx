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
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--border-soft)] bg-white/5 px-2.5 py-2">
        <span className="shrink-0 pl-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-dim)]">
          Date
        </span>
        <label className="flex h-8 min-w-[142px] items-center gap-2 rounded-xl border border-white/8 bg-black/10 px-2.5 text-sm">
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-dim)]">
            From
          </span>
          <input
            type="date"
            value={start}
            onChange={(event) => onStartChange(event.target.value)}
            className="min-w-0 flex-1 border-0 bg-transparent px-0 py-0 text-sm font-medium text-[var(--text)] outline-none"
          />
        </label>
        <label className="flex h-8 min-w-[142px] items-center gap-2 rounded-xl border border-white/8 bg-black/10 px-2.5 text-sm">
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-dim)]">
            To
          </span>
          <input
            type="date"
            value={end}
            onChange={(event) => onEndChange(event.target.value)}
            className="min-w-0 flex-1 border-0 bg-transparent px-0 py-0 text-sm font-medium text-[var(--text)] outline-none"
          />
        </label>
      </div>
      {validationMessage ? <p className="pl-1 text-xs text-[var(--danger)]">{validationMessage}</p> : null}
    </div>
  );
}
