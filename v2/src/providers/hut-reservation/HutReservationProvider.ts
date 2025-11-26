import { hutReservationConfig } from '@config/providers/hut-reservation.ts';
import { scraperConfig } from '@config/scraper.ts';
import { BrowserManager } from '@core/browser/BrowserManager.ts';
import { BaseScraper } from '@core/scraper/BaseScraper.ts';
import type { Logger } from '@services/logger/index.ts';
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
 * Hut-Reservation.org API response types
 */
interface HutInfo {
  hutID: number;
  hutName: string;
  tenantCountry: string;
  altitude?: string;
  totalBedsInfo?: number;
  hutBedCategories?: BedCategory[];
}

interface BedCategory {
  categoryID: number;
  totalSleepingPlaces: number;
  hutBedCategoryLanguageData?: Array<{
    language: string;
    label: string;
  }>;
}

interface AvailabilityEntry {
  date: string; // ISO 8601 format
  dateFormatted: string;
  hutStatus: string; // 'OPEN' | 'CLOSED'
  freeBedsPerCategory?: Record<string, number>; // categoryID -> available beds
}

interface AuthTokens {
  xsrfToken: string;
  cookieString: string;
}

/**
 * HutReservation Provider
 * Scrapes availability data from hut-reservation.org platform
 * Supports 666+ mountain huts across AT, CH, DE, IT
 */
export class HutReservationProvider extends BaseScraper {
  metadata: ProviderMetadata = {
    id: 'hut-reservation',
    name: 'Hut-Reservation.org',
    version: '2.0.0',
    type: 'scraper',
    capabilities: {
      scraping: {
        supportsDateRange: true,
        supportsRoomTypes: true,
        maxConcurrency: 3,
        rateLimit: {
          requests: 1,
          perSeconds: 10,
        },
      },
    },
  };

  private browserManager: BrowserManager;
  private sessionId: string;
  private hutData: HutInfo | null = null;
  private categoryToRoomTypeMap: Map<
    number,
    { roomTypeId?: number; name: string; capacity: number }
  > = new Map();

  constructor(config: ProviderConfig, logger: Logger) {
    super(config, logger);

    this.sessionId = `hut-reservation-${Date.now()}`;
    this.browserManager = new BrowserManager(scraperConfig.browser, logger);
  }

  async initialize(): Promise<void> {
    this.log.info('Initializing Hut-Reservation.org provider');
    await this.browserManager.createSession(this.sessionId);
    this.log.info('Hut-Reservation.org provider initialized');
  }

