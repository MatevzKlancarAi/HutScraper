import { databaseConfig } from '@config/database.ts';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.ts';

/**
 * Postgres.js client (faster than pg for Bun)
 */
export const sql = postgres(databaseConfig.options);

/**
 * Drizzle database client
 * Use this for all database operations
 */
export const db = drizzle(sql, {
  schema,
  logger: process.env.NODE_ENV === 'development',
});

/**
 * Test database connection
 */
export async function testConnection(): Promise<boolean> {
  try {
    await sql`SELECT 1 as connected`;
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
}

/**
 * Close database connection
 * Call this on application shutdown
 */
export async function closeConnection(): Promise<void> {
  await sql.end();
}

/**
 * Database client type for dependency injection
 */
export type Database = typeof db;
