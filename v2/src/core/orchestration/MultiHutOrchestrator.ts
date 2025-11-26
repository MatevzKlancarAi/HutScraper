/**
 * Multi-Hut Orchestrator
 * Manages batch scraping of multiple huts with concurrency, retry logic, and progress tracking
 */

import type { ScrapePersistence } from '@services/database/index.ts';
import type { Logger } from '@services/logger/index.ts';
import { sleep } from '@utils/sleep.ts';
import type { ScrapeRequest } from '../../types/index.ts';
import type { BaseScraper } from '../scraper/BaseScraper.ts';
import type {
  HutScrapeResult,
  HutTarget,
  OrchestrationOptions,
  OrchestrationProgress,
  OrchestrationReport,
  ProgressCallback,
} from './types.ts';

/**
 * Default orchestration options
 */
const DEFAULT_OPTIONS: Required<OrchestrationOptions> = {
  concurrency: 3,
  retries: 3,
  delayBetweenBatches: 10000, // 10 seconds
  delayBetweenHuts: 0,
  saveToDatabase: true,
  saveToFile: false,
  dateRange: {
    start: new Date(),
    end: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
  },
};

/**
 * MultiHutOrchestrator
 * Orchestrates scraping of multiple huts with batching, concurrency, and retry logic
 */
export class MultiHutOrchestrator {
  private options: Required<OrchestrationOptions>;
  private results: {
    successful: HutScrapeResult[];
    failed: HutScrapeResult[];
    skipped: HutTarget[];
  };
  private startTime = 0;

  constructor(
    private readonly providerFactory: (providerType: string) => BaseScraper | null,
    private readonly logger: Logger,
    private readonly persistence: ScrapePersistence | null = null,
    options: OrchestrationOptions = {}
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.results = {
      successful: [],
      failed: [],
      skipped: [],
    };
  }

  /**
   * Scrape multiple huts
   */
  async scrapeAll(
    targets: HutTarget[],
    onProgress?: ProgressCallback
  ): Promise<OrchestrationReport> {
    this.startTime = Date.now();
    this.results = {
      successful: [],
      failed: [],
      skipped: [],
    };

    this.logger.info(
      { totalHuts: targets.length, options: this.options },
      `Starting batch scraping for ${targets.length} huts`
    );

    // Split into batches based on concurrency
    const batchSize = this.options.concurrency;
    const totalBatches = Math.ceil(targets.length / batchSize);

    for (let i = 0; i < targets.length; i += batchSize) {
      const batch = targets.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;

      this.logger.info(
        { batch: batchNum, totalBatches, hutCount: batch.length },
        `Processing batch ${batchNum}/${totalBatches}`
      );

      // Run batch in parallel
      await Promise.all(batch.map((target) => this.scrapeWithRetry(target, batchNum)));

      // Report progress
      if (onProgress) {
        const progress = this.getProgress(batchNum, totalBatches, targets.length);
        onProgress(progress);
      }

      // Delay between batches (but not after the last one)
      if (i + batchSize < targets.length) {
        this.logger.info(
          { delayMs: this.options.delayBetweenBatches },
          `Waiting ${this.options.delayBetweenBatches / 1000}s before next batch`
        );
        await sleep(this.options.delayBetweenBatches);
      }
    }

    const duration = Date.now() - this.startTime;
    return this.generateReport(duration);
  }

