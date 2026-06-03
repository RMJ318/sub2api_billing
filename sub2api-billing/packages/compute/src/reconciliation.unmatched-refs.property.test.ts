import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { detectUnmatchedReferences } from './index.js';
import type { KeyUsageRecord, RequestDetailRecord } from './index.js';

/**
 * Property 33: Unmatched API key references are retained and logged.
 *
 * For any Request_Detail_Record whose `api_key_id` has no matching
 * Key_Usage_Record for the same Billing_Month, an unmatched-reference entry
 * is recorded and the Request_Detail_Record remains available for query.
 *
 * **Validates: Requirements 21.3**
 */

// --- Generators ---

/** A valid YYYY-MM billing month. */
const billingMonthArb = fc
  .tuple(
    fc.integer({ min: 2020, max: 2030 }),
    fc.integer({ min: 1, max: 12 }),
  )
  .map(([y, m]) => `${y}-${String(m).padStart(2, '0')}`);

/** A non-empty identifier string (used for api_key_id, user_id, request_id). */
const idArb = fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0);

/** Generate a minimal RequestDetailRecord with the required fields. */
function requestDetailArb(opts?: {
  apiKeyId?: fc.Arbitrary<string>;
  billingMonth?: fc.Arbitrary<string>;
}): fc.Arbitrary<RequestDetailRecord> {
  return fc
    .record({
      request_id: idArb,
      api_key_id: opts?.apiKeyId ?? idArb,
      user_id: idArb,
      billing_month: opts?.billingMonth ?? billingMonthArb,
    })
    .map((r) => ({
      ...r,
      created_at: null,
      email: null,
      username: null,
      api_key_name: null,
      model: null,
      inbound_endpoint: null,
      upstream_endpoint: null,
      input_tokens: null,
      output_tokens: null,
      cache_creation_tokens: null,
      cache_read_tokens: null,
      image_output_tokens: null,
      image_count: null,
      total_cost_usd: null,
      actual_cost_usd: null,
      duration_ms: null,
      first_token_ms: null,
      stream: null,
      ip_address: null,
      user_agent: null,
    }));
}

/** Generate a minimal KeyUsageRecord with the required fields. */
function keyUsageArb(opts?: {
  apiKeyId?: fc.Arbitrary<string>;
  billingMonth?: fc.Arbitrary<string>;
}): fc.Arbitrary<KeyUsageRecord> {
  return fc
    .record({
      api_key_id: opts?.apiKeyId ?? idArb,
      user_id: idArb,
      billing_month: opts?.billingMonth ?? billingMonthArb,
    })
    .map((r) => ({
      ...r,
      email: null,
      username: null,
      api_key_name: null,
      api_key_status: null,
      api_key_deleted: null,
      request_count: null,
      used_usd: null,
      input_tokens: null,
      output_tokens: null,
      first_request_at: null,
      last_request_at: null,
    }));
}

/**
 * Generate a scenario with a mix of matched and unmatched request detail
 * records. Returns the details, keys, and which api_key_id + billing_month
 * pairs are expected to be unmatched.
 */
const scenarioArb = fc
  .record({
    // Key records that will form the "known" set.
    keys: fc.array(keyUsageArb(), { minLength: 0, maxLength: 10 }),
    // Request details that reference known keys (matched).
    matchedDetails: fc.array(
      fc.tuple(idArb, idArb).chain(([requestId, userId]) =>
        fc.tuple(
          fc.constant(requestId),
          fc.constant(userId),
          // We'll assign a known key id + month in the map step below
        ),
      ),
      { minLength: 0, maxLength: 10 },
    ),
    // Request details with unique key ids that will NOT be in key records (unmatched).
    unmatchedDetails: fc.array(requestDetailArb(), { minLength: 0, maxLength: 10 }),
  });

