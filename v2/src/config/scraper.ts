import type { LaunchOptions } from 'playwright';
import { env } from './env.ts';

/**
 * Scraper configuration
 */
export const scraperConfig = {
  /**
   * Browser launch options
   */
  browser: {
    headless: env.SCRAPER_HEADLESS,
    slowMo: env.SCRAPER_SLOW_MO,
    timeout: env.SCRAPER_TIMEOUT,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
    ],
  } satisfies LaunchOptions,

  /**
   * Concurrency and rate limiting
   */
  concurrency: {
    maxParallel: env.SCRAPER_MAX_CONCURRENCY,
    delayBetweenHuts: env.SCRAPER_DELAY_BETWEEN_HUTS,
    delayBetweenRooms: env.SCRAPER_DELAY_BETWEEN_ROOMS,
  },

  /**
   * Screenshot configuration
   */
  screenshots: {
    enabled: env.SCRAPER_SCREENSHOTS_ENABLED,
    onError: true,
    path: './screenshots',
  },

  /**
   * Results output
   */
  output: {
    path: './results',
    format: 'json' as const,
  },

  /**
   * Retry configuration
   */
  retry: {
    maxAttempts: 3,
    delay: 5000,
    backoff: 2, // Exponential backoff multiplier
  },

  /**
   * Navigation timeout (ms)
   */
  navigationTimeout: env.SCRAPER_TIMEOUT,

  /**
   * Wait for selectors timeout (ms)
   */
  selectorTimeout: 10000,
} as const;