  /**
   * Scrape a single hut with retry logic
   */
  private async scrapeWithRetry(target: HutTarget, batchNum: number, attempt = 1): Promise<void> {
    const startTime = Date.now();

    try {
      this.logger.info(
        {
          hutId: target.hutId,
          hutName: target.hutName,
          attempt,
          maxAttempts: this.options.retries,
        },
        `[Hut ${target.hutId}] Starting scrape (attempt ${attempt}/${this.options.retries})`
      );

      // Get provider
      const provider = this.providerFactory(target.provider);
      if (!provider) {
        throw new Error(`Provider '${target.provider}' not found`);
      }

      // Initialize provider
      await provider.initialize();

      try {
        // Create scrape request
        const request: ScrapeRequest = {
          propertyId: target.hutId,
          propertyName: target.hutName,
          url: target.url,
          dateRange: this.options.dateRange,
          ...(target.roomTypes && { roomTypes: target.roomTypes }),
          options: {
            screenshots: false,
            retries: 0, // Provider handles its own retries
          },
        };

        // Scrape
        const result = await provider.scrape(request);

        // Check if successful
        if (!result.metadata.success) {
          throw new Error(result.metadata.error || 'Scraping failed');
        }

        // Save to database if persistence is enabled
        if (this.persistence && this.options.saveToDatabase) {
          try {
            await this.persistence.saveScrapeResult(
              result,
              target.hutName,
              target.url,
              target.provider
            );
            this.logger.info({ hutId: target.hutId }, `[Hut ${target.hutId}] 💾 Saved to database`);
          } catch (error) {
            this.logger.error(
              { hutId: target.hutId, error },
              `[Hut ${target.hutId}] ❌ Failed to save to database`
            );
            // Don't throw - scraping was successful even if DB save failed
          }
        }

        // Calculate stats
        const duration = Date.now() - startTime;
        const totalDates = result.roomTypes.reduce((sum, rt) => sum + rt.dates.length, 0);

        // Record success
        const hutResult: HutScrapeResult = {
          hutId: target.hutId,
          hutName: target.hutName,
          provider: target.provider,
          success: true,
          attempts: attempt,
          duration,
          roomTypes: result.roomTypes.length,
          totalDates,
          result,
        };

        this.results.successful.push(hutResult);

        this.logger.info(
          {
            hutId: target.hutId,
            duration,
            roomTypes: result.roomTypes.length,
            totalDates,
          },
          `[Hut ${target.hutId}] ✅ Success: ${target.hutName} - ${result.roomTypes.length} room types, ${totalDates} available dates`
        );
      } finally {
        // Always cleanup provider
        await provider.cleanup();
      }

      // Delay between huts in same batch (if configured)
      if (this.options.delayBetweenHuts > 0) {
        await sleep(this.options.delayBetweenHuts);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error(
        { hutId: target.hutId, attempt, error: errorMessage },
        `[Hut ${target.hutId}] ❌ Error: ${errorMessage}`
      );

      // Retry logic
      if (attempt < this.options.retries) {
        const retryDelay = 30000 * attempt; // Exponential backoff: 30s, 60s, 90s
        this.logger.info(
          { hutId: target.hutId, retryDelay, nextAttempt: attempt + 1 },
          `[Hut ${target.hutId}] Retrying in ${retryDelay / 1000}s...`
        );
        await sleep(retryDelay);
        return this.scrapeWithRetry(target, batchNum, attempt + 1);
      }

      // Max retries reached - record failure
      const duration = Date.now() - startTime;
      const hutResult: HutScrapeResult = {
        hutId: target.hutId,
        hutName: target.hutName,
        provider: target.provider,
        success: false,
        attempts: attempt,
        duration,
        roomTypes: 0,
        totalDates: 0,
        error: errorMessage,
      };

      this.results.failed.push(hutResult);
    }
  }

  /**
   * Get current progress
   */
  private getProgress(
    currentBatch: number,
    totalBatches: number,
    totalHuts: number
  ): OrchestrationProgress {
    const completed = this.results.successful.length + this.results.failed.length;
    const successful = this.results.successful.length;
    const failed = this.results.failed.length;
    const successRate = completed > 0 ? (successful / completed) * 100 : 0;

    return {
      currentBatch,
      totalBatches,
      completed,
      total: totalHuts,
      successful,
      failed,
      successRate,
    };
  }

  /**
   * Generate final report
   */
  private generateReport(duration: number): OrchestrationReport {
    const total =
      this.results.successful.length + this.results.failed.length + this.results.skipped.length;
    const durationMin = (duration / 1000 / 60).toFixed(1);
    const avgTimePerHut = total > 0 ? (duration / total / 1000).toFixed(1) : '0';
    const successRate =
      total > 0 ? ((this.results.successful.length / total) * 100).toFixed(1) + '%' : '0%';

    const report: OrchestrationReport = {
      summary: {
        total,
        successful: this.results.successful.length,
        failed: this.results.failed.length,
        skipped: this.results.skipped.length,
        successRate,
        duration: `${durationMin} minutes`,
        avgTimePerHut: `${avgTimePerHut} seconds`,
        startTime: new Date(this.startTime),
        endTime: new Date(),
      },
      successful: this.results.successful,
      failed: this.results.failed,
      skipped: this.results.skipped,
    };

    this.logger.info(
      { summary: report.summary },
      `Batch scraping completed: ${report.summary.successful}/${report.summary.total} successful (${report.summary.successRate})`
    );

    return report;
  }

  /**
   * Get current results
   */
  getResults(): OrchestrationReport {
    return this.generateReport(Date.now() - this.startTime);
  }
}
