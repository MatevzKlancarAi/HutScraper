import { env } from './env.ts';

/**
 * Application configuration derived from environment variables
 */
export const appConfig = {
  /**
   * Application environment
   */
  env: env.NODE_ENV,

  /**
   * Is production environment
   */
  isProduction: env.NODE_ENV === 'production',

  /**
   * Is development environment
   */
  isDevelopment: env.NODE_ENV === 'development',

  /**
   * Is test environment
   */
  isTest: env.NODE_ENV === 'test',

  /**
   * Server port
   */
  port: env.PORT,

  /**
   * Log level
   */
  logLevel: env.LOG_LEVEL,

  /**
   * API configuration
   */
  api: {
    rateLimit: {
      requests: env.API_RATE_LIMIT_REQUESTS,
      windowMs: env.API_RATE_LIMIT_WINDOW,
    },
    cors: {
      origin: env.CORS_ORIGIN === '*' ? '*' : env.CORS_ORIGIN.split(','),
    },
  },

  /**
   * Scheduler configuration
   */
  scheduler: {
    enabled: env.SCHEDULER_ENABLED,
    timezone: env.SCHEDULER_TIMEZONE,
    jobs: {
      scraping: {
        cron: env.SCHEDULER_CRON_SCRAPING,
      },
    },
  },

  /**
   * Optional features
   */
  features: {
    redis: !!env.REDIS_HOST,
    metrics: env.METRICS_ENABLED ?? false,
    sentry: !!env.SENTRY_DSN,
  },
} as const;
