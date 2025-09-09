/**
 * Service Configuration
 * Main configuration for the mountain hut scraping service
 */

require('dotenv').config();

module.exports = {
  // Service settings
  service: {
    name: 'mountain-hut-scraper-service',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  },

  // Scraping configuration
  scraper: {
    // Default browser settings (can be overridden in .env)
    browser: {
      headless: process.env.HEADLESS_MODE === 'true',
      slowMo: parseInt(process.env.SLOW_MO) || 0,
      timeout: 60000
    },

    // Scraping behavior
    behavior: {
      parallel: process.env.PARALLEL_SCRAPING === 'true',
      maxConcurrency: 3,
      retryAttempts: 3,
      retryDelay: 5000,
      screenshotOnError: process.env.SCREENSHOT_ON_ERROR === 'true'
    },

    // Target months to scrape
    targetMonths: [
      'september 2025', 'oktober 2025', 'november 2025', 'december 2025',
      'januar 2026', 'februar 2026', 'marec 2026', 'april 2026',
      'maj 2026', 'junij 2026', 'julij 2026', 'avgust 2026'
    ],

    // Output settings
    output: {
      saveResults: true,
      saveToDatabase: true,
      saveToFile: true,
      saveScreenshots: true,
      resultsDir: 'results',
      screenshotsDir: 'screenshots'
    }
  },

  // Scheduling configuration
  scheduler: {
    morning: process.env.SCRAPE_SCHEDULE_MORNING || '0 6 * * *',
    evening: process.env.SCRAPE_SCHEDULE_EVENING || '0 18 * * *',
    timezone: 'Europe/Ljubljana'
  },

  // Database configuration
  database: {
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT) || 5432,
    database: process.env.DATABASE_NAME || 'mountain_huts',
    user: process.env.DATABASE_USER || 'postgres',
    password: process.env.DATABASE_PASSWORD,
    maxConnections: parseInt(process.env.DATABASE_MAX_CONNECTIONS) || 10
  },

  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    maxSize: '20m',
    maxFiles: '14d',
    errorMaxFiles: '30d'
  },

  // Health check configuration
  healthCheck: {
    port: parseInt(process.env.HEALTH_CHECK_PORT) || 3000,
    enabled: process.env.ENABLE_HEALTH_CHECK !== 'false'
  },

  // Notification configuration (optional)
  notifications: {
    email: process.env.ALERT_EMAIL,
    slack: process.env.SLACK_WEBHOOK_URL,
    enableOnFailure: true,
    enableOnSuccess: false
  }
};