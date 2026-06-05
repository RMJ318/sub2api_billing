import type { JSX } from 'react';
import { buildExportUrl } from '../lib/api.js';
import { useI18n } from '../i18n.js';

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
  const { t } = useI18n();
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
      {t('toolbar.export')}
    </a>
  );
}
