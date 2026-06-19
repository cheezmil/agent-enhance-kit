/**
 * Format token count with k suffix for thousands.
 * e.g., 1500 → "1.5k", 429 → "429", 10000 → "10k"
 */
export function formatTokens(tokens: number | undefined | null): string {
  if (tokens == null || isNaN(tokens)) return '0';
  if (tokens >= 1000) {
    const k = tokens / 1000;
    return k % 1 === 0 ? `${k}k` : `${k.toFixed(1)}k`;
  }
  return String(tokens);
}
