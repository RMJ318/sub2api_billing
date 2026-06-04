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
      className={`app-button-primary ${
        disabled
          ? 'pointer-events-none cursor-not-allowed opacity-45'
          : ''
      }`}
    >
      Export CSV
    </a>
  );
}
