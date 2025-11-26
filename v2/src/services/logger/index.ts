import { appConfig } from '@config/app.ts';
import pino from 'pino';

/**
 * Create base logger configuration
 */
const createLogger = () => {
  // Production configuration
  if (appConfig.isProduction) {
    return pino({
      level: appConfig.logLevel,
      formatters: {
        level: (label) => {
          return { level: label };
        },
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    });
  }

  // Development configuration with pretty printing
  return pino({
    level: appConfig.logLevel,
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
        singleLine: false,
      },
    },
  });
};

/**
 * Main application logger
 */
export const logger = createLogger();

/**
 * Create a child logger with additional context
 * Use this to add context like provider name, session ID, etc.
 *
 * @example
 * const scraperLogger = createChildLogger({ provider: 'bentral', hutId: 123 });
 * scraperLogger.info('Starting scrape');
 */
export function createChildLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}

/**
 * Logger type for dependency injection
 */
export type Logger = typeof logger;

/**
 * Correlation ID middleware helper
 * Generates a unique ID for request tracking
 */
export function generateCorrelationId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Log levels type
 */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/**
 * Structured logging helpers
 */
export const log = {
  /**
   * Log scraper activity
   */
  scraper: (data: {
    provider: string;
    hutName: string;
    action: string;
    duration?: number;
    error?: Error;
  }) => {
    const logData = {
      type: 'scraper',
      provider: data.provider,
      hutName: data.hutName,
      action: data.action,
      ...(data.duration && { durationMs: data.duration }),
      ...(data.error && { error: data.error.message, stack: data.error.stack }),
    };

    if (data.error) {
      logger.error(logData, `Scraper error: ${data.action}`);
    } else {
      logger.info(logData, `Scraper: ${data.action}`);
    }
  },

  /**
   * Log booking activity
   */
  booking: (data: {
    sessionId: string;
    hutName: string;
    step: string;
    status: 'started' | 'completed' | 'failed';
    error?: Error;
  }) => {
    const logData = {
      type: 'booking',
      sessionId: data.sessionId,
      hutName: data.hutName,
      step: data.step,
      status: data.status,
      ...(data.error && { error: data.error.message }),
    };

    if (data.status === 'failed') {
      logger.error(logData, `Booking ${data.step} failed`);
    } else {
      logger.info(logData, `Booking ${data.step} ${data.status}`);
    }
  },

  /**
   * Log API request
   */
  api: (data: {
    method: string;
    path: string;
    statusCode: number;
    duration: number;
    error?: Error;
  }) => {
    const logData = {
      type: 'api',
      method: data.method,
      path: data.path,
      statusCode: data.statusCode,
      durationMs: data.duration,
      ...(data.error && { error: data.error.message }),
    };

    if (data.statusCode >= 500) {
      logger.error(logData, `API ${data.method} ${data.path} - ${data.statusCode}`);
    } else if (data.statusCode >= 400) {
      logger.warn(logData, `API ${data.method} ${data.path} - ${data.statusCode}`);
    } else {
      logger.info(logData, `API ${data.method} ${data.path} - ${data.statusCode}`);
    }
  },

  /**
   * Log database operation
   */
  database: (data: {
    operation: string;
    table?: string;
    duration: number;
    error?: Error;
  }) => {
    const logData = {
      type: 'database',
      operation: data.operation,
      ...(data.table && { table: data.table }),
      durationMs: data.duration,
      ...(data.error && { error: data.error.message }),
    };

    if (data.error) {
      logger.error(logData, `Database ${data.operation} failed`);
    } else {
      logger.debug(logData, `Database ${data.operation}`);
    }
  },

  /**
   * Log scheduler job
   */
  scheduler: (data: {
    jobName: string;
    action: 'started' | 'completed' | 'failed';
    duration?: number;
    error?: Error;
  }) => {
    const logData = {
      type: 'scheduler',
      jobName: data.jobName,
      action: data.action,
      ...(data.duration && { durationMs: data.duration }),
      ...(data.error && { error: data.error.message }),
    };

    if (data.action === 'failed') {
      logger.error(logData, `Job ${data.jobName} failed`);
    } else {
      logger.info(logData, `Job ${data.jobName} ${data.action}`);
    }
  },
};

export default logger;
