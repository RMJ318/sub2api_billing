import type { ModelFamily } from './types/model-family.js';

/**
 * Classify a model name into exactly one {@link ModelFamily} (Requirement 6).
 *
 * This is the single shared classifier used by the Dashboard, Model Analysis,
 * and Cost Analysis surfaces (Requirement 6.5) so model-family grouping is
 * consistent everywhere. It is a pure, total function: every input string maps
 * to exactly one family and it has no side effects.
 *
 * Documented precedence (first matching rule wins):
 *  1. GPT    — the name begins with `gpt` or `codex` (Requirement 6.1).
 *  2. Claude — the name contains `claude`            (Requirement 6.2).
 *  3. Gemini — the name contains `gemini`            (Requirement 6.3).
 *  4. Other  — no rule matches                       (Requirement 6.4).
 *
 * Matching is performed against the documented lowercase tokens exactly as
 * written in the requirements. Requirement 6 — unlike the `stream` field in
 * Requirement 2.6 — does not specify case-insensitive matching, so no case
 * normalization is applied; model names are already trimmed by the CSV parser
 * (Requirement 2.7) before reaching the classifier.
 *
 * @param modelName - The model name to classify.
 * @returns The {@link ModelFamily} the model belongs to.
 */
export function classifyModelFamily(modelName: string): ModelFamily {
  if (modelName.startsWith('gpt') || modelName.startsWith('codex')) {
    return 'GPT';
  }
  if (modelName.includes('claude')) {
    return 'Claude';
  }
  if (modelName.includes('gemini')) {
    return 'Gemini';
  }
  return 'Other';
}
