/**
 * Model family grouping (Requirement 6).
 *
 * Every model name is classified into exactly one of these families using the
 * documented precedence: GPT when the name begins with `gpt`/`codex`, Claude
 * when it contains `claude`, Gemini when it contains `gemini`, else Other.
 */
export type ModelFamily = 'GPT' | 'Claude' | 'Gemini' | 'Other';

/** All model families in display order; useful for building grouped views. */
export const MODEL_FAMILIES: readonly ModelFamily[] = ['GPT', 'Claude', 'Gemini', 'Other'];
