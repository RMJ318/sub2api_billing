import type { JSX, ReactNode } from 'react';

export interface DashboardSummaryCardProps {
  title: string;
  value: ReactNode;
  hint?: ReactNode;
  className?: string;
  change?: ReactNode;
  tone?: 'primary' | 'success' | 'warning' | 'danger';
  onClick?: () => void;
  actionLabel?: string;
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

const TONE_CLASS: Record<NonNullable<DashboardSummaryCardProps['tone']>, string> = {
  primary: 'text-[var(--primary)]',
  success: 'text-[var(--secondary)]',
  warning: 'text-[var(--warning)]',
  danger: 'text-red-300',
};

const TONE_PANEL_CLASS: Record<NonNullable<DashboardSummaryCardProps['tone']>, string> = {
  primary: 'border-[rgba(77,142,255,0.28)] bg-[linear-gradient(180deg,rgba(30,41,59,0.96),rgba(25,31,47,0.86))] shadow-[0_22px_70px_rgba(77,142,255,0.12)]',
  success: 'border-[rgba(78,222,163,0.22)] bg-[linear-gradient(180deg,rgba(25,42,45,0.94),rgba(17,30,31,0.82))] shadow-[0_22px_70px_rgba(0,165,114,0.10)]',
  warning: 'border-[rgba(251,191,36,0.24)] bg-[linear-gradient(180deg,rgba(48,39,23,0.95),rgba(25,31,47,0.84))] shadow-[0_22px_70px_rgba(251,191,36,0.10)]',
  danger: 'border-[rgba(239,68,68,0.24)] bg-[linear-gradient(180deg,rgba(52,29,33,0.95),rgba(25,31,47,0.84))] shadow-[0_22px_70px_rgba(239,68,68,0.12)]',
};

export function DashboardSummaryCard({
  title,
  value,
  hint,
  className,
  change,
  tone,
  onClick,
  actionLabel,
}: DashboardSummaryCardProps): JSX.Element {
  const accentClass = tone ? TONE_CLASS[tone] : (ACCENT_BY_TITLE[title] ?? 'text-[var(--text)]');
  const panelClass = tone ? TONE_PANEL_CLASS[tone] : '';
  const interactiveClass = onClick
    ? 'cursor-pointer transition-transform duration-200 hover:-translate-y-0.5 hover:border-[rgba(173,198,255,0.34)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(77,142,255,0.36)] focus-visible:ring-offset-0'
    : '';

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-[var(--text-dim)]">
            {title}
          </p>
          <p className={`kpi-value mt-1.5 truncate text-[1.55rem] font-bold leading-none ${accentClass}`}>
            {value}
          </p>
          {change ? <p className="mt-1.5 text-[13px] font-semibold leading-5 text-[var(--text)]">{change}</p> : null}
        </div>
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl border border-white/8 bg-white/6 ${accentClass}`}>
          <SparkIcon />
        </div>
      </div>
      {hint ? <p className="mt-1.5 text-[13px] leading-5 text-[var(--text-muted)]">{hint}</p> : null}
      {onClick && actionLabel ? (
        <div className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--primary)]">
          <span>{actionLabel}</span>
          <span aria-hidden="true">↗</span>
        </div>
      ) : null}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`glass-panel rounded-[24px] px-4 py-3.5 text-left ${panelClass} ${interactiveClass} ${className ?? 'span-3'}`}
      >
        {content}
      </button>
    );
  }

  return <section className={`glass-panel rounded-[24px] px-4 py-3.5 ${panelClass} ${className ?? 'span-3'}`}>{content}</section>;
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
