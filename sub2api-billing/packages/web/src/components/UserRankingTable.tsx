import type { JSX } from 'react';
import type { UserAggregatesResponse } from '../lib/api.js';
import { SearchBox } from './SearchBox.js';

export interface UserRankingTableProps {
  rows: UserAggregatesResponse['rankings'];
  selectedUserId?: string | null;
  onSelectUser?: (userId: string) => void;
  searchTerm?: string;
  onSearchTermChange?: (value: string) => void;
}

export function UserRankingTable({
  rows,
  selectedUserId = null,
  onSelectUser,
  searchTerm = '',
  onSearchTermChange,
}: UserRankingTableProps): JSX.Element {
  return (
    <section className="glass-panel rounded-3xl p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-[-0.02em] text-[var(--text)]">
            User Ranking
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
            Top users by spend for the selected month.
          </p>
        </div>
        <SearchBox
          value={searchTerm}
          onChange={(value) => onSearchTermChange?.(value)}
          placeholder="Search user"
        />
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-dim)]">
              <th className="border-b border-[var(--border-soft)] pb-4 pr-4">User</th>
              <th className="border-b border-[var(--border-soft)] pb-4 pr-4">Spend</th>
              <th className="border-b border-[var(--border-soft)] pb-4 pr-4">Requests</th>
              <th className="border-b border-[var(--border-soft)] pb-4 pr-4">Tokens</th>
              <th className="border-b border-[var(--border-soft)] pb-4">API Keys</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.userId}
                className={
                  row.userId === selectedUserId
                    ? 'bg-white/6'
                    : 'transition hover:bg-white/4'
                }
              >
                <td className="border-b border-[rgba(66,71,84,0.45)] py-4 pr-4 font-medium text-[var(--text)]">
                  <button
                    type="button"
                    onClick={() => onSelectUser?.(row.userId)}
                    className="text-left transition hover:text-[var(--primary)]"
                  >
                    {row.label}
                  </button>
                </td>
                <td className="border-b border-[rgba(66,71,84,0.45)] py-4 pr-4 text-[var(--text-muted)]">
                  ${row.spend}
                </td>
                <td className="border-b border-[rgba(66,71,84,0.45)] py-4 pr-4 text-[var(--text-muted)]">
                  {row.requestCount.toLocaleString()}
                </td>
                <td className="border-b border-[rgba(66,71,84,0.45)] py-4 pr-4 text-[var(--text-muted)]">
                  {row.totalTokens.toLocaleString()}
                </td>
                <td className="border-b border-[rgba(66,71,84,0.45)] py-4 text-[var(--text-muted)]">
                  {row.apiKeyCount}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="py-10 text-center text-sm text-[var(--text-dim)]"
                >
                  No users match the current search.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
