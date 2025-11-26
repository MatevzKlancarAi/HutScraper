import type { Logger } from '@services/logger/index.ts';
import type {
  ProviderConfig,
  ScrapeMetadata,
  ScrapeRequest,
  ScrapeResult,
} from '../../types/index.ts';
import { BaseProvider } from '../providers/BaseProvider.ts';

/**
 * Abstract base class for all scrapers
 * Extends BaseProvider with scraping-specific functionality
 */
export abstract class BaseScraper extends BaseProvider {
  constructor(config: ProviderConfig, logger: Logger) {
    super(config, logger);

    // Validate that this is a scraper
    if (config.type !== 'scraper' && config.type !== 'both') {
      throw new Error(`Invalid provider type for scraper: ${config.type}`);
    }
  }

  /**
   * Scrape availability data
   * This is the main method that must be implemented by all scrapers
   *
   * @param request Scrape request with property info and date range
   * @returns Scrape result with availability data
   */
  abstract scrape(request: ScrapeRequest): Promise<ScrapeResult>;

  /**
   * Create scrape metadata
   * Helper method for consistent metadata creation
   */
  protected createMetadata(startTime: number, success: boolean, error?: Error): ScrapeMetadata {
    return {
      scrapedAt: new Date(),
      duration: Date.now() - startTime,
      provider: this.metadata.id,
      success,
      ...(error && { error: error.message }),
    };
  }

  /**
   * Log scraping activity
   * Helper method for consistent scraping logs
   */
  protected logScrape(propertyName: string, action: string, data?: Record<string, unknown>): void {
    this.log.info(`[${propertyName}] ${action}`, data);
  }

  /**
   * Log scraping error
   * Helper method for consistent error logs
   */
  protected logScrapeError(
    propertyName: string,
    action: string,
    error: Error,
    data?: Record<string, unknown>
  ): void {
    this.log.error(`[${propertyName}] ${action} failed`, error, data);
  }

  /**
   * Take screenshot helper
   * Saves screenshot with timestamp and property name
   */
  protected async takeScreenshot(
    page: any,
    propertyName: string,
    description: string
  ): Promise<string | undefined> {
    try {
      const timestamp = Date.now();
      const filename = `${propertyName.replace(/\s+/g, '-')}_${description}_${timestamp}.png`;
      const path = `./screenshots/${filename}`;

      await page.screenshot({ path, fullPage: false });
      this.log.debug(`Screenshot saved: ${path}`);

      return path;
    } catch (error) {
      this.log.warn('Failed to take screenshot', {
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }

  /**
   * Get rate limit delay
   * Returns delay in ms based on provider's rate limit settings
   */
  protected getRateLimitDelay(): number {
    const rateLimit = this.metadata.capabilities.scraping?.rateLimit;
    if (!rateLimit) return 0;

    return (rateLimit.perSeconds * 1000) / rateLimit.requests;
  }
}
