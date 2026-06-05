import type { JSX } from 'react';
import { useI18n } from '../i18n.js';

export interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SearchBox({
  value,
  onChange,
  placeholder = 'Search',
}: SearchBoxProps): JSX.Element {
  const { t } = useI18n();
  return (
    <input
      type="search"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder === 'Search' ? t('table.searchUser') : placeholder}
      className="app-input w-full max-w-56"
    />
  );
}
