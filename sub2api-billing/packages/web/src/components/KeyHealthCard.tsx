import type { JSX } from 'react';
import { useI18n } from '../i18n.js';

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
  const { t } = useI18n();
  return (
    <section className="glass-panel rounded-3xl p-5">
      <h2 className="text-2xl font-semibold tracking-[-0.02em] text-[var(--text)]">
        {t('table.keyHealth')}
      </h2>
      <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
        {t('table.keyHealthSubtitle')}
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <HealthStat label={t('health.longUnused')} value={longUnused} tone="amber" />
        <HealthStat label={t('health.highFrequency')} value={highFrequency} tone="blue" />
        <HealthStat label={t('health.abnormalGrowth')} value={abnormalGrowth} tone="red" />
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
      ? 'border-[rgba(217,119,6,0.18)] bg-[rgba(217,119,6,0.12)] text-[#ffca7a]'
      : tone === 'blue'
        ? 'border-[rgba(77,142,255,0.18)] bg-[rgba(77,142,255,0.12)] text-[var(--primary)]'
        : 'border-[rgba(239,68,68,0.2)] bg-[rgba(239,68,68,0.12)] text-[#ffb4ab]';

  return (
    <div className={`rounded-2xl border px-4 py-4 ${toneClass}`}>
      <p className="text-sm font-medium">{label}</p>
      <p className="mt-3 text-4xl font-semibold tracking-[-0.03em]">{value}</p>
    </div>
  );
}
