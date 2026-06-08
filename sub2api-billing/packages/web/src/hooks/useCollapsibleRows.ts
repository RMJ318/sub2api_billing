import { useMemo, useState } from 'react';

export interface UseCollapsibleRowsOptions<T> {
  rows: T[];
  defaultVisibleCount?: number;
}

export interface UseCollapsibleRowsResult<T> {
  expanded: boolean;
  hasMoreRows: boolean;
  visibleRows: T[];
  totalCount: number;
  visibleCount: number;
  toggleExpanded: () => void;
}

export function useCollapsibleRows<T>({
  rows,
  defaultVisibleCount = 6,
}: UseCollapsibleRowsOptions<T>): UseCollapsibleRowsResult<T> {
  const [expanded, setExpanded] = useState(false);
  const hasMoreRows = rows.length > defaultVisibleCount;
  const visibleRows = useMemo(
    () => (expanded ? rows : rows.slice(0, defaultVisibleCount)),
    [defaultVisibleCount, expanded, rows],
  );

  return {
    expanded,
    hasMoreRows,
    visibleRows,
    totalCount: rows.length,
    visibleCount: visibleRows.length,
    toggleExpanded: () => setExpanded((prev) => !prev),
  };
}
