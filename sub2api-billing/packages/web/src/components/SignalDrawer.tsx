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
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden="true" />
      <aside className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto border-l border-neutral-200 bg-white p-5 shadow-2xl dark:border-neutral-800 dark:bg-neutral-950">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-neutral-950 dark:text-neutral-50">
              Signal Center
            </h2>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Alerts, anomalies, and risk hints for the current dataset.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-900"
          >
            Close
          </button>
        </div>

        <div className="mt-5 space-y-3">
          {signals.length === 0 ? (
            <div className="rounded-lg border border-dashed border-neutral-300 px-4 py-6 text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
              No signals available.
            </div>
          ) : (
            [...groupedSignals.entries()].map(([group, items]) => (
              <section key={group}>
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                  {group}
                </h3>
                <div className="space-y-3">
                  {items.map((signal) => (
                    <button
                      key={signal.id}
                      type="button"
                      onClick={() => {
                        onNavigate(signal.target.page);
                        onClose();
                      }}
                      className="w-full rounded-lg border border-neutral-200 px-4 py-4 text-left hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold text-neutral-950 dark:text-neutral-50">
                          {signal.group}
                        </span>
                        <span className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                          {signal.severity}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
                        {signal.message}
                      </p>
                    </button>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </aside>
    </div>
  );
}
