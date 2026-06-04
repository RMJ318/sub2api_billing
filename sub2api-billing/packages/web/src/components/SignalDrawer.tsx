import type { JSX } from 'react';

export interface SignalDrawerItem {
  id: string;
  group: string;
  severity: 'informational' | 'warning' | 'critical';
  message: string;
  target: {
    page: string;
    entityId: string;
  };
}

export interface SignalDrawerProps {
  open: boolean;
  signals: SignalDrawerItem[];
  onClose: () => void;
  onNavigate: (page: string) => void;
}

export function SignalDrawer({
  open,
  signals,
  onClose,
  onNavigate,
}: SignalDrawerProps): JSX.Element | null {
  if (!open) {
    return null;
  }

  const groupedSignals = new Map<string, SignalDrawerItem[]>();
  for (const signal of signals) {
    const bucket = groupedSignals.get(signal.group) ?? [];
    bucket.push(signal);
    groupedSignals.set(signal.group, bucket);
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <aside className="glass-panel custom-scrollbar absolute right-0 top-0 flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-[var(--border-soft)]">
        <div className="flex items-center justify-between border-b border-[var(--border-soft)] px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[rgba(173,198,255,0.14)] text-[var(--primary)]">
              <SignalIcon />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-[var(--text)]">Signal Center</h2>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Alerts, anomalies, and risk hints for the current dataset.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/5 text-[var(--text-muted)] hover:bg-white/10 hover:text-[var(--text)]"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="flex-1 space-y-6 px-6 py-6">
          {signals.length === 0 ? (
            <div className="panel-muted rounded-3xl border border-dashed border-[var(--border-soft)] px-5 py-10 text-sm text-[var(--text-muted)]">
              No signals available.
            </div>
          ) : (
            [...groupedSignals.entries()].map(([group, items]) => (
              <section key={group}>
                <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-dim)]">
                  {group.replaceAll('_', ' ')}
                </h3>
                <div className="space-y-3">
                  {items.map((signal) => {
                    const severityClasses =
                      signal.severity === 'critical'
                        ? 'border-[rgba(239,68,68,0.35)] bg-[rgba(239,68,68,0.12)]'
                        : signal.severity === 'warning'
                          ? 'border-[rgba(251,191,36,0.35)] bg-[rgba(251,191,36,0.10)]'
                          : 'border-[var(--border-soft)] bg-white/5';

                    return (
                      <button
                        key={signal.id}
                        type="button"
                        onClick={() => {
                          onNavigate(signal.target.page);
                          onClose();
                        }}
                        className={`w-full rounded-3xl border p-4 text-left transition hover:-translate-y-0.5 hover:bg-white/10 ${severityClasses}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-semibold text-[var(--text)]">{signal.group}</span>
                          <span className="data-mono text-[11px] uppercase tracking-[0.16em] text-[var(--text-dim)]">
                            {signal.severity}
                          </span>
                        </div>
                        <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">{signal.message}</p>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>

        <div className="border-t border-[var(--border-soft)] px-6 py-5">
          <button
            type="button"
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--primary)] px-4 py-3 text-sm font-bold text-[#002e6a] transition hover:brightness-110"
          >
            <HistoryIcon />
            Audit Signal History
          </button>
        </div>
      </aside>
    </div>
  );
}

function SignalIcon(): JSX.Element {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 18h16M7 14l3-3 3 2 4-5" />
    </svg>
  );
}

function HistoryIcon(): JSX.Element {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 8v4l3 3M3.05 11A9 9 0 1112 21v0a8.96 8.96 0 01-6.36-2.64M3 4v7h7"
      />
    </svg>
  );
}

function CloseIcon(): JSX.Element {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}