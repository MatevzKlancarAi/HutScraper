import { and, eq, gte, lte, sql, sql as sqlOp } from 'drizzle-orm';
import type { Database } from '../client.ts';
import { sql as rawSql } from '../client.ts';
import { type AvailableDate, type NewAvailableDate, availableDates } from '../schema.ts';

/**
 * Availability Repository
 * Handles all database operations for available dates
 */
export class AvailabilityRepository {
  constructor(private db: Database) {}

  /**
   * Find availability by date range for a room type
   */
  async findByRoomTypeAndDateRange(
    roomTypeId: number,
    startDate: Date,
    endDate: Date
  ): Promise<AvailableDate[]> {
    return await this.db
      .select()
      .from(availableDates)
      .where(
        and(
          eq(availableDates.roomTypeId, roomTypeId),
          gte(availableDates.date, startDate),
          lte(availableDates.date, endDate)
        )
      )
      .orderBy(availableDates.date);
  }

  /**
   * Find availability by date range for a property
   */
  async findByPropertyAndDateRange(
    propertyId: number,
    startDate: Date,
    endDate: Date
  ): Promise<AvailableDate[]> {
    return await this.db
      .select()
      .from(availableDates)
      .where(
        and(
          eq(availableDates.propertyId, propertyId),
          gte(availableDates.date, startDate),
          lte(availableDates.date, endDate)
        )
      )
      .orderBy(availableDates.date);
  }

  /**
   * Upsert availability dates (insert or update on conflict)
   * This is the main method for storing scraped availability data
   * Uses manual ID generation with MAX(id) + increment to avoid sequence permission issues
   */
  async upsertBatch(dates: NewAvailableDate[]): Promise<void> {
    if (dates.length === 0) return;

    // Get next available ID using MAX(id) + 1
    const maxIdResult = await rawSql<{ next_id: string }[]>`
      SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM availability.available_dates
    `;
    let nextId = BigInt(maxIdResult[0].next_id);

    // Add explicit IDs to each date entry
    const datesWithIds = dates.map((date) => ({
      ...date,
      id: nextId++, // Use BigInt directly - Drizzle will handle the conversion
    }));

    // Insert with manual IDs
    await this.db
      .insert(availableDates)
      .values(datesWithIds)
      .onConflictDoUpdate({
        target: [availableDates.propertyId, availableDates.roomTypeId, availableDates.date],
        set: {
          canCheckin: sqlOp`EXCLUDED.can_checkin`,
          canCheckout: sqlOp`EXCLUDED.can_checkout`,
          scrapedAt: sqlOp`EXCLUDED.scraped_at`,
        },
      });
  }

  /**
   * Delete old availability data for a room type
   * Used before inserting fresh scraped data
   */
  async deleteByRoomTypeAndDateRange(
    roomTypeId: number,
    startDate: Date,
    endDate: Date
  ): Promise<void> {
    await this.db
      .delete(availableDates)
      .where(
        and(
          eq(availableDates.roomTypeId, roomTypeId),
          gte(availableDates.date, startDate),
          lte(availableDates.date, endDate)
        )
      );
  }

  /**
   * Delete old availability data for a property
   */
  async deleteByPropertyAndDateRange(
    propertyId: number,
    startDate: Date,
    endDate: Date
  ): Promise<void> {
    await this.db
      .delete(availableDates)
      .where(
        and(
          eq(availableDates.propertyId, propertyId),
          gte(availableDates.date, startDate),
          lte(availableDates.date, endDate)
        )
      );
  }

  /**
   * Count available dates for a room type
   */
  async countForRoomType(roomTypeId: number): Promise<number> {
    const result = await this.db
      .select({ count: sqlOp<number>`count(*)::int` })
      .from(availableDates)
      .where(eq(availableDates.roomTypeId, roomTypeId));

    return result[0]?.count ?? 0;
  }

  /**
   * Count available dates for a property
   */
  async countForProperty(propertyId: number): Promise<number> {
    const result = await this.db
      .select({ count: sqlOp<number>`count(*)::int` })
      .from(availableDates)
      .where(eq(availableDates.propertyId, propertyId));

    return result[0]?.count ?? 0;
  }

  /**
   * Get date ranges with availability for a property
   */
  async getAvailableRangesForProperty(
    propertyId: number,
    startDate: Date,
    endDate: Date
  ): Promise<Array<{ date: Date; availableRooms: number }>> {
    const result = await this.db
      .select({
        date: availableDates.date,
        availableRooms: sqlOp<number>`count(DISTINCT room_type_id)::int`,
      })
      .from(availableDates)
      .where(
        and(
          eq(availableDates.propertyId, propertyId),
          gte(availableDates.date, startDate),
          lte(availableDates.date, endDate),
          eq(availableDates.canCheckin, true)
        )
      )
      .groupBy(availableDates.date)
      .orderBy(availableDates.date);

    return result.map((r) => ({
      date: r.date,
      availableRooms: r.availableRooms ?? 0,
    }));
  }

  /**
   * Delete availability data older than a certain date
   * Useful for cleanup jobs
   */
  async deleteOlderThan(date: Date): Promise<number> {
    const result = await this.db
      .delete(availableDates)
      .where(lte(availableDates.date, date))
      .returning({ id: availableDates.id });

    return result.length;
  }
}
