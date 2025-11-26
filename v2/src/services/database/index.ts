import { closeConnection, db, sql, testConnection } from './client.ts';
import { AvailabilityRepository } from './repositories/AvailabilityRepository.ts';
import { PropertyRepository } from './repositories/PropertyRepository.ts';
import { RoomTypeRepository } from './repositories/RoomTypeRepository.ts';

/**
 * Database Service
 * Provides access to all repositories and database utilities
 */
export class DatabaseService {
  public readonly properties: PropertyRepository;
  public readonly roomTypes: RoomTypeRepository;
  public readonly availability: AvailabilityRepository;

  constructor() {
    this.properties = new PropertyRepository(db);
    this.roomTypes = new RoomTypeRepository(db);
    this.availability = new AvailabilityRepository(db);
  }

  /**
   * Test database connection
   */
  async testConnection(): Promise<boolean> {
    return await testConnection();
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    await closeConnection();
  }

  /**
   * Execute a raw SQL query
   * Use this for complex queries not covered by repositories
   */
  async query<T = unknown>(query: string, params?: any[]): Promise<T[]> {
    if (params) {
      return (await sql.unsafe(query, params as any)) as T[];
    }
    return (await sql.unsafe(query)) as T[];
  }

  /**
   * Begin a transaction
   * Use this for multiple operations that need to be atomic
   */
  async transaction<T>(callback: (tx: typeof db) => Promise<T>): Promise<T> {
    return await db.transaction(callback);
  }
}

/**
 * Singleton database service instance
 * Use this throughout the application
 */
export const database = new DatabaseService();

/**
 * Export types and schema
 */
export * from './schema.ts';
export { db, sql } from './client.ts';

/**
 * Export persistence services
 */
export { ScrapePersistence, createScrapePersistence } from './ScrapePersistence.ts';
