import type { JSX, ReactNode } from 'react';

export interface DashboardSummaryCardProps {
  title: string;
  value: ReactNode;
  hint?: ReactNode;
  className?: string;
  change?: ReactNode;
}

const ACCENT_BY_TITLE: Record<string, string> = {
  'API Status': 'text-[var(--secondary)]',
  'Selected Month': 'text-[var(--primary)]',
  'Total Spend': 'text-[var(--primary)]',
  'Active Users': 'text-[var(--secondary)]',
  'Total Requests': 'text-[var(--gpt)]',
  'Total Tokens': 'text-[var(--warning)]',
  'Budget Usage': 'text-[var(--secondary)]',
  Forecast: 'text-[var(--warning)]',
};

export function DashboardSummaryCard({
  title,
  value,
  hint,
  className,
  change,
}: DashboardSummaryCardProps): JSX.Element {
  const accentClass = ACCENT_BY_TITLE[title] ?? 'text-[var(--text)]';

  return (
    <section className={`glass-panel rounded-[26px] p-5 ${className ?? 'span-3'}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-dim)]">
            {title}
          </p>
          <p className={`kpi-value mt-3 truncate text-[2rem] font-bold leading-none ${accentClass}`}>
            {value}
          </p>
          {change ? (
            <p className="mt-3 text-sm font-semibold text-[var(--secondary)]">{change}</p>
          ) : null}
        </div>
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-white/6 ${accentClass}`}>
          <SparkIcon />
        </div>
      </div>
      {hint ? (
        <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">{hint}</p>
      ) : null}
    </section>
  );
}

function SparkIcon(): JSX.Element {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3zm6.5 12.5l.7 2 .8.3-.8.3-.7 2-.7-2-.8-.3.8-.3.7-2zM5.5 15.5l1 2.7 2.7 1-2.7 1-1 2.7-1-2.7-2.7-1 2.7-1 1-2.7z"
      />
    </svg>
  );
}
