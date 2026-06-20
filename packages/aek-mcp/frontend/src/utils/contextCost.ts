/**
 * Format token count with k suffix for thousands.
 * e.g., 1500 → "1.5k", 429 → "429", 10000 → "10k"
 */
export function formatTokens(tokens: number | undefined | null): string {
  if (tokens == null || isNaN(tokens)) return '0';
  if (tokens >= 1000) {
    return (tokens / 1000).toFixed(tokens >= 10000 ? 0 : 1) + 'k';
  }
  return tokens.toString();
}

/**
 * Calculate percent saved: (gross - exposed) / gross * 100
 * Returns 0 if gross is 0.
 */
export function percentSaved(exposed: number, gross: number): number {
  if (!gross || gross === 0) return 0;
  return Math.round(((gross - exposed) / gross) * 100);
}
