import type { JSX } from 'react';
import { useI18n } from '../i18n.js';
import { SearchBox } from './SearchBox.js';

export interface KeyRankingRow {
  apiKeyId: string;
  apiKeyName: string | null;
  spend: string;
  requestCount: number;
  ownerLabel: string;
  deleted: boolean;
}

export interface KeyRankingTableProps {
  rows: KeyRankingRow[];
  selectedKeyId?: string | null;
  onSelectKey?: (apiKeyId: string) => void;
  searchTerm?: string;
  onSearchTermChange?: (value: string) => void;
}

export function KeyRankingTable({
  rows,
  selectedKeyId = null,
  onSelectKey,
  searchTerm = '',
  onSearchTermChange,
}: KeyRankingTableProps): JSX.Element {
  const { t } = useI18n();
  return (
    <section className="glass-panel rounded-3xl p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-[-0.02em] text-[var(--text)]">
            {t('table.keyRanking')}
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
            {t('table.keyRankingSubtitle')}
          </p>
        </div>
        <SearchBox
          value={searchTerm}
          onChange={(value) => onSearchTermChange?.(value)}
          placeholder={t('table.searchKey')}
        />
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-dim)]">
              <th className="border-b border-[var(--border-soft)] pb-4 pr-4">{t('table.key')}</th>
              <th className="border-b border-[var(--border-soft)] pb-4 pr-4">{t('table.owner')}</th>
              <th className="border-b border-[var(--border-soft)] pb-4 pr-4">{t('table.spend')}</th>
              <th className="border-b border-[var(--border-soft)] pb-4">{t('table.requests')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.apiKeyId}
                className={
                  row.apiKeyId === selectedKeyId
                    ? 'bg-white/6'
                    : 'transition hover:bg-white/4'
                }
              >
                <td className="border-b border-[rgba(66,71,84,0.45)] py-4 pr-4 font-medium text-[var(--text)]">
                  <button
                    type="button"
                    onClick={() => onSelectKey?.(row.apiKeyId)}
                    className="text-left transition hover:text-[var(--primary)]"
                  >
                    <span>{row.apiKeyName || row.apiKeyId}</span>
                  </button>
                  {row.deleted ? (
                    <span className="ml-2 rounded-full border border-[rgba(239,68,68,0.35)] bg-[rgba(239,68,68,0.12)] px-2 py-0.5 text-[11px] font-semibold text-[#ffb4ab]">
                      {t('table.deleted')}
                    </span>
                  ) : null}
                </td>
                <td className="border-b border-[rgba(66,71,84,0.45)] py-4 pr-4 text-[var(--text-muted)]">
                  {row.ownerLabel}
                </td>
                <td className="border-b border-[rgba(66,71,84,0.45)] py-4 pr-4 text-[var(--text-muted)]">
                  ${row.spend}
                </td>
                <td className="border-b border-[rgba(66,71,84,0.45)] py-4 text-[var(--text-muted)]">
                  {row.requestCount.toLocaleString()}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="py-10 text-center text-sm text-[var(--text-dim)]"
                >
                  {t('table.emptyKeys')}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
