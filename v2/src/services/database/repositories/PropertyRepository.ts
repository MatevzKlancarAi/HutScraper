import { and, eq, sql, sql as sqlOp } from 'drizzle-orm';
import type { Database } from '../client.ts';
import { sql as rawSql } from '../client.ts';
import { type NewProperty, type Property, properties } from '../schema.ts';

/**
 * Property Repository
 * Handles all database operations for properties (mountain huts)
 */
export class PropertyRepository {
  constructor(private db: Database) {}

  /**
   * Find property by ID
   */
  async findById(id: number): Promise<Property | undefined> {
    const result = await this.db.select().from(properties).where(eq(properties.id, id)).limit(1);

    return result[0];
  }

  /**
   * Find property by name
   */
  async findByName(name: string): Promise<Property | undefined> {
    const result = await this.db
      .select()
      .from(properties)
      .where(eq(properties.name, name))
      .limit(1);

    return result[0];
  }

  /**
   * Find property by slug
   */
  async findBySlug(slug: string): Promise<Property | undefined> {
    const result = await this.db
      .select()
      .from(properties)
      .where(eq(properties.slug, slug))
      .limit(1);

    return result[0];
  }

  /**
   * Find all active properties
   */
  async findAllActive(): Promise<Property[]> {
    return await this.db
      .select()
      .from(properties)
      .where(eq(properties.isActive, true))
      .orderBy(properties.name);
  }

  /**
   * Find properties by booking system
   */
  async findByBookingSystem(bookingSystem: string): Promise<Property[]> {
    return await this.db
      .select()
      .from(properties)
      .where(and(eq(properties.bookingSystem, bookingSystem), eq(properties.isActive, true)))
      .orderBy(properties.name);
  }

  /**
   * Create a new property
   */
  async create(data: NewProperty): Promise<Property> {
    const result = await this.db.insert(properties).values(data).returning();

    return result[0]!;
  }

  /**
   * Update a property
   */
  async update(id: number, data: Partial<NewProperty>): Promise<Property | undefined> {
    const result = await this.db
      .update(properties)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(properties.id, id))
      .returning();

    return result[0];
  }

  /**
   * Ensure property exists (find or create)
   * Returns existing property or creates new one
   * Uses manual ID generation with MAX(id) + 1 to avoid sequence permission issues
   */
  async ensure(data: {
    name: string;
    bookingSystem?: string;
    location?: Property['location'];
  }): Promise<Property> {
    // Try to find by name first
    const existing = await this.findByName(data.name);
    if (existing) {
      return existing;
    }

    // Create slug from name
    const slug = data.name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');

    // Use manual ID generation with MAX(id) + 1
    // This avoids PostgreSQL sequence permission issues
    const maxIdResult = await rawSql<{ next_id: number }[]>`
      SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM availability.properties
    `;
    const nextId = maxIdResult[0].next_id;

    // Create new property with explicit ID
    const result = await this.db
      .insert(properties)
      .values({
        id: nextId,
        name: data.name,
        slug,
        bookingSystem: data.bookingSystem ?? null,
        location: data.location ?? null,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: properties.slug,
        set: {
          name: sql`EXCLUDED.name`,
          bookingSystem: sql`EXCLUDED.booking_system`,
          updatedAt: new Date(),
        },
      })
      .returning();

    return result[0]!;
  }

  /**
   * Delete a property (soft delete - set isActive to false)
   */
  async softDelete(id: number): Promise<void> {
    await this.db
      .update(properties)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(properties.id, id));
  }

  /**
   * Delete a property (hard delete)
   */
  async delete(id: number): Promise<void> {
    await this.db.delete(properties).where(eq(properties.id, id));
  }

  /**
   * Get total count of properties
   */
  async count(activeOnly = false): Promise<number> {
    const result = await this.db
      .select({ count: sqlOp<number>`count(*)::int` })
      .from(properties)
      .where(activeOnly ? eq(properties.isActive, true) : undefined);

    return result[0]?.count ?? 0;
  }
}
