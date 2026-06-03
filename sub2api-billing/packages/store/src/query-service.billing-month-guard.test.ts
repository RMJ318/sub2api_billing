import { describe, it, expect } from 'vitest';
import { queryRequestDetailService } from './query-service.js';

/**
 * Unit test for the missing-Billing_Month guard (Task 17.5, Requirement 3.3).
 *
 * Verifies that a request without a valid billingMonth is rejected with an
 * error response and no records, before any DuckDB access occurs. The
 * connection is intentionally passed as a spy/trap: if the guard ever touches
 * DuckDB, the test will throw or fail, proving the guard fires first.
 */

/**
 * A trap connection that explodes if any method is called on it. This proves
 * the guard rejects BEFORE DuckDB is accessed (Req 3.3).
 */
const CONNECTION_TRAP = new Proxy(
  {},
  {
    get(_target, prop) {
      throw new Error(
        `DuckDB connection accessed (property "${String(prop)}") — ` +
          'the Billing_Month guard must reject before any DuckDB access.',
      );
    },
  },
) as never;

describe('missing-Billing_Month guard (Req 3.3)', () => {
  it('rejects when billingMonth is undefined', async () => {
    const result = await queryRequestDetailService(CONNECTION_TRAP, {});

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('billing_month_required');
      expect(result.error).toMatch(/billing.month/i);
    }
  });

  it('rejects when billingMonth is an empty string', async () => {
    const result = await queryRequestDetailService(CONNECTION_TRAP, { billingMonth: '' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('billing_month_required');
      expect(result.error).toMatch(/billing.month/i);
    }
  });

  it('rejects when billingMonth is whitespace-only', async () => {
    const result = await queryRequestDetailService(CONNECTION_TRAP, { billingMonth: '   ' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('billing_month_required');
      expect(result.error).toMatch(/billing.month/i);
    }
  });

  it('rejects when billingMonth is tabs and newlines', async () => {
    const result = await queryRequestDetailService(CONNECTION_TRAP, {
      billingMonth: '\t\n  \r',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('billing_month_required');
      expect(result.error).toMatch(/billing.month/i);
    }
  });

  it('never returns records on rejection', async () => {
    const result = await queryRequestDetailService(CONNECTION_TRAP, {});

    expect(result.ok).toBe(false);
    if (!result.ok) {
      // A rejected response has no `page` property — no records leak out.
      expect('page' in result).toBe(false);
    }
  });

  it('does not access DuckDB even when other filters are provided', async () => {
    // Provide all optional filters but omit billingMonth — guard must still fire first.
    const result = await queryRequestDetailService(CONNECTION_TRAP, {
      userId: 'u1',
      model: 'gpt-4o',
      apiKeyId: 'k1',
      page: 1,
      pageSize: 50,
      sortBy: 'created_at',
      sortDir: 'desc',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('billing_month_required');
      expect(result.error).toMatch(/billing.month/i);
    }
  });
});
