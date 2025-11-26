import { and, eq, sql, sql as sqlOp } from 'drizzle-orm';
import type { Database } from '../client.ts';
import { sql as rawSql } from '../client.ts';
import { type NewRoomType, type RoomType, roomTypes } from '../schema.ts';

/**
 * Room Type Repository
 * Handles all database operations for room types
 */
export class RoomTypeRepository {
  constructor(private db: Database) {}

  /**
   * Find room type by ID
   */
  async findById(id: number): Promise<RoomType | undefined> {
    const result = await this.db.select().from(roomTypes).where(eq(roomTypes.id, id)).limit(1);

    return result[0];
  }

  /**
   * Find room type by external ID
   */
  async findByExternalId(propertyId: number, externalId: string): Promise<RoomType | undefined> {
    const result = await this.db
      .select()
      .from(roomTypes)
      .where(and(eq(roomTypes.propertyId, propertyId), eq(roomTypes.externalId, externalId)))
      .limit(1);

    return result[0];
  }

  /**
   * Find all room types for a property
   */
  async findByPropertyId(propertyId: number): Promise<RoomType[]> {
    return await this.db
      .select()
      .from(roomTypes)
      .where(eq(roomTypes.propertyId, propertyId))
      .orderBy(roomTypes.name);
  }

  /**
   * Find all active room types for a property
   */
  async findActiveByPropertyId(propertyId: number): Promise<RoomType[]> {
    return await this.db
      .select()
      .from(roomTypes)
      .where(and(eq(roomTypes.propertyId, propertyId), eq(roomTypes.isActive, true)))
      .orderBy(roomTypes.name);
  }

  /**
   * Create a new room type
   */
  async create(data: NewRoomType): Promise<RoomType> {
    const result = await this.db.insert(roomTypes).values(data).returning();

    return result[0]!;
  }

  /**
   * Update a room type
   */
  async update(id: number, data: Partial<NewRoomType>): Promise<RoomType | undefined> {
    const result = await this.db
      .update(roomTypes)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(roomTypes.id, id))
      .returning();

    return result[0];
  }

  /**
   * Ensure room type exists (find or create)
   * Returns existing room type or creates new one
   * Uses manual ID generation with MAX(id) + 1 to avoid sequence permission issues
   */
  async ensure(data: {
    propertyId: number;
    name: string;
    externalId?: string;
    capacity?: number;
    quantity?: number;
    bedType?: string;
    roomCategory?: string;
    features?: string[];
  }): Promise<RoomType> {
    // If external ID is provided, try to find by it
    if (data.externalId) {
      const existing = await this.findByExternalId(data.propertyId, data.externalId);
      if (existing) {
        return existing;
      }
    }

    // Otherwise, try to find by property ID and name
    const result = await this.db
      .select()
      .from(roomTypes)
      .where(and(eq(roomTypes.propertyId, data.propertyId), eq(roomTypes.name, data.name)))
      .limit(1);

    if (result[0]) {
      return result[0];
    }

    // Use manual ID generation with MAX(id) + 1
    // This avoids PostgreSQL sequence permission issues
    const maxIdResult = await rawSql<{ next_id: number }[]>`
      SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM availability.room_types
    `;
    const nextId = maxIdResult[0].next_id;

    // Create new room type with explicit ID
    const insertResult = await this.db
      .insert(roomTypes)
      .values({
        id: nextId,
        propertyId: data.propertyId,
        name: data.name,
        externalId: data.externalId ?? null,
        capacity: data.capacity ?? null,
        quantity: data.quantity ?? null,
        bedType: data.bedType ?? null,
        roomCategory: data.roomCategory ?? null,
        features: data.features ?? null,
        isActive: true,
      })
      .returning();

    return insertResult[0]!;
  }

  /**
   * Get room types map for a property (name -> id)
   * Useful for fast lookups during scraping
   */
  async getMapForProperty(propertyId: number): Promise<Map<string, number>> {
    const rooms = await this.findByPropertyId(propertyId);
    return new Map(rooms.map((room) => [room.name, room.id]));
  }

  /**
   * Soft delete a room type
   */
  async softDelete(id: number): Promise<void> {
    await this.db
      .update(roomTypes)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(roomTypes.id, id));
  }

  /**
   * Hard delete a room type
   */
  async delete(id: number): Promise<void> {
    await this.db.delete(roomTypes).where(eq(roomTypes.id, id));
  }

  /**
   * Count room types for a property
   */
  async countForProperty(propertyId: number): Promise<number> {
    const result = await this.db
      .select({ count: sqlOp<number>`count(*)::int` })
      .from(roomTypes)
      .where(eq(roomTypes.propertyId, propertyId));

    return result[0]?.count ?? 0;
  }
}
