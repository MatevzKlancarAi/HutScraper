import { env } from './env.ts';

/**
 * Database configuration
 */
export const databaseConfig = {
  host: env.DATABASE_HOST,
  port: env.DATABASE_PORT,
  database: env.DATABASE_NAME,
  username: env.DATABASE_USER,
  password: env.DATABASE_PASSWORD,
  max: env.DATABASE_MAX_CONNECTIONS,
  ssl: env.DATABASE_SSL,

  /**
   * Connection string for Drizzle
   */
  get connectionString(): string {
    const auth = `${this.username}:${this.password}`;
    const host = `${this.host}:${this.port}`;
    const ssl = this.ssl ? '?sslmode=require' : '';
    return `postgres://${auth}@${host}/${this.database}${ssl}`;
  },

  /**
   * Connection options for postgres.js driver
   */
  get options() {
    return {
      host: this.host,
      port: this.port,
      database: this.database,
      username: this.username,
      password: this.password,
      max: this.max,
      ssl: this.ssl ? { rejectUnauthorized: false } : false,
      idle_timeout: 30,
      connect_timeout: 10,
    };
  },
} as const;
