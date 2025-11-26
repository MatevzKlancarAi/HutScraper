#!/usr/bin/env bun

/**
 * Test script for BentralProvider
 * Demonstrates how to use the provider system
 */

import { bentralConfig } from '@config/providers/bentral.ts';
import { scraperConfig } from '@config/scraper.ts';
import { BentralProvider } from '@providers/bentral/BentralProvider.ts';
import { createLogger } from '@services/logger/index.ts';
import type { ProviderConfig, ScrapeRequest } from '../src/types/index.ts';

async function main() {
  // Create logger
  const logger = createLogger();

  logger.info('🚀 Starting Bentral Provider Test');

  // Create provider config
  const providerConfig: ProviderConfig = {
    name: 'bentral',
    type: 'scraper',
    enabled: true,
    settings: {
      baseUrl: bentralConfig.iframeUrl,
    },
  };

  // Initialize provider
  const provider = new BentralProvider(providerConfig, logger);

  try {
    logger.info('📦 Initializing provider...');
    await provider.initialize();

    // Create scrape request for next 2 months
    const now = new Date();
    const twoMonthsLater = new Date(now);
    twoMonthsLater.setMonth(now.getMonth() + 2);

    const request: ScrapeRequest = {
      propertyId: 1, // Test property ID
      propertyName: 'Test Bentral Hut',
      url: bentralConfig.iframeUrl,
      dateRange: {
        start: now,
        end: twoMonthsLater,
      },
      roomTypes: ['Dvoposteljna soba - zakonska postelja'], // Double room
    };

    logger.info('🔍 Starting scrape...', {
      dateRange: {
        start: request.dateRange.start.toISOString().split('T')[0],
        end: request.dateRange.end.toISOString().split('T')[0],
      },
      roomTypes: request.roomTypes,
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

    // Show available dates
    for (const roomType of result.roomTypes) {
      const availableDates = roomType.dates.filter((d) => d.status === 'available');

      logger.info(`📅 ${roomType.roomTypeName}`, {
        totalDates: roomType.dates.length,
        available: availableDates.length,
        availabilityRate: `${((availableDates.length / roomType.dates.length) * 100).toFixed(1)}%`,
      });

      if (availableDates.length > 0) {
        logger.info('First 5 available dates:', {
          dates: availableDates.slice(0, 5).map((d) => d.date.toISOString().split('T')[0]),
        });
      }
    }

    logger.info('🎉 Test completed successfully!');
  } catch (error) {
    logger.error('❌ Test failed', error instanceof Error ? error : new Error(String(error)));
    process.exit(1);
  } finally {
    // Cleanup
    logger.info('🧹 Cleaning up...');
    await provider.cleanup();
  }
}

// Run the test
main();
