import { defineConfig } from 'drizzle-kit';
import { databaseConfig } from './src/config/database.ts';

export default defineConfig({
  schema: './src/services/database/schema.ts',
  out: './src/services/database/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    host: databaseConfig.host,
    port: databaseConfig.port,
    user: databaseConfig.username,
    password: databaseConfig.password,
    database: databaseConfig.database,
    ssl: databaseConfig.ssl,
  },
  schemaFilter: ['availability'],
  verbose: true,
  strict: true,
});
