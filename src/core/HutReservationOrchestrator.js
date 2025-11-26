const HutReservationScraper = require('../providers/HutReservationScraper');
const logger = require('../services/logger');
const database = require('../services/database');

/**
 * HutReservationOrchestrator
 *
 * Manages batch scraping of multiple huts from hut-reservation.org
 * Handles concurrency, retries, and progress tracking
 */
class HutReservationOrchestrator {
  constructor(options = {}) {
    this.options = {
      headless: true,
      concurrentBrowsers: 3,      // Run 3 browsers in parallel
      delayBetweenHuts: 10000,    // 10 seconds between batches
      retryAttempts: 3,
      saveToDatabase: true,
      saveToFile: false,          // Don't clutter disk with individual files
      ...options
    };

    this.results = {
      successful: [],
      failed: [],
      skipped: []
    };
  }

  /**
   * Scrape multiple huts in batches
   * @param {Array<number>} hutIds - Array of hut IDs to scrape
   * @returns {Object} Report with results
   */
  async scrapeAllHuts(hutIds) {
    logger.info(`Starting batch scraping for ${hutIds.length} huts...`);

    const startTime = Date.now();

    // Initialize database if needed
    if (this.options.saveToDatabase) {
      await database.initialize();
    }

    // Process huts in batches
    const batchSize = this.options.concurrentBrowsers;
    const totalBatches = Math.ceil(hutIds.length / batchSize);

    for (let i = 0; i < hutIds.length; i += batchSize) {
      const batch = hutIds.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;

      logger.info(`Processing batch ${batchNum}/${totalBatches} (${batch.length} huts)`);

      // Run batch in parallel
      await Promise.all(
        batch.map(hutId => this.scrapeWithRetry(hutId))
      );

      // Delay between batches (but not after the last one)
      if (i + batchSize < hutIds.length) {
        logger.info(`Waiting ${this.options.delayBetweenHuts / 1000}s before next batch...`);
        await this.delay(this.options.delayBetweenHuts);
      }

      // Log progress
      this.logProgress(batchNum, totalBatches);
    }

    const duration = Date.now() - startTime;
    return this.generateReport(duration);
  }

  /**
   * Scrape a single hut with retry logic
   * @param {number} hutId - Hut ID to scrape
   * @param {number} attempt - Current attempt number
   */
  async scrapeWithRetry(hutId, attempt = 1) {
    try {
      logger.info(`[Hut ${hutId}] Starting scrape (attempt ${attempt}/${this.options.retryAttempts})`);

      const scraper = new HutReservationScraper({
        headless: this.options.headless,
        slowMo: 300,
        saveToDatabase: this.options.saveToDatabase,
        saveToFile: this.options.saveToFile
      });

      const result = await scraper.scrape(hutId);

      this.results.successful.push({
        hutId,
        hutName: result.results.hutName,
        country: result.results.country,
        categories: result.results.summary.totalCategories || 0,
        totalDays: result.results.summary.totalDays,
        totalAvailabilitySlots: result.results.summary.totalAvailabilitySlots
      });

      logger.info(`[Hut ${hutId}] ✅ Success: ${result.results.hutName} - ${result.results.summary.totalCategories} categories, ${result.results.summary.totalAvailabilitySlots} availability slots`);

    } catch (error) {
      logger.error(`[Hut ${hutId}] ❌ Error: ${error.message}`);

      // Retry logic
      if (attempt < this.options.retryAttempts) {
        const retryDelay = 30000 * attempt; // Exponential backoff: 30s, 60s, 90s
        logger.info(`[Hut ${hutId}] Retrying in ${retryDelay / 1000}s...`);
        await this.delay(retryDelay);
        return this.scrapeWithRetry(hutId, attempt + 1);
      }

      this.results.failed.push({
        hutId,
        error: error.message,
        attempts: attempt
      });
    }
  }

  /**
   * Log current progress
   */
  logProgress(currentBatch, totalBatches) {
    const total = this.results.successful.length + this.results.failed.length;
    const successRate = total > 0
      ? ((this.results.successful.length / total) * 100).toFixed(1)
      : 0;

    logger.info(`Progress: Batch ${currentBatch}/${totalBatches} | Success: ${this.results.successful.length} | Failed: ${this.results.failed.length} | Rate: ${successRate}%`);
  }

  /**
   * Generate final report
   * @param {number} duration - Total duration in milliseconds
   */
  generateReport(duration) {
    const total = this.results.successful.length + this.results.failed.length;
    const durationMin = (duration / 1000 / 60).toFixed(1);
    const avgTimePerHut = total > 0 ? (duration / total / 1000).toFixed(1) : 0;

    const report = {
      summary: {
        total,
        successful: this.results.successful.length,
        failed: this.results.failed.length,
        skipped: this.results.skipped.length,
        successRate: total > 0 ? ((this.results.successful.length / total) * 100).toFixed(1) + '%' : '0%',
        duration: `${durationMin} minutes`,
        avgTimePerHut: `${avgTimePerHut} seconds`
      },
      successful: this.results.successful,
      failed: this.results.failed,
      skipped: this.results.skipped
    };

    return report;
  }

  /**
   * Delay helper
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = HutReservationOrchestrator;
