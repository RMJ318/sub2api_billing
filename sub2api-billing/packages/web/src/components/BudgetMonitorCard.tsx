import type { JSX } from 'react';
import type { UserAggregatesResponse } from '../lib/api.js';

export interface BudgetMonitorCardProps {
  rows: UserAggregatesResponse['budgetMonitor'];
}

function toneClass(style: UserAggregatesResponse['budgetMonitor'][number]['style']): string {
  switch (style) {
    case 'critical':
      return 'bg-red-500';
    case 'warning':
      return 'bg-amber-500';
    default:
      return 'bg-emerald-500';
  }
}

export function BudgetMonitorCard({
  rows,
}: BudgetMonitorCardProps): JSX.Element {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="text-base font-semibold text-neutral-950 dark:text-neutral-50">
        Budget Monitor
      </h2>
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
        Highest utilization users for the selected month.
      </p>

      <div className="mt-4 space-y-4">
        {rows.slice(0, 6).map((row) => (
          <div key={row.userId}>
            <div className="mb-2 flex items-center justify-between gap-4 text-sm">
              <span className="font-medium text-neutral-950 dark:text-neutral-50">
                {row.label}
              </span>
              <span className="text-neutral-500 dark:text-neutral-400">
                {row.usagePct.toFixed(1)}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-neutral-200 dark:bg-neutral-800">
              <div
                className={`h-2 rounded-full ${toneClass(row.style)}`}
                style={{ width: `${Math.min(row.usagePct, 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
