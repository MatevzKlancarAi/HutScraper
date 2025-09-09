const { getAllHuts, getHutById } = require('../../config/huts');
const MountainHutScraper = require('../MountainHutScraper');
const logger = require('./logger');
const database = require('./database');
const { RetryHandler, RetryableScraperOperation, CircuitBreaker } = require('./retryHandler');
const config = require('../../config/service.config');

/**
 * Hut Manager Service
 * Manages scraping operations across multiple mountain huts
 */
class HutManager {
  constructor(options = {}) {
    this.options = {
      parallel: options.parallel !== false, // Default to true
      maxConcurrency: options.maxConcurrency || 3,
      saveToDatabase: options.saveToDatabase !== false,
      saveToFile: options.saveToFile !== false,
      ...options
    };

    // Initialize retry handlers
    this.retryHandler = RetryHandler.scraping({
      maxAttempts: config.scraper.behavior.retryAttempts,
      initialDelay: config.scraper.behavior.retryDelay
    });

    // Initialize circuit breakers for each hut
    this.circuitBreakers = new Map();
  }

  /**
   * Scrape all registered huts
   */
  async scrapeAllHuts() {
    const huts = getAllHuts();
    
    if (huts.length === 0) {
      logger.warn('No huts registered for scraping');
      return { totalHuts: 0, results: [] };
    }

    const sessionId = logger.startScrapingSession('All Huts', []);
    const startTime = Date.now();

    logger.info(`Starting scraping for ${huts.length} huts`, {
      parallel: this.options.parallel,
      maxConcurrency: this.options.maxConcurrency
    });

    let results;
    if (this.options.parallel) {
      results = await this.scrapeHutsInParallel(huts);
    } else {
      results = await this.scrapeHutsSequentially(huts);
    }

    const duration = Date.now() - startTime;
    const summary = this.generateSummary(results, duration);
    
    logger.endScrapingSession(sessionId, summary);
    
    return {
      totalHuts: huts.length,
      results,
      summary,
      duration
    };
  }

  /**
   * Scrape a specific hut by ID
   */
  async scrapeHut(hutId, roomTypes = null) {
    const hutConfig = getHutById(hutId);
    
    if (!hutConfig) {
      throw new Error(`Hut with ID '${hutId}' not found`);
    }

    logger.info(`Starting scraping for hut: ${hutConfig.name}`, { hutId });
    
    const targetRoomTypes = roomTypes || Object.keys(hutConfig.bentral.roomTypes);
    const sessionId = logger.startScrapingSession(hutConfig.name, targetRoomTypes);
    
    const results = await this.scrapeHutRoomTypes(hutConfig, targetRoomTypes);
    const summary = this.generateHutSummary(hutConfig, results);
    
    logger.endScrapingSession(sessionId, summary);
    
    return {
      hutId,
      hutName: hutConfig.name,
      results,
      summary
    };
  }

  /**
   * Scrape huts in parallel
   */
  async scrapeHutsInParallel(huts) {
    const results = [];
    const chunks = this.chunkArray(huts, this.options.maxConcurrency);

    for (const chunk of chunks) {
      const chunkPromises = chunk.map(async (hutConfig) => {
        try {
          const hutResult = await this.scrapeHutRoomTypes(hutConfig);
          return { hutId: hutConfig.id, hutName: hutConfig.name, success: true, ...hutResult };
        } catch (error) {
          logger.error(`Failed to scrape hut: ${hutConfig.name}`, { 
            hutId: hutConfig.id, 
            error: error.message 
          });
          return { 
            hutId: hutConfig.id, 
            hutName: hutConfig.name, 
            success: false, 
            error: error.message 
          };
        }
      });

      const chunkResults = await Promise.all(chunkPromises);
      results.push(...chunkResults);
    }

    return results;
  }

  /**
   * Scrape huts sequentially
   */
  async scrapeHutsSequentially(huts) {
    const results = [];

    for (const hutConfig of huts) {
      try {
        logger.info(`Processing hut: ${hutConfig.name}`);
        const hutResult = await this.scrapeHutRoomTypes(hutConfig);
        results.push({ hutId: hutConfig.id, hutName: hutConfig.name, success: true, ...hutResult });
      } catch (error) {
        logger.error(`Failed to scrape hut: ${hutConfig.name}`, { 
          hutId: hutConfig.id, 
          error: error.message 
        });
        results.push({ 
          hutId: hutConfig.id, 
          hutName: hutConfig.name, 
          success: false, 
          error: error.message 
        });
      }
    }

    return results;
  }

  /**
   * Get or create circuit breaker for a hut
   */
  getCircuitBreaker(hutId) {
    if (!this.circuitBreakers.has(hutId)) {
      this.circuitBreakers.set(hutId, new CircuitBreaker({
        threshold: 3,
        timeout: 300000, // 5 minutes
        monitoringPeriod: 600000 // 10 minutes
      }));
    }
    return this.circuitBreakers.get(hutId);
  }

