/**
 * Scrape Persistence
 * Handles saving ScrapeResult data to database using repositories
 */

import type { Logger } from '@services/logger/index.ts';
import type { ScrapeResult } from '../../types/index.ts';
import type { DatabaseService } from './index.ts';

/**
 * ScrapePersistence
 * Provides methods to persist scrape results to database
 */
export class ScrapePersistence {
  constructor(
    private readonly db: DatabaseService,
    private readonly logger: Logger
  ) {}

  /**
   * Save a complete scrape result to the database
   * - Ensures property exists
   * - Ensures room types exist
   * - Upserts available dates
   *
   * @param result ScrapeResult from a provider
   * @param propertyName Name of the property (hut)
   * @param _url Property URL (reserved for future use)
   * @param bookingSystem Booking system type (e.g., 'hut-reservation.org', 'bentral')
   * @returns Object containing property ID and room type ID mappings
   */
  async saveScrapeResult(
    result: ScrapeResult,
    propertyName: string,
    _url: string,
    bookingSystem: string
  ): Promise<{
    propertyId: number;
    roomTypeIds: Map<string, number>;
  }> {
    const startTime = Date.now();

    try {
      // 1. Ensure property exists
      const property = await this.db.properties.ensure({
        name: propertyName,
        bookingSystem,
        location: null,
      });

      this.logger.debug(`Property ensured: ${property.name} (ID: ${property.id})`);

      // 2. Ensure all room types exist and build ID map
      const roomTypeIds = new Map<string, number>();

      for (const roomType of result.roomTypes) {
        // Build ensure options conditionally to avoid undefined values
        const ensureOptions: {
          propertyId: number;
          name: string;
          externalId?: string;
          capacity?: number;
          quantity?: number;
        } = {
          propertyId: property.id,
          name: roomType.roomTypeName,
          // Capacity is required by database - use 1 as default if not available
          capacity: roomType.capacity || 1,
          quantity: 1,
        };

        if (roomType.externalId) {
          ensureOptions.externalId = roomType.externalId;
        }

        const rt = await this.db.roomTypes.ensure(ensureOptions);

        roomTypeIds.set(roomType.roomTypeName, rt.id);

        this.logger.debug(`Room type ensured: ${rt.name} (ID: ${rt.id})`);
      }

      // 3. Save availability dates for each room type
      let totalDatesInserted = 0;

      for (const roomType of result.roomTypes) {
        const roomTypeId = roomTypeIds.get(roomType.roomTypeName);
        if (!roomTypeId) {
          this.logger.warn(`Room type ID not found for: ${roomType.roomTypeName}`);
          continue;
        }

        // Skip if no dates
        if (roomType.dates.length === 0) {
          continue;
        }

        // Calculate date range for smart deletion
        const dates = roomType.dates.map((d) => new Date(d.date));
        const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
        const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));

        // Delete existing dates in range
        await this.db.availability.deleteByRoomTypeAndDateRange(roomTypeId, minDate, maxDate);

        // Prepare dates for insert
        // NOTE: Only insert available dates. Unavailable dates are handled by deletion.
        const datesToInsert = roomType.dates
          .filter((d) => d.status === 'available')
          .map((d) => ({
            propertyId: property.id,
            roomTypeId,
            date: new Date(d.date),
            canCheckin: d.canCheckin ?? true,
            canCheckout: d.canCheckout ?? true,
            scrapedAt: new Date(),
          }));

        // Insert dates
        await this.db.availability.upsertBatch(datesToInsert);
        totalDatesInserted += datesToInsert.length;

        this.logger.debug(
          `Saved ${datesToInsert.length} dates for room type: ${roomType.roomTypeName}`
        );
      }

      const duration = Date.now() - startTime;

      this.logger.info(
        {
          propertyId: property.id,
          roomTypes: roomTypeIds.size,
          totalDates: totalDatesInserted,
          duration,
        },
        `Scrape result persisted successfully: ${propertyName}`
      );

      return {
        propertyId: property.id,
        roomTypeIds,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        {
          message: err.message,
          stack: err.stack,
          cause: (err as any).cause,
        },
        'Failed to persist scrape result'
      );
      throw error;
    }
  }

  /**
   * Get scraping statistics for a property
   */
  async getStats(propertyName: string) {
    const property = await this.db.properties.findByName(propertyName);
    if (!property) {
      return null;
    }

    const roomTypes = await this.db.roomTypes.findByPropertyId(property.id);
    const stats = [];

    for (const roomType of roomTypes) {
      const count = await this.db.availability.countForRoomType(roomType.id);
      stats.push({
        roomTypeName: roomType.name,
        availableDatesCount: count,
      });
    }

    return {
      property: property.name,
      roomTypes: stats,
    };
  }
}

/**
 * Create scrape persistence service
 */
export function createScrapePersistence(db: DatabaseService, logger: Logger): ScrapePersistence {
  return new ScrapePersistence(db, logger);
}
