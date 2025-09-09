const logger = require('./logger');

/**
 * Retry Handler
 * Provides retry logic with exponential backoff and various retry strategies
 */
class RetryHandler {
  constructor(options = {}) {
    this.options = {
      maxAttempts: options.maxAttempts || 3,
      initialDelay: options.initialDelay || 1000,
      maxDelay: options.maxDelay || 30000,
      exponentialBase: options.exponentialBase || 2,
      jitter: options.jitter !== false, // Default to true
      ...options
    };
  }

  /**
   * Execute a function with retry logic
   */
  async execute(fn, context = {}) {
    let lastError;
    let attempt = 0;

    while (attempt < this.options.maxAttempts) {
      attempt++;
      
      try {
        logger.debug(`Executing attempt ${attempt}/${this.options.maxAttempts}`, {
          context,
          attempt,
          maxAttempts: this.options.maxAttempts
        });

        const result = await fn();
        
        if (attempt > 1) {
          logger.info(`Operation succeeded after ${attempt} attempts`, { context, attempt });
        }
        
        return result;
      } catch (error) {
        lastError = error;
        
        logger.warn(`Attempt ${attempt}/${this.options.maxAttempts} failed`, {
          context,
          attempt,
          error: error.message,
          maxAttempts: this.options.maxAttempts
        });

        // Don't wait after the last attempt
        if (attempt < this.options.maxAttempts) {
          const delay = this.calculateDelay(attempt);
          logger.debug(`Waiting ${delay}ms before next attempt`, { context, attempt, delay });
          await this.sleep(delay);
        }
      }
    }

    // All attempts failed
    logger.error(`All ${this.options.maxAttempts} attempts failed`, {
      context,
      finalError: lastError.message,
      totalAttempts: this.options.maxAttempts
    });

    throw new Error(`Operation failed after ${this.options.maxAttempts} attempts. Last error: ${lastError.message}`);
  }

  /**
   * Calculate delay for exponential backoff with optional jitter
   */
  calculateDelay(attempt) {
    // Calculate exponential delay
    let delay = this.options.initialDelay * Math.pow(this.options.exponentialBase, attempt - 1);
    
    // Apply maximum delay cap
    delay = Math.min(delay, this.options.maxDelay);
    
    // Add jitter to prevent thundering herd
    if (this.options.jitter) {
      delay = delay * (0.5 + Math.random() * 0.5);
    }
    
    return Math.round(delay);
  }

  /**
   * Sleep for specified milliseconds
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create a retry handler with custom options
   */
  static create(options) {
    return new RetryHandler(options);
  }

  /**
   * Retry specific to database operations
   */
  static database(options = {}) {
    return new RetryHandler({
      maxAttempts: 5,
      initialDelay: 2000,
      maxDelay: 10000,
      ...options
    });
  }

  /**
   * Retry specific to web scraping operations
   */
  static scraping(options = {}) {
    return new RetryHandler({
      maxAttempts: 3,
      initialDelay: 5000,
      maxDelay: 30000,
      ...options
    });
  }

  /**
   * Retry specific to network operations
   */
  static network(options = {}) {
    return new RetryHandler({
      maxAttempts: 4,
      initialDelay: 1000,
      maxDelay: 15000,
      ...options
    });
  }
}

/**
 * Enhanced scraper with retry capabilities
 */
class RetryableScraperOperation {
  constructor(scraper, options = {}) {
    this.scraper = scraper;
    this.retryHandler = new RetryHandler(options.retry || {});
    this.options = options;
  }

  /**
   * Execute scraping with retry logic
   */
  async scrape(roomType) {
    const context = {
      hutName: this.scraper.config?.target?.name || 'Unknown',
      roomType
    };

    return await this.retryHandler.execute(async () => {
      try {
        // Initialize scraper if needed
        if (!this.scraper.browser) {
          await this.scraper.initialize();
        }

        // Execute the scraping
        return await this.scraper.scrape(roomType);
      } catch (error) {
        // Take screenshot on error if configured
        if (this.options.screenshotOnError && this.scraper.page) {
          try {
            await this.scraper.takeScreenshot(`error-${Date.now()}`);
          } catch (screenshotError) {
            logger.warn('Failed to take error screenshot', { 
              error: screenshotError.message,
              originalError: error.message
            });
          }
        }

        // Clean up browser on certain errors
        if (this.shouldRestartBrowser(error)) {
          logger.info('Restarting browser due to error type', { 
            error: error.message,
            roomType
          });
          
          try {
            await this.scraper.cleanup();
          } catch (cleanupError) {
            logger.warn('Error during browser cleanup', { error: cleanupError.message });
          }
          
          // Reset browser state
          this.scraper.browser = null;
          this.scraper.page = null;
        }

        throw error;
      }
    }, context);
  }

  /**
   * Determine if browser should be restarted based on error type
   */
  shouldRestartBrowser(error) {
    const restartPatterns = [
      /browser has been closed/i,
      /page has been closed/i,
      /protocol error/i,
      /target closed/i,
      /navigation failed/i,
      /timeout/i
    ];

    return restartPatterns.some(pattern => pattern.test(error.message));
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    if (this.scraper) {
      await this.scraper.cleanup();
    }
  }
}

/**
 * Circuit breaker pattern for preventing cascade failures
 */
class CircuitBreaker {
  constructor(options = {}) {
    this.options = {
      threshold: options.threshold || 5,
      timeout: options.timeout || 60000,
      monitoringPeriod: options.monitoringPeriod || 120000,
      ...options
    };

    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failures = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
  }

  /**
   * Execute operation through circuit breaker
   */
  async execute(operation, context = {}) {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttemptTime) {
        throw new Error('Circuit breaker is OPEN - operation not allowed');
      } else {
        this.state = 'HALF_OPEN';
        logger.info('Circuit breaker transitioning to HALF_OPEN', { context });
      }
    }

    try {
      const result = await operation();
      
      if (this.state === 'HALF_OPEN') {
        this.state = 'CLOSED';
        this.failures = 0;
        logger.info('Circuit breaker reset to CLOSED', { context });
      }
      
      return result;
    } catch (error) {
      this.failures++;
      this.lastFailureTime = Date.now();

      logger.warn('Circuit breaker recorded failure', {
        context,
        failures: this.failures,
        threshold: this.options.threshold,
        state: this.state
      });

      if (this.failures >= this.options.threshold) {
        this.state = 'OPEN';
        this.nextAttemptTime = Date.now() + this.options.timeout;
        
        logger.error('Circuit breaker OPENED', {
          context,
          failures: this.failures,
          nextAttemptTime: new Date(this.nextAttemptTime).toISOString()
        });
      }

      throw error;
    }
  }

  /**
   * Get current state
   */
  getState() {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime
    };
  }

  /**
   * Reset circuit breaker
   */
  reset() {
    this.state = 'CLOSED';
    this.failures = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
    logger.info('Circuit breaker manually reset');
  }
}

module.exports = {
  RetryHandler,
  RetryableScraperOperation,
  CircuitBreaker
};