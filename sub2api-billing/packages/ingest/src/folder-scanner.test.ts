import { describe, it, expect } from 'vitest';
import type { MonthlySummaryRecord } from '@core/compute';
import {
  isValidBillingMonthFolder,
  billingMonthFromFolder,
  fillBillingMonthFromFolder,
} from './folder-scanner.js';

describe('isValidBillingMonthFolder (Requirement 1.1)', () => {
  it('accepts well-formed YYYY-MM folder names', () => {
    expect(isValidBillingMonthFolder('2026-04')).toBe(true);
    expect(isValidBillingMonthFolder('2026-05')).toBe(true);
    expect(isValidBillingMonthFolder('0001-01')).toBe(true);
    expect(isValidBillingMonthFolder('9999-12')).toBe(true);
  });

  it('accepts every month in the 01-12 range', () => {
    for (let month = 1; month <= 12; month++) {
      const name = `2026-${String(month).padStart(2, '0')}`;
      expect(isValidBillingMonthFolder(name)).toBe(true);
    }
  });

  it('rejects months outside 01-12', () => {
    expect(isValidBillingMonthFolder('2026-00')).toBe(false);
    expect(isValidBillingMonthFolder('2026-13')).toBe(false);
    expect(isValidBillingMonthFolder('2026-99')).toBe(false);
  });

  it('rejects the wrong number of digits', () => {
    expect(isValidBillingMonthFolder('226-04')).toBe(false);
    expect(isValidBillingMonthFolder('20226-04')).toBe(false);
    expect(isValidBillingMonthFolder('2026-4')).toBe(false);
    expect(isValidBillingMonthFolder('2026-004')).toBe(false);
  });

  it('rejects names with the wrong separator or extra segments', () => {
    expect(isValidBillingMonthFolder('2026_04')).toBe(false);
    expect(isValidBillingMonthFolder('2026/04')).toBe(false);
    expect(isValidBillingMonthFolder('2026-04-01')).toBe(false);
  });

  it('rejects surrounding whitespace, newlines, and empty names', () => {
    expect(isValidBillingMonthFolder(' 2026-04')).toBe(false);
    expect(isValidBillingMonthFolder('2026-04 ')).toBe(false);
    expect(isValidBillingMonthFolder('2026-04\n')).toBe(false);
    expect(isValidBillingMonthFolder('')).toBe(false);
  });

  it('rejects non-numeric content', () => {
    expect(isValidBillingMonthFolder('README')).toBe(false);
    expect(isValidBillingMonthFolder('20xx-04')).toBe(false);
    expect(isValidBillingMonthFolder('YYYY-MM')).toBe(false);
  });
});

describe('billingMonthFromFolder (Requirement 1.3)', () => {
  it('returns the folder name for a valid billing folder', () => {
    expect(billingMonthFromFolder('2026-04')).toBe('2026-04');
    expect(billingMonthFromFolder('2026-12')).toBe('2026-12');
  });

  it('throws for a name that is not a valid billing folder', () => {
    expect(() => billingMonthFromFolder('2026-13')).toThrow(RangeError);
    expect(() => billingMonthFromFolder('not-a-month')).toThrow(RangeError);
    expect(() => billingMonthFromFolder('')).toThrow(RangeError);
  });
});

describe('fillBillingMonthFromFolder (Requirement 1.3)', () => {
  const baseRecord = (billing_month: string): MonthlySummaryRecord =>
    ({ billing_month, user_id: 'u1' }) as MonthlySummaryRecord;

  it('fills an empty billing_month from the folder name', () => {
    const filled = fillBillingMonthFromFolder(baseRecord(''), '2026-04');
    expect(filled.billing_month).toBe('2026-04');
  });

  it('fills a whitespace-only billing_month from the folder name', () => {
    expect(fillBillingMonthFromFolder(baseRecord('   '), '2026-05').billing_month).toBe('2026-05');
    expect(fillBillingMonthFromFolder(baseRecord('\t\n'), '2026-05').billing_month).toBe('2026-05');
  });

  it('retains a populated billing_month unchanged', () => {
    const filled = fillBillingMonthFromFolder(baseRecord('2026-04'), '2026-05');
    expect(filled.billing_month).toBe('2026-04');
  });

  it('does not mutate the input record', () => {
    const original = baseRecord('');
    const filled = fillBillingMonthFromFolder(original, '2026-04');
    expect(original.billing_month).toBe('');
    expect(filled).not.toBe(original);
  });

  it('returns the same record reference when no fallback is needed', () => {
    const original = baseRecord('2026-04');
    expect(fillBillingMonthFromFolder(original, '2026-05')).toBe(original);
  });

  it('throws when the fallback is needed but the folder name is invalid', () => {
    expect(() => fillBillingMonthFromFolder(baseRecord(''), 'bad-folder')).toThrow(RangeError);
  });

  it('works across record types exposing billing_month (Daily/Model/Key/RequestDetail shape)', () => {
    const daily = { billing_month: '', user_id: 'u1', usage_date: new Date() };
    expect(fillBillingMonthFromFolder(daily, '2026-06').billing_month).toBe('2026-06');
  });
});