  /**
   * Scrape all room types for a specific hut with error handling and retry logic
   */
  async scrapeHutRoomTypes(hutConfig, targetRoomTypes = null) {
    const roomTypes = targetRoomTypes || Object.keys(hutConfig.bentral.roomTypes);
    const results = [];
    const circuitBreaker = this.getCircuitBreaker(hutConfig.id);

    for (const roomType of roomTypes) {
      try {
        logger.info(`Scraping room type: ${roomType}`, { hut: hutConfig.name });
        
        const result = await circuitBreaker.execute(async () => {
          // Create scraper with hut-specific configuration
          const scraper = new MountainHutScraper({
            target: {
              name: hutConfig.name,
              baseUrl: hutConfig.baseUrl,
              bookingSystem: hutConfig.bookingSystem
            },
            bentral: hutConfig.bentral,
            scraper: {
              ...config.scraper,
              browser: {
                ...config.scraper.browser,
                headless: config.scraper.browser.headless,
                slowMo: config.scraper.browser.slowMo
              }
            },
            saveToDatabase: this.options.saveToDatabase,
            saveToFile: this.options.saveToFile
          });

          // Use retryable scraper operation
          const retryableScraper = new RetryableScraperOperation(scraper, {
            retry: {
              maxAttempts: config.scraper.behavior.retryAttempts,
              initialDelay: config.scraper.behavior.retryDelay
            },
            screenshotOnError: config.scraper.behavior.screenshotOnError
          });

          try {
            return await retryableScraper.scrape(roomType);
          } finally {
            await retryableScraper.cleanup();
          }
        }, { hutId: hutConfig.id, roomType });
        
        results.push({
          roomType,
          success: true,
          availableDates: result.summary.totalAvailable,
          totalDays: result.summary.totalDays,
          availabilityRate: result.summary.overallAvailabilityRate,
          scrapedAt: result.scrapingDate
        });

        logger.logRoomScraping(roomType, 'success', {
          availableDates: result.summary.totalAvailable,
          totalDays: result.summary.totalDays,
          availabilityRate: result.summary.overallAvailabilityRate
        });

      } catch (error) {
        logger.logRoomScraping(roomType, 'failed', { 
          error: error.message,
          hutId: hutConfig.id,
          circuitBreakerState: circuitBreaker.getState()
        });
        
        results.push({
          roomType,
          success: false,
          error: error.message,
          scrapedAt: new Date().toISOString()
        });
      }
    }

    return results;
  }

  /**
   * Generate summary for all huts scraping
   */
  generateSummary(results, duration) {
    const totalHuts = results.length;
    const successfulHuts = results.filter(r => r.success).length;
    const failedHuts = totalHuts - successfulHuts;
    
    let totalRooms = 0;
    let successfulRooms = 0;
    let totalDatesScraped = 0;

    results.forEach(hutResult => {
      if (hutResult.success && hutResult.results) {
        totalRooms += hutResult.results.length;
        successfulRooms += hutResult.results.filter(r => r.success).length;
        totalDatesScraped += hutResult.results
          .filter(r => r.success)
          .reduce((sum, r) => sum + (r.availableDates || 0), 0);
      }
    });

    return {
      totalHuts,
      successfulHuts,
      failedHuts,
      totalRooms,
      successfulRooms,
      failedRooms: totalRooms - successfulRooms,
      totalDatesScraped,
      duration: Math.round(duration / 1000) // seconds
    };
  }

  /**
   * Generate summary for single hut scraping
   */
  generateHutSummary(hutConfig, results) {
    const totalRooms = results.length;
    const successfulRooms = results.filter(r => r.success).length;
    const totalDatesScraped = results
      .filter(r => r.success)
      .reduce((sum, r) => sum + (r.availableDates || 0), 0);

    return {
      hutName: hutConfig.name,
      totalRooms,
      successfulRooms,
      failedRooms: totalRooms - successfulRooms,
      totalDatesScraped
    };
  }

  /**
   * Get scraping statistics from database
   */
  async getScrapingStats(hutId = null) {
    try {
      await database.initialize();
      
      if (hutId) {
        const hutConfig = getHutById(hutId);
        if (!hutConfig) {
          throw new Error(`Hut with ID '${hutId}' not found`);
        }
        
        // Get property ID for the hut
        const propertyId = await database.query(
          'SELECT id FROM properties WHERE name = $1',
          [hutConfig.name]
        );
        
        if (propertyId.rows.length === 0) {
          return { error: 'No data found for this hut' };
        }
        
        return await database.getScrapingStats(propertyId.rows[0].id);
      } else {
        return await database.getScrapingStats();
      }
    } catch (error) {
      logger.error('Failed to get scraping stats', { error: error.message, hutId });
      throw error;
    }
  }

  /**
   * Utility function to chunk array
   */
  chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Get health status for all huts
   */
  async getHealthStatus() {
    const huts = getAllHuts();
    const dbHealth = database.getHealthStatus();
    
    return {
      totalHutsRegistered: huts.length,
      database: dbHealth,
      huts: huts.map(hut => ({
        id: hut.id,
        name: hut.name,
        roomTypesCount: Object.keys(hut.bentral?.roomTypes || {}).length
      }))
    };
  }
}

module.exports = HutManager;