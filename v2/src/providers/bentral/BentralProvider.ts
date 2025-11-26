import { bentralConfig } from '@config/providers/bentral.ts';
import { scraperConfig } from '@config/scraper.ts';
import { BrowserManager } from '@core/browser/BrowserManager.ts';
import { BaseScraper } from '@core/scraper/BaseScraper.ts';
import type { Logger } from '@services/logger/index.ts';
import { getMonthName } from '@utils/date.ts';
import { sleep } from '@utils/sleep.ts';
import type { Page } from 'playwright';
import type {
  AvailabilityStatus,
  DateAvailability,
  ProviderConfig,
  ProviderMetadata,
  RoomTypeAvailability,
  ScrapeRequest,
  ScrapeResult,
} from '../../types/index.ts';

/**
 * Bentral Provider
 * Scrapes availability data from Bentral booking system
 */
export class BentralProvider extends BaseScraper {
  metadata: ProviderMetadata = {
    id: 'bentral',
    name: 'Bentral Booking System',
    version: '2.0.0',
    type: 'scraper',
    capabilities: {
      scraping: {
        supportsDateRange: true,
        supportsRoomTypes: true,
        maxConcurrency: 1,
        rateLimit: {
          requests: 1,
          perSeconds: 5,
        },
      },
    },
  };

  private browserManager: BrowserManager;
  private sessionId: string;

  constructor(config: ProviderConfig, logger: Logger) {
    super(config, logger);

    this.sessionId = `bentral-${Date.now()}`;
    this.browserManager = new BrowserManager(scraperConfig.browser, logger);
  }

  async initialize(): Promise<void> {
    this.log.info('Initializing Bentral provider');
    await this.browserManager.createSession(this.sessionId);
    this.log.info('Bentral provider initialized');
  }

  async cleanup(): Promise<void> {
    this.log.info('Cleaning up Bentral provider');
    await this.browserManager.closeSession(this.sessionId);
    this.log.info('Bentral provider cleaned up');
  }

  async healthCheck(): Promise<boolean> {
    try {
      const session = this.browserManager.getSession(this.sessionId);
      return session !== undefined && session.page !== null;
    } catch {
      return false;
    }
  }

  async scrape(request: ScrapeRequest): Promise<ScrapeResult> {
    const startTime = Date.now();

    this.logScrape(request.propertyName, 'Starting Bentral scrape', {
      dateRange: {
        start: request.dateRange.start.toISOString(),
        end: request.dateRange.end.toISOString(),
      },
    });

    try {
      const session = this.browserManager.getSession(this.sessionId);
      if (!session) {
        throw new Error('Browser session not found. Call initialize() first.');
      }

      // Navigate to Bentral iframe
      await this.browserManager.goto(session.page, bentralConfig.iframeUrl, {
        waitUntil: 'networkidle',
      });

      this.logScrape(request.propertyName, 'Loaded Bentral booking system');

      // Scrape all room types or specific ones
      const roomTypes: RoomTypeAvailability[] = [];

      if (request.roomTypes && request.roomTypes.length > 0) {
        // Scrape specific room types
        for (const roomTypeName of request.roomTypes) {
          const availability = await this.scrapeRoomType(session.page, roomTypeName, request);
          if (availability) {
            roomTypes.push(availability);
          }
        }
      } else {
        // Scrape first room type as default
        const availability = await this.scrapeRoomType(
          session.page,
          'Dvoposteljna soba - zakonska postelja',
          request
        );
        if (availability) {
          roomTypes.push(availability);
        }
      }

      this.logScrape(request.propertyName, 'Scraping complete', {
        roomTypesScraped: roomTypes.length,
        totalDates: roomTypes.reduce((sum, rt) => sum + rt.dates.length, 0),
      });

      return {
        propertyId: request.propertyId,
        propertyName: request.propertyName,
        roomTypes,
        metadata: this.createMetadata(startTime, true),
      };
    } catch (error) {
      this.logScrapeError(
        request.propertyName,
        'Scraping failed',
        error instanceof Error ? error : new Error(String(error))
      );

      return {
        propertyId: request.propertyId,
        propertyName: request.propertyName,
        roomTypes: [],
        metadata: this.createMetadata(
          startTime,
          false,
          error instanceof Error ? error : new Error(String(error))
        ),
      };
    }
  }

