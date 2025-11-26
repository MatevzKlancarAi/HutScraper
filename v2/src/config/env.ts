import { z } from 'zod';

/**
 * Environment variable schema with validation
 */
const envSchema = z.object({
  // Application
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  // Database
  DATABASE_HOST: z.string().min(1),
  DATABASE_PORT: z.coerce.number().int().positive().default(5432),
  DATABASE_NAME: z.string().min(1),
  DATABASE_USER: z.string().min(1),
  DATABASE_PASSWORD: z.string().min(1),
  DATABASE_MAX_CONNECTIONS: z.coerce.number().int().positive().default(10),
  DATABASE_SSL: z.coerce.boolean().default(false),

  // Scraping
  SCRAPER_HEADLESS: z.coerce.boolean().default(true),
  SCRAPER_SLOW_MO: z.coerce.number().int().nonnegative().default(0),
  SCRAPER_TIMEOUT: z.coerce.number().int().positive().default(30000),
  SCRAPER_MAX_CONCURRENCY: z.coerce.number().int().positive().default(3),
  SCRAPER_DELAY_BETWEEN_HUTS: z.coerce.number().int().nonnegative().default(30000),
  SCRAPER_DELAY_BETWEEN_ROOMS: z.coerce.number().int().nonnegative().default(5000),
  SCRAPER_SCREENSHOTS_ENABLED: z.coerce.boolean().default(false),

  // Booking
  BOOKING_HEADLESS: z.coerce.boolean().default(true),
  BOOKING_SLOW_MO: z.coerce.number().int().nonnegative().default(100),
  BOOKING_MAX_CAPTCHA_ATTEMPTS: z.coerce.number().int().positive().default(20),
  BOOKING_DRY_RUN: z.coerce.boolean().default(true),

  // Scheduler
  SCHEDULER_ENABLED: z.coerce.boolean().default(true),
  SCHEDULER_CRON_SCRAPING: z.string().default('0 6,18 * * *'),
  SCHEDULER_TIMEZONE: z.string().default('Europe/Ljubljana'),

  // API
  API_RATE_LIMIT_REQUESTS: z.coerce.number().int().positive().default(100),
  API_RATE_LIMIT_WINDOW: z.coerce.number().int().positive().default(60000),
  CORS_ORIGIN: z.string().default('*'),

  // Optional
  REDIS_HOST: z.string().optional(),
  REDIS_PORT: z.coerce.number().int().positive().optional(),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().int().nonnegative().optional(),
  SENTRY_DSN: z.string().optional(),
  METRICS_ENABLED: z.coerce.boolean().optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parse and validate environment variables
 * Throws detailed error if validation fails
 */
export function parseEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.format();
    console.error('❌ Invalid environment variables:');
    console.error(JSON.stringify(errors, null, 2));
    throw new Error('Environment validation failed');
  }

  return result.data;
}

/**
 * Validated environment variables
 * Use this throughout the application
 */
export const env = parseEnv();