describe('Property 33: Unmatched API key references are retained and logged', () => {
  it('request details whose api_key_id has no matching key record are detected', () => {
    fc.assert(
      fc.property(
        fc.array(requestDetailArb(), { minLength: 1, maxLength: 20 }),
        fc.array(keyUsageArb(), { minLength: 0, maxLength: 10 }),
        (details, keys) => {
          const result = detectUnmatchedReferences(details, keys);

          // Build the set of known keys (api_key_id | billing_month).
          const knownKeys = new Set<string>();
          for (const key of keys) {
            knownKeys.add(`${key.api_key_id}|${key.billing_month}`);
          }

          // Every unique unmatched api_key_id + billing_month from the input
          // should appear in the result.
          const expectedUnmatched = new Set<string>();
          for (const detail of details) {
            const composite = `${detail.api_key_id}|${detail.billing_month}`;
            if (!knownKeys.has(composite)) {
              expectedUnmatched.add(composite);
            }
          }

          const actualUnmatched = new Set(
            result.unmatchedReferences.map((r) => `${r.apiKeyId}|${r.month}`),
          );

          expect(actualUnmatched).toEqual(expectedUnmatched);
        },
      ),
    );
  });

  it('unmatched records are retained (input array is never mutated)', () => {
    fc.assert(
      fc.property(
        fc.array(requestDetailArb(), { minLength: 1, maxLength: 20 }),
        fc.array(keyUsageArb(), { minLength: 0, maxLength: 10 }),
        (details, keys) => {
          const originalLength = details.length;
          const originalIds = details.map((d) => d.request_id);

          detectUnmatchedReferences(details, keys);

          // The input array is unchanged — records are retained, not discarded.
          expect(details).toHaveLength(originalLength);
          expect(details.map((d) => d.request_id)).toEqual(originalIds);
        },
      ),
    );
  });

  it('each unique unmatched api_key_id + billing_month pair produces exactly one log entry', () => {
    fc.assert(
      fc.property(
        fc.array(requestDetailArb(), { minLength: 1, maxLength: 30 }),
        fc.array(keyUsageArb(), { minLength: 0, maxLength: 10 }),
        (details, keys) => {
          const result = detectUnmatchedReferences(details, keys);

          // Build the set of known keys.
          const knownKeys = new Set<string>();
          for (const key of keys) {
            knownKeys.add(`${key.api_key_id}|${key.billing_month}`);
          }

          // Count unique unmatched pairs in the input.
          const expectedPairs = new Set<string>();
          for (const detail of details) {
            const composite = `${detail.api_key_id}|${detail.billing_month}`;
            if (!knownKeys.has(composite)) {
              expectedPairs.add(composite);
            }
          }

          // One log entry per unique unmatched pair — no duplicates.
          expect(result.logEntries).toHaveLength(expectedPairs.size);
          expect(result.unmatchedReferences).toHaveLength(expectedPairs.size);

          // Each log entry has type 'unmatched_reference'.
          for (const entry of result.logEntries) {
            expect(entry).toHaveProperty('type', 'unmatched_reference');
          }
        },
      ),
    );
  });

  it('records whose api_key_id IS in the key records are NOT flagged', () => {
    fc.assert(
      fc.property(
        // Generate a shared key id and billing month to ensure matching.
        idArb,
        billingMonthArb,
        fc.array(idArb, { minLength: 1, maxLength: 10 }),
        (sharedKeyId, sharedMonth, requestIds) => {
          // Create details that all reference the shared key.
          const details: RequestDetailRecord[] = requestIds.map((rid) => ({
            request_id: rid,
            api_key_id: sharedKeyId,
            user_id: 'user1',
            billing_month: sharedMonth,
            created_at: null,
            email: null,
            username: null,
            api_key_name: null,
            model: null,
            inbound_endpoint: null,
            upstream_endpoint: null,
            input_tokens: null,
            output_tokens: null,
            cache_creation_tokens: null,
            cache_read_tokens: null,
            image_output_tokens: null,
            image_count: null,
            total_cost_usd: null,
            actual_cost_usd: null,
            duration_ms: null,
            first_token_ms: null,
            stream: null,
            ip_address: null,
            user_agent: null,
          }));

          // Key record that matches the shared api_key_id + billing_month.
          const keys: KeyUsageRecord[] = [
            {
              api_key_id: sharedKeyId,
              user_id: 'user1',
              billing_month: sharedMonth,
              email: null,
              username: null,
              api_key_name: null,
              api_key_status: null,
              api_key_deleted: null,
              request_count: null,
              used_usd: null,
              input_tokens: null,
              output_tokens: null,
              first_request_at: null,
              last_request_at: null,
            },
          ];

          const result = detectUnmatchedReferences(details, keys);

          // No unmatched references when the key is present for the same month.
          expect(result.unmatchedReferences).toHaveLength(0);
          expect(result.logEntries).toHaveLength(0);
        },
      ),
    );
  });
});
