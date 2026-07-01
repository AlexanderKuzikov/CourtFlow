// packages/core/retry.ts
// Exponential backoff для нестабильных серверов судов.

export interface RetryOptions {
  attempts: number;
  backoffMs: number;
  timeoutMs: number;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
  label: string
): Promise<T> {
  let lastError: Error = new Error('Unknown error');

  for (let attempt = 1; attempt <= options.attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < options.attempts) {
        const delay = options.backoffMs * Math.pow(2, attempt - 1);
        console.warn(`[retry] ${label} — попытка ${attempt}/${options.attempts} неудачна: ${lastError.message}. Ждём ${delay}ms...`);
        await sleep(delay);
      }
    }
  }

  throw new Error(`[retry] ${label} — все попытки исчерпаны: ${lastError.message}`);
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
