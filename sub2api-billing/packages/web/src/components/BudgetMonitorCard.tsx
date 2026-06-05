import type { JSX } from 'react';
import type { UserAggregatesResponse } from '../lib/api.js';
import { useI18n } from '../i18n.js';

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
  const { t } = useI18n();
  return (
    <section className="glass-panel rounded-3xl p-5">
      <h2 className="text-2xl font-semibold tracking-[-0.02em] text-[var(--text)]">
        {t('table.budgetMonitor')}
      </h2>
      <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
        {t('table.budgetMonitorSubtitle')}
      </p>

      <div className="mt-5 space-y-4">
        {rows.slice(0, 6).map((row) => (
          <div key={row.userId} className="panel-muted rounded-2xl p-4">
            <div className="mb-3 flex items-center justify-between gap-4 text-sm">
              <span className="font-medium text-[var(--text)]">
                {row.label}
              </span>
              <span className="data-mono text-[var(--text-muted)]">
                {row.usagePct.toFixed(1)}%
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-white/8">
              <div
                className={`h-2.5 rounded-full ${toneClass(row.style)}`}
                style={{ width: `${Math.min(row.usagePct, 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
