import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { classifyModelFamily } from './classify-model-family.js';
import { MODEL_FAMILIES, type ModelFamily } from './types/model-family.js';

/**
 * Property 1: Model family classification is total and rule-consistent.
 *
 * For any model name string, `classifyModelFamily` returns exactly one of GPT,
 * Claude, Gemini, or Other; it returns GPT when the name begins with `gpt` or
 * `codex`, Claude when the name contains `claude`, Gemini when the name
 * contains `gemini` (applying the documented precedence), and Other when no
 * rule matches.
 *
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4
 */

/**
 * Independent specification of the documented precedence (design Requirement 6,
 * clauses 6.1-6.4). This encodes the *rules* the implementation must satisfy so
 * the property can check rule-consistency without reaching into the
 * implementation:
 *   1. GPT    when the name begins with `gpt` or `codex`   (6.1)
 *   2. Claude when the name contains `claude`              (6.2)
 *   3. Gemini when the name contains `gemini`              (6.3)
 *   4. Other  when no rule matches                         (6.4)
 */
function expectedFamily(name: string): ModelFamily {
  if (name.startsWith('gpt') || name.startsWith('codex')) {
    return 'GPT';
  }
  if (name.includes('claude')) {
    return 'Claude';
  }
  if (name.includes('gemini')) {
    return 'Gemini';
  }
  return 'Other';
}

const families = new Set<ModelFamily>(MODEL_FAMILIES);

// --- Smart generators that intentionally hit each rule branch ---------------

/** Names beginning with a GPT-family prefix (Requirement 6.1). */
const gptPrefixed = fc
  .tuple(fc.constantFrom('gpt', 'codex'), fc.string())
  .map(([prefix, suffix]) => prefix + suffix);

/** Names that embed `claude` but do not begin with a GPT prefix (Req 6.2). */
const claudeContaining = fc
  .tuple(fc.string(), fc.string())
  .map(([before, after]) => `${before}claude${after}`)
  .filter((s) => !s.startsWith('gpt') && !s.startsWith('codex'));

/**
 * Names that embed `gemini` but neither begin with a GPT prefix nor contain
 * `claude`, so the Gemini rule is the first to match (Req 6.3).
 */
const geminiContaining = fc
  .tuple(fc.string(), fc.string())
  .map(([before, after]) => `${before}gemini${after}`)
  .filter((s) => !s.startsWith('gpt') && !s.startsWith('codex') && !s.includes('claude'));

/**
 * A token alphabet biased toward the substrings/prefixes that drive the rules,
 * so freely-generated strings still frequently exercise every branch and the
 * precedence between overlapping matches.
 */
const ruleFlavoredString = fc
  .array(fc.constantFrom('gpt', 'codex', 'claude', 'gemini', '-', '.', '4', 'o', 'x', 'mini', 'pro'), {
    maxLength: 8,
  })
  .map((parts) => parts.join(''));

/** The full input space: arbitrary unicode plus the rule-flavored strings. */
const anyModelName = fc.oneof(
  fc.string(),
  fc.string({ unit: 'binary' }),
  ruleFlavoredString,
  gptPrefixed,
  claudeContaining,
  geminiContaining,
);

describe('Property 1: model family classification is total and rule-consistent', () => {
  it('is total: every string maps to exactly one of the four families', () => {
    fc.assert(
      fc.property(anyModelName, (name) => {
        const family = classifyModelFamily(name);
        // Exactly one of the four documented families, and a stable single value.
        expect(families.has(family)).toBe(true);
        expect(classifyModelFamily(name)).toBe(family);
      }),
    );
  });

  it('is rule-consistent: output matches the documented precedence for any string', () => {
    fc.assert(
      fc.property(anyModelName, (name) => {
        expect(classifyModelFamily(name)).toBe(expectedFamily(name));
      }),
    );
  });

  it('classifies GPT-prefixed names as GPT regardless of other tokens (Req 6.1 precedence)', () => {
    fc.assert(
      fc.property(gptPrefixed, (name) => {
        // GPT prefix wins even when the name also contains claude/gemini.
        expect(classifyModelFamily(name)).toBe('GPT');
      }),
    );
  });

  it('classifies non-GPT names containing `claude` as Claude (Req 6.2)', () => {
    fc.assert(
      fc.property(claudeContaining, (name) => {
        expect(classifyModelFamily(name)).toBe('Claude');
      }),
    );
  });

  it('classifies `gemini` names without GPT/Claude matches as Gemini (Req 6.3)', () => {
    fc.assert(
      fc.property(geminiContaining, (name) => {
        expect(classifyModelFamily(name)).toBe('Gemini');
      }),
    );
  });

  it('classifies names matching no rule as Other (Req 6.4)', () => {
    const noRuleMatch = anyModelName.filter(
      (s) =>
        !s.startsWith('gpt') &&
        !s.startsWith('codex') &&
        !s.includes('claude') &&
        !s.includes('gemini'),
    );
    fc.assert(
      fc.property(noRuleMatch, (name) => {
        expect(classifyModelFamily(name)).toBe('Other');
      }),
    );
  });
});
