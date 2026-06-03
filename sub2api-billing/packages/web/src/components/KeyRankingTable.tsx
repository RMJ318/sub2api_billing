import type { JSX } from 'react';

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
}

export function KeyRankingTable({
  rows,
  selectedKeyId = null,
  onSelectKey,
}: KeyRankingTableProps): JSX.Element {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="text-base font-semibold text-neutral-950 dark:text-neutral-50">
        API Key Ranking
      </h2>
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
        Spend and usage by API key for the selected month.
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full divide-y divide-neutral-200 text-sm dark:divide-neutral-800">
          <thead>
            <tr className="text-left text-neutral-500 dark:text-neutral-400">
              <th className="pb-3 pr-4 font-medium">Key</th>
              <th className="pb-3 pr-4 font-medium">Owner</th>
              <th className="pb-3 pr-4 font-medium">Spend</th>
              <th className="pb-3 font-medium">Requests</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-900">
            {rows.map((row) => (
              <tr
                key={row.apiKeyId}
                className={
                  row.apiKeyId === selectedKeyId
                    ? 'bg-neutral-100 dark:bg-neutral-800/50'
                    : ''
                }
              >
                <td className="py-3 pr-4 font-medium text-neutral-950 dark:text-neutral-50">
                  <button
                    type="button"
                    onClick={() => onSelectKey?.(row.apiKeyId)}
                    className="text-left hover:underline"
                  >
                    <span>{row.apiKeyName || row.apiKeyId}</span>
                  </button>
                  {row.deleted ? (
                    <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-300">
                      Deleted
                    </span>
                  ) : null}
                </td>
                <td className="py-3 pr-4 text-neutral-600 dark:text-neutral-300">
                  {row.ownerLabel}
                </td>
                <td className="py-3 pr-4 text-neutral-600 dark:text-neutral-300">
                  ${row.spend}
                </td>
                <td className="py-3 text-neutral-600 dark:text-neutral-300">
                  {row.requestCount.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
