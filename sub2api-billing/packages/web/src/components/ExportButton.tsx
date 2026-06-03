import type { JSX } from 'react';
import { buildExportUrl } from '../lib/api.js';

export interface ExportButtonProps {
  pageName: string;
  billingMonth: string;
  disabled?: boolean;
}

export function ExportButton({
  pageName,
  billingMonth,
  disabled = false,
}: ExportButtonProps): JSX.Element {
  return (
    <a
      href={disabled ? undefined : buildExportUrl(pageName, billingMonth)}
      aria-disabled={disabled}
      className={`inline-flex items-center rounded-md px-3 py-2 text-sm font-medium ${
        disabled
          ? 'cursor-not-allowed bg-neutral-200 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-500'
          : 'bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-950 dark:hover:bg-white'
      }`}
    >
      Export CSV
    </a>
  );
}
