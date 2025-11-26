import type { LaunchOptions } from 'playwright';
import { env } from './env.ts';

/**
 * Booking configuration
 */
export const bookingConfig = {
  /**
   * Browser launch options
   */
  browser: {
    headless: env.BOOKING_HEADLESS,
    slowMo: env.BOOKING_SLOW_MO,
    timeout: 60000,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  } satisfies LaunchOptions,

  /**
   * Captcha solving configuration
   */
  captcha: {
    maxAttempts: env.BOOKING_MAX_CAPTCHA_ATTEMPTS,
    delayBetweenAttempts: 50, // Fast brute force
    numberRange: {
      min: 0,
      max: 20,
    },
  },

  /**
   * Form submission configuration
   */
  form: {
    timeout: 30000,
    retryDelay: 2000,
  },

  /**
   * Dry run mode (don't actually submit)
   */
  dryRun: env.BOOKING_DRY_RUN,

  /**
   * Screenshots for debugging
   */
  screenshots: {
    enabled: true,
    path: './screenshots/booking',
    onEveryStep: true,
    onError: true,
  },

  /**
   * Country code mapping
   */
  countries: {
    SI: 'Slovenia',
    AT: 'Austria',
    DE: 'Germany',
    IT: 'Italy',
    CH: 'Switzerland',
    FR: 'France',
    GB: 'United Kingdom',
    US: 'United States',
    HR: 'Croatia',
    HU: 'Hungary',
    CZ: 'Czech Republic',
    PL: 'Poland',
  } as const,

  /**
   * Session management
   */
  session: {
    timeoutMs: 600000, // 10 minutes
    maxActiveSessions: 5,
  },
} as const;

export type BookingCountryCode = keyof typeof bookingConfig.countries;
