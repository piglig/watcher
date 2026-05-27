/**
 * ai-provider.js — Provider identity & inference, shared across the codebase.
 *
 * Lives in `shared/` (not `classifier/`) so stores and orchestration code
 * can normalise provider without taking a dependency on the classifier feature.
 */

export const AI_PROVIDERS = {
  OPENAI: 'openai',
  GEMINI: 'gemini',
  DEEPSEEK: 'deepseek',
};

export function envNameForProvider(provider) {
  switch (String(provider ?? '').toLowerCase()) {
    case AI_PROVIDERS.GEMINI: return 'GEMINI_API_KEY';
    case AI_PROVIDERS.DEEPSEEK: return 'DEEPSEEK_API_KEY';
    default: return 'OPENAI_API_KEY';
  }
}

export function apiKeyForProvider(provider) {
  return process.env[envNameForProvider(provider)];
}

/**
 * Resolve provider from an explicit value or the model name.
 *
 * @param {string} [model]     e.g. 'gemini-3.1-flash-lite' or 'gpt-4.1-mini'
 * @param {string} [provider]  explicit override; case-insensitive
 * @returns {'openai' | 'gemini' | 'deepseek'}
 */
export function inferProvider(model, provider) {
  if (provider) return String(provider).toLowerCase();
  const m = String(model ?? '').toLowerCase();
  if (m.startsWith('gemini-')) return AI_PROVIDERS.GEMINI;
  if (m.startsWith('deepseek-')) return AI_PROVIDERS.DEEPSEEK;
  return AI_PROVIDERS.OPENAI;
}
