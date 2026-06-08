import type { JSX } from 'react';

export interface ExpandToggleButtonProps {
  expanded: boolean;
  totalCount: number;
  visibleCount: number;
  itemLabel?: string;
  onToggle: () => void;
}

export function ExpandToggleButton({
  expanded,
  totalCount,
  visibleCount,
  itemLabel = '行',
  onToggle,
}: ExpandToggleButtonProps): JSX.Element {
  return (
    <div className="mt-4 flex justify-center">
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex h-10 items-center rounded-2xl border border-[var(--border-soft)] bg-white/5 px-4 text-sm font-medium text-[var(--text-muted)] transition hover:bg-white/10 hover:text-[var(--text)]"
      >
        {expanded
          ? `收起（已显示 ${visibleCount} ${itemLabel}）`
          : `展开全部（共 ${totalCount} ${itemLabel}）`}
      </button>
    </div>
  );
}
