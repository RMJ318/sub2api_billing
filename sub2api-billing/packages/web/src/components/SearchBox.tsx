import type { JSX } from 'react';

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
  return (
    <input
      type="search"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="app-input w-full max-w-56"
    />
  );
}