  /**
   * Scrape availability for a specific room type
   */
  private async scrapeRoomType(
    page: Page,
    roomTypeName: string,
    request: ScrapeRequest
  ): Promise<RoomTypeAvailability | null> {
    this.log.info(`Scraping room type: ${roomTypeName}`);

    try {
      // Calculate months to scrape
      const months = this.getMonthsToScrape(request.dateRange.start, request.dateRange.end);

      const allDates: DateAvailability[] = [];

      // Scrape each month
      for (const month of months) {
        const monthName = getMonthName(month);
        this.log.debug(`Scraping month: ${monthName}`);

        const dates = await this.scrapeMonth(page, month);
        allDates.push(...dates);

        // Delay between months
        await sleep(bentralConfig.navigationDelay);
      }

      return {
        roomTypeName,
        dates: allDates,
      };
    } catch (error) {
      this.log.error(
        `Failed to scrape room type: ${roomTypeName}`,
        error instanceof Error ? error : new Error(String(error))
      );
      return null;
    }
  }

  /**
   * Scrape availability for a specific month
   */
  private async scrapeMonth(page: Page, targetMonth: Date): Promise<DateAvailability[]> {
    // Navigate to target month
    await this.navigateToMonth(page, targetMonth);

    // Extract availability from calendar
    return await this.extractMonthAvailability(page, targetMonth);
  }

  /**
   * Navigate calendar to target month
   */
  private async navigateToMonth(page: Page, targetMonth: Date): Promise<void> {
    const targetMonthName = getMonthName(targetMonth);

    for (let attempt = 0; attempt < bentralConfig.maxMonthNavigations; attempt++) {
      // Get current month from calendar
      const currentMonthText = await this.browserManager.getText(
        page,
        bentralConfig.selectors.calendarSwitch
      );

      if (currentMonthText === targetMonthName) {
        this.log.debug(`Reached target month: ${targetMonthName}`);
        return;
      }

      // Click next button
      await this.browserManager.click(page, bentralConfig.selectors.nextButton);
      await sleep(300);
    }

    throw new Error(`Could not navigate to month: ${targetMonthName}`);
  }

  /**
   * Extract availability from current calendar view
   */
  private async extractMonthAvailability(page: Page, month: Date): Promise<DateAvailability[]> {
    const dates: DateAvailability[] = [];

    // Evaluate in browser context to extract availability
    const availabilityData = await page.evaluate(
      ({ selectors, availability }) => {
        const days = document.querySelectorAll<HTMLElement>(selectors.calendarDays);
        const results: Array<{
          day: number;
          status: string;
          classes: string[];
          title: string;
        }> = [];

        for (const dayElement of Array.from(days)) {
          const classes = Array.from(dayElement.classList) as string[];
          const title = dayElement.getAttribute('title') || '';
          const dayText = dayElement.textContent?.trim();

          // Check if day has required classes
          const hasRequiredClasses = availability.requiredClasses.every((cls) =>
            classes.includes(cls)
          );

          // Check if day has any excluded classes
          const hasExcludedClasses = availability.excludedClasses.some((cls) =>
            classes.includes(cls)
          );

          // Check if title contains excluded text
          const hasExcludedTitle = availability.excludedTitles.some((text) =>
            title.toLowerCase().includes(text.toLowerCase())
          );

          if (dayText && !Number.isNaN(Number.parseInt(dayText))) {
            const day = Number.parseInt(dayText);

            let status: string;
            if (hasRequiredClasses && !hasExcludedClasses && !hasExcludedTitle) {
              status = 'available';
            } else if (classes.includes('partial')) {
              if (classes.includes('partial-no-start')) {
                status = 'partial_no_start';
              } else if (classes.includes('partial-no-end')) {
                status = 'partial_no_end';
              } else {
                status = 'unavailable';
              }
            } else {
              status = 'unavailable';
            }

            results.push({ day, status, classes, title });
          }
        }

        return results;
      },
      {
        selectors: bentralConfig.selectors,
        availability: bentralConfig.availability,
      }
    );

    // Convert to DateAvailability objects
    for (const data of availabilityData) {
      const date = new Date(month.getFullYear(), month.getMonth(), data.day);

      dates.push({
        date,
        status: data.status as AvailabilityStatus,
        canCheckin: data.status === 'available' || data.status === 'partial_no_end',
        canCheckout: data.status === 'available' || data.status === 'partial_no_start',
      });
    }

    return dates;
  }

  /**
   * Calculate which months to scrape based on date range
   */
  private getMonthsToScrape(startDate: Date, endDate: Date): Date[] {
    const months: Date[] = [];
    const current = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const end = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

    while (current <= end) {
      months.push(new Date(current));
      current.setMonth(current.getMonth() + 1);
    }

    return months;
  }
}