  async cleanup(): Promise<void> {
    this.log.info('Cleaning up Hut-Reservation.org provider');
    await this.browserManager.closeSession(this.sessionId);
    this.hutData = null;
    this.categoryToRoomTypeMap.clear();
    this.log.info('Hut-Reservation.org provider cleaned up');
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

    this.logScrape(request.propertyName, 'Starting Hut-Reservation.org scrape', {
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

      // Extract hut ID from URL or propertyId
      const hutId = this.extractHutId(request);

      // Fetch hut information from API
      await this.fetchHutInfo(hutId);

      if (!this.hutData) {
        throw new Error('Failed to fetch hut information');
      }

      // Navigate to booking wizard to get session cookies
      const wizardUrl = `${hutReservationConfig.platform.baseUrl}/reservation/book-hut/${hutId}/wizard`;
      await this.browserManager.goto(session.page, wizardUrl, {
        waitUntil: 'domcontentloaded',
      });

      this.logScrape(request.propertyName, 'Loaded booking wizard');

      // Wait for cookies to be set
      await session.page.waitForTimeout(2000);

      // Extract authentication tokens
      const authTokens = await this.extractAuthTokens(session.page);

      // Fetch availability data from API
      const availabilityData = await this.fetchAvailability(hutId, authTokens);

      // Parse availability data by category
      const roomTypes = this.parseAvailabilityData(availabilityData);

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
   * Extract hut ID from URL or use propertyId
   */
  private extractHutId(request: ScrapeRequest): number {
    // Try to extract from URL first
    const urlMatch = request.url.match(/book-hut\/(\d+)/);
    if (urlMatch?.[1]) {
      return Number.parseInt(urlMatch[1], 10);
    }

    // Fall back to propertyId (assuming it's the hutId)
    return request.propertyId;
  }

  /**
   * Fetch hut information from API
   */
  private async fetchHutInfo(hutId: number): Promise<void> {
    this.log.info('Fetching hut information from API', { hutId });

    try {
      const response = await fetch(
        `${hutReservationConfig.platform.apiBaseUrl}/reservation/hutInfo/${hutId}`,
        {
          headers: {
            accept: 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      this.hutData = (await response.json()) as HutInfo;

      this.log.info('Hut information fetched successfully', {
        name: this.hutData.hutName,
        country: this.hutData.tenantCountry,
        altitude: this.hutData.altitude,
        totalBeds: this.hutData.totalBedsInfo,
        categories: this.hutData.hutBedCategories?.length ?? 0,
      });

      // Build category to room type mapping
      if (this.hutData.hutBedCategories) {
        for (const category of this.hutData.hutBedCategories) {
          const englishLabel = category.hutBedCategoryLanguageData?.find(
            (l) => l.language === 'EN'
          )?.label;
          const label =
            englishLabel ||
            category.hutBedCategoryLanguageData?.[0]?.label ||
            `Category ${category.categoryID}`;

          this.categoryToRoomTypeMap.set(category.categoryID, {
            name: label,
            capacity: category.totalSleepingPlaces,
          });
        }
      }
    } catch (error) {
      this.log.error(
        'Failed to fetch hut information',
        error instanceof Error ? error : new Error(String(error)),
        { hutId }
      );
      throw error;
    }
  }

  /**
   * Extract authentication tokens from browser cookies
   */
  private async extractAuthTokens(page: Page): Promise<AuthTokens> {
    this.log.info('Extracting CSRF token from cookies');

    const cookies = await page.context().cookies();
    const xsrfCookie = cookies.find((c) => c.name === 'XSRF-TOKEN');

    if (!xsrfCookie) {
      this.log.error('XSRF-TOKEN cookie not found', undefined, {
        availableCookies: cookies.map((c) => c.name).join(', '),
      });
      throw new Error('Missing XSRF-TOKEN cookie');
    }

    const authTokens: AuthTokens = {
      xsrfToken: xsrfCookie.value,
      cookieString: `XSRF-TOKEN=${xsrfCookie.value}`,
    };

    this.log.info('CSRF token extracted successfully', {
      tokenPreview: `${authTokens.xsrfToken.substring(0, 8)}...`,
    });

    return authTokens;
  }

  /**
   * Fetch availability data from API
   */
  private async fetchAvailability(
    hutId: number,
    authTokens: AuthTokens
  ): Promise<AvailabilityEntry[]> {
    this.log.info('Fetching availability from API', { hutId });

    try {
      const url = new URL(
        `${hutReservationConfig.platform.apiBaseUrl}/reservation/getHutAvailability`
      );
      url.searchParams.set('hutId', hutId.toString());
      url.searchParams.set('step', 'WIZARD');

      const response = await fetch(url.toString(), {
        headers: {
          accept: 'application/json, text/plain, */*',
          'x-xsrf-token': authTokens.xsrfToken,
          cookie: authTokens.cookieString,
          referer: `${hutReservationConfig.platform.baseUrl}/reservation/book-hut/${hutId}/wizard`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as AvailabilityEntry[];

      this.log.info('Availability data fetched successfully', {
        totalDays: data.length,
      });

      return data;
    } catch (error) {
      this.log.error(
        'Failed to fetch availability from API',
        error instanceof Error ? error : new Error(String(error)),
        { hutId }
      );
      throw error;
    }
  }

  /**
   * Parse availability data into room types structure
   */
  private parseAvailabilityData(apiData: AvailabilityEntry[]): RoomTypeAvailability[] {
    this.log.info('Parsing availability data', {
      totalDays: apiData.length,
    });

    if (!apiData || apiData.length === 0) {
      this.log.warn('No availability data to parse');
      return [];
    }

    // Organize data by category
    const dataByCategory = new Map<number, DateAvailability[]>();

    for (const entry of apiData) {
      const date = new Date(entry.date);
      const isOpen = entry.hutStatus !== 'CLOSED';

      // Process each bed category
      if (entry.freeBedsPerCategory) {
        for (const [categoryIdStr, availableBeds] of Object.entries(entry.freeBedsPerCategory)) {
          const categoryId = Number.parseInt(categoryIdStr, 10);

          // Only add if hut is open and there are available beds
          if (isOpen && availableBeds > 0) {
            if (!dataByCategory.has(categoryId)) {
              dataByCategory.set(categoryId, []);
            }

            const dateAvailability: DateAvailability = {
              date,
              status: 'available' as AvailabilityStatus,
              canCheckin: true,
              canCheckout: true,
            };

            dataByCategory.get(categoryId)?.push(dateAvailability);
          }
        }
      }
    }

    // Convert to RoomTypeAvailability array
    const roomTypes: RoomTypeAvailability[] = [];

    for (const [categoryId, dates] of dataByCategory.entries()) {
      const roomTypeInfo = this.categoryToRoomTypeMap.get(categoryId);

      if (roomTypeInfo) {
        roomTypes.push({
          roomTypeName: roomTypeInfo.name,
          externalId: categoryId.toString(),
          capacity: roomTypeInfo.capacity,
          dates,
        });
      } else {
        this.log.warn('No room type mapping found for category', { categoryId });
      }
    }

    this.log.info('Availability data parsed successfully', {
      roomTypes: roomTypes.length,
      totalDates: roomTypes.reduce((sum, rt) => sum + rt.dates.length, 0),
    });

    return roomTypes;
  }
}
