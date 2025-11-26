import { logger } from '@services/logger/index.ts';
import { sleep } from './sleep.ts';

/**
 * Retry options
 */
export interface RetryOptions {
  /**
   * Maximum number of retry attempts
   */
  maxAttempts: number;

  /**
   * Initial delay between retries (ms)
   */
  delay: number;

  /**
   * Backoff multiplier (exponential backoff)
   * 1 = constant delay, 2 = exponential backoff
   */
  backoff?: number;

  /**
   * Maximum delay between retries (ms)
   * Prevents exponential backoff from getting too large
   */
  maxDelay?: number;

  /**
   * Function to determine if error is retryable
   */
  shouldRetry?: (error: Error) => boolean;

  /**
   * Callback called before each retry
   */
  onRetry?: (error: Error, attempt: number) => void;
}

/**
 * Retry a function with exponential backoff
 *
 * @example
 * const result = await retry(
 *   () => fetchData(),
 *   { maxAttempts: 3, delay: 1000, backoff: 2 }
 * );
 */
export async function retry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  const {
    maxAttempts,
    delay,
    backoff = 1,
    maxDelay = 30000,
    shouldRetry = () => true,
    onRetry,
  } = options;

  let lastError: Error;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry
      if (!shouldRetry(lastError) || attempt === maxAttempts) {
        throw lastError;
      }

      // Calculate delay with backoff
      const currentDelay = Math.min(delay * backoff ** (attempt - 1), maxDelay);

      // Call onRetry callback
      if (onRetry) {
        onRetry(lastError, attempt);
      } else {
        logger.warn(
          {
            error: lastError.message,
            attempt,
            maxAttempts,
            nextRetryMs: currentDelay,
          },
          `Retry attempt ${attempt}/${maxAttempts}`
        );
      }

      // Wait before retrying
      await sleep(currentDelay);
    }
  }

  throw lastError!;
}

/**
 * Common retry configurations
 */
export const retryConfig = {
  /**
   * Fast retry with linear backoff
   * Good for quick operations that might fail transiently
   */
  fast: {
    maxAttempts: 3,
    delay: 1000,
    backoff: 1,
  },

  /**
   * Standard retry with exponential backoff
   * Good for most operations
   */
  standard: {
    maxAttempts: 3,
    delay: 2000,
    backoff: 2,
    maxDelay: 10000,
  },

  /**
   * Slow retry with exponential backoff
   * Good for operations that are expensive or rate-limited
   */
  slow: {
    maxAttempts: 5,
    delay: 5000,
    backoff: 2,
    maxDelay: 30000,
  },

  /**
   * Patient retry for very unreliable operations
   */
  patient: {
    maxAttempts: 10,
    delay: 10000,
    backoff: 1.5,
    maxDelay: 60000,
  },
} satisfies Record<string, RetryOptions>;

/**
 * Check if an error is retryable (network errors, timeouts, etc.)
 */
export function isRetryableError(error: Error): boolean {
  const retryableMessages = [
    'timeout',
    'ETIMEDOUT',
    'ECONNRESET',
    'ECONNREFUSED',
    'ENOTFOUND',
    'network',
    'socket hang up',
    'Navigation timeout',
  ];

  const message = error.message.toLowerCase();
  return retryableMessages.some((msg) => message.includes(msg.toLowerCase()));
}

/**
 * Retry with standard configuration for network errors
 */
export function retryOnNetworkError<T>(fn: () => Promise<T>): Promise<T> {
  return retry(fn, {
    ...retryConfig.standard,
    shouldRetry: isRetryableError,
  });
}
