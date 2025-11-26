#!/usr/bin/env bun

/**
 * Test script for database persistence
 * Demonstrates how scrape results are saved to the database
 */

import { HutReservationProvider } from '@providers/hut-reservation/HutReservationProvider.ts';
import { createScrapePersistence, database } from '@services/database/index.ts';
import { logger } from '@services/logger/index.ts';
import type { ProviderConfig, ScrapeRequest } from '../src/types/index.ts';

async function main() {
  logger.info('🚀 Starting Database Persistence Test');

  // Test database connection
  logger.info('📡 Testing database connection...');
  const connected = await database.testConnection();
  if (!connected) {
    logger.error('❌ Database connection failed');
    process.exit(1);
  }
  logger.info('✅ Database connected');

  // Create persistence service
  const persistence = createScrapePersistence(database, logger);

  // Create provider config
  const providerConfig: ProviderConfig = {
    name: 'hut-reservation',
    type: 'scraper',
    enabled: true,
    settings: {},
  };

  // Initialize provider
  const provider = new HutReservationProvider(providerConfig, logger);

  try {
    logger.info('📦 Initializing provider...');
    await provider.initialize();

    // Create scrape request for one hut (Swiss hut from previous test)
    const now = new Date();
    const oneMonthLater = new Date(now);
    oneMonthLater.setMonth(now.getMonth() + 1);

    const request: ScrapeRequest = {
      propertyId: 10, // Albert-Heim-Hütte SAC (CH)
      propertyName: 'Albert-Heim-Hütte SAC',
      url: 'https://www.hut-reservation.org',
      dateRange: {
        start: now,
        end: oneMonthLater,
      },
    };

    logger.info('🔍 Starting scrape...', {
      propertyName: request.propertyName,
      dateRange: {
        start: request.dateRange.start.toISOString().split('T')[0],
        end: request.dateRange.end.toISOString().split('T')[0],
      },
    });

    // Scrape availability
    const result = await provider.scrape(request);

    // Display results
    logger.info('✅ Scrape complete!', {
      success: result.metadata.success,
      roomTypesFound: result.roomTypes.length,
      totalDates: result.roomTypes.reduce((sum, rt) => sum + rt.dates.length, 0),
      duration: result.metadata.duration,
    });

    if (!result.metadata.success) {
      logger.error('❌ Scraping failed:', result.metadata.error);
      process.exit(1);
    }

    // Save to database
    logger.info('💾 Saving to database...');

    const { propertyId, roomTypeIds } = await persistence.saveScrapeResult(
      result,
      request.propertyName,
      request.url,
      'hut-reservation.org'
    );

    logger.info('✅ Saved to database!', {
      propertyId,
      roomTypes: roomTypeIds.size,
    });

    // Show room type IDs
    logger.info('Room type mappings:');
    for (const [name, id] of roomTypeIds.entries()) {
      logger.info(`  - ${name}: ID ${id}`);
    }

    // Get stats from database
    logger.info('📊 Fetching stats from database...');
    const stats = await persistence.getStats(request.propertyName);

    if (stats) {
      logger.info('Database stats:', {
        property: stats.property,
        roomTypes: stats.roomTypes,
      });
    }

    logger.info('🎉 Test completed successfully!');
  } catch (error) {
    logger.error('❌ Test failed', error instanceof Error ? error : new Error(String(error)));
    process.exit(1);
  } finally {
    // Cleanup
    logger.info('🧹 Cleaning up...');
    await provider.cleanup();
    await database.close();
  }
}

// Run the test
main();
