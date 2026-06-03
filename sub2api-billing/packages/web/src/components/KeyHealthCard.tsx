import type { JSX } from 'react';

export interface KeyHealthCardProps {
  longUnused: number;
  highFrequency: number;
  abnormalGrowth: number;
}

export function KeyHealthCard({
  longUnused,
  highFrequency,
  abnormalGrowth,
}: KeyHealthCardProps): JSX.Element {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="text-base font-semibold text-neutral-950 dark:text-neutral-50">
        Key Health
      </h2>
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
        Summary of long-unused, high-frequency, and abnormal-growth API keys.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <HealthStat label="Long Unused" value={longUnused} tone="amber" />
        <HealthStat label="High Frequency" value={highFrequency} tone="blue" />
        <HealthStat label="Abnormal Growth" value={abnormalGrowth} tone="red" />
      </div>
    </section>
  );
}

function HealthStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'amber' | 'blue' | 'red';
}): JSX.Element {
  const toneClass =
    tone === 'amber'
      ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300'
      : tone === 'blue'
        ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300'
        : 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300';

  return (
    <div className={`rounded-lg px-4 py-4 ${toneClass}`}>
      <p className="text-sm font-medium">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}
