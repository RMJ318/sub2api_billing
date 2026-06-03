import type { JSX, ReactNode } from 'react';

export interface DashboardSummaryCardProps {
  title: string;
  value: ReactNode;
  hint?: ReactNode;
}

export function DashboardSummaryCard({
  title,
  value,
  hint,
}: DashboardSummaryCardProps): JSX.Element {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
        {title}
      </p>
      <p className="mt-3 text-2xl font-semibold text-neutral-950 dark:text-neutral-50">
        {value}
      </p>
      {hint ? (
        <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
          {hint}
        </p>
      ) : null}
    </section>
  );
}
