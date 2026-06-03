import type { JSX } from 'react';
import type { UserAggregatesResponse } from '../lib/api.js';

export interface UserRankingTableProps {
  rows: UserAggregatesResponse['rankings'];
  selectedUserId?: string | null;
  onSelectUser?: (userId: string) => void;
}

export function UserRankingTable({
  rows,
  selectedUserId = null,
  onSelectUser,
}: UserRankingTableProps): JSX.Element {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-neutral-950 dark:text-neutral-50">
            User Ranking
          </h2>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Top users by spend for the selected month.
          </p>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full divide-y divide-neutral-200 text-sm dark:divide-neutral-800">
          <thead>
            <tr className="text-left text-neutral-500 dark:text-neutral-400">
              <th className="pb-3 pr-4 font-medium">User</th>
              <th className="pb-3 pr-4 font-medium">Spend</th>
              <th className="pb-3 pr-4 font-medium">Requests</th>
              <th className="pb-3 pr-4 font-medium">Tokens</th>
              <th className="pb-3 font-medium">API Keys</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-900">
            {rows.map((row) => (
              <tr
                key={row.userId}
                className={
                  row.userId === selectedUserId
                    ? 'bg-neutral-100 dark:bg-neutral-800/50'
                    : ''
                }
              >
                <td className="py-3 pr-4 font-medium text-neutral-950 dark:text-neutral-50">
                  <button
                    type="button"
                    onClick={() => onSelectUser?.(row.userId)}
                    className="text-left hover:underline"
                  >
                    {row.label}
                  </button>
                </td>
                <td className="py-3 pr-4 text-neutral-600 dark:text-neutral-300">
                  ${row.spend}
                </td>
                <td className="py-3 pr-4 text-neutral-600 dark:text-neutral-300">
                  {row.requestCount.toLocaleString()}
                </td>
                <td className="py-3 pr-4 text-neutral-600 dark:text-neutral-300">
                  {row.totalTokens.toLocaleString()}
                </td>
                <td className="py-3 text-neutral-600 dark:text-neutral-300">
                  {row.apiKeyCount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
