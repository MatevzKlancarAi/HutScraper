/**
 * Test script for HutReservation provider
 * Tests scraping with sample huts from AT, CH, DE, IT
 */

import { hutReservationConfig } from '../src/config/providers/hut-reservation.ts';
import { HutReservationProvider, getHutById } from '../src/providers/hut-reservation/index.ts';
import { logger } from '../src/services/logger/index.ts';
import type { ProviderConfig, ScrapeRequest } from '../src/types/index.ts';

/**
 * Test a single hut
 */
async function testHut(hutId: number, hutName: string, country: string) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Testing: ${hutName} (${country}) - ID: ${hutId}`);
  console.log('='.repeat(80));

  try {
    // Get hut info from database
    const hutInfo = await getHutById(hutId);
    if (!hutInfo) {
      console.error(`❌ Hut ${hutId} not found in database`);
      return false;
    }

    console.log(`✓ Hut found in database`);
    console.log(`  Name: ${hutInfo.name}`);
    console.log(`  Country: ${hutInfo.country}`);
    console.log(`  Altitude: ${hutInfo.altitude}`);
    console.log(`  Total Beds: ${hutInfo.totalBeds}`);
    console.log(`  Categories: ${hutInfo.categories.length}`);

    // Create provider
    const config: ProviderConfig = {
      name: 'hut-reservation',
      type: 'scraper',
      enabled: true,
    };

    const provider = new HutReservationProvider(config, logger);

    // Initialize
    console.log('\n📦 Initializing provider...');
    await provider.initialize();
    console.log('✓ Provider initialized');

    // Create scrape request
    const request: ScrapeRequest = {
      propertyId: hutId,
      propertyName: hutInfo.name,
      url: `https://www.hut-reservation.org/reservation/book-hut/${hutId}/wizard`,
      dateRange: {
        start: new Date('2025-12-01'),
        end: new Date('2026-03-31'),
      },
    };

    // Scrape
    console.log('\n🔍 Starting scrape...');
    const result = await provider.scrape(request);

    // Display results
    console.log('\n📊 Results:');
    console.log(`  Success: ${result.metadata.success ? '✅' : '❌'}`);
    console.log(`  Duration: ${result.metadata.duration}ms`);
    console.log(`  Room Types: ${result.roomTypes.length}`);

    if (result.metadata.error) {
      console.error(`  Error: ${result.metadata.error}`);
    }

    for (const roomType of result.roomTypes) {
      console.log(`\n  Room Type: ${roomType.roomTypeName}`);
      console.log(`    Capacity: ${roomType.capacity ?? 'N/A'}`);
      console.log(`    External ID: ${roomType.externalId ?? 'N/A'}`);
      console.log(`    Available Dates: ${roomType.dates.length}`);

      if (roomType.dates.length > 0) {
        const firstDate = roomType.dates[0].date.toISOString().split('T')[0];
        const lastDate = roomType.dates[roomType.dates.length - 1].date.toISOString().split('T')[0];
        console.log(`    Date Range: ${firstDate} to ${lastDate}`);
      }
    }

    // Cleanup
    console.log('\n🧹 Cleaning up...');
    await provider.cleanup();
    console.log('✓ Cleanup complete');

    return result.metadata.success;
  } catch (error) {
    console.error(`\n❌ Test failed: ${error instanceof Error ? error.message : String(error)}`);
    console.error(error);
    return false;
  }
}

/**
 * Main test function
 */
async function main() {
  console.log('🏔️  HutReservation Provider Test Suite\n');

  const testHuts = Object.entries(hutReservationConfig.testHuts);
  const results: Record<string, boolean> = {};

  for (const [country, hutInfo] of testHuts) {
    const success = await testHut(hutInfo.id, hutInfo.name, country);
    results[country] = success;

    // Wait between tests to avoid rate limiting
    if (country !== 'IT') {
      // Don't wait after last test
      console.log('\n⏳ Waiting 10 seconds before next test...');
      await new Promise((resolve) => setTimeout(resolve, 10000));
    }
  }

  // Summary
  console.log(`\n${'='.repeat(80)}`);
  console.log('Test Summary');
  console.log('='.repeat(80));

  const successCount = Object.values(results).filter((r) => r).length;
  const totalCount = Object.keys(results).length;

  for (const [country, success] of Object.entries(results)) {
    console.log(`${country}: ${success ? '✅ PASS' : '❌ FAIL'}`);
  }

  console.log(`\nTotal: ${successCount}/${totalCount} passed`);

  if (successCount === totalCount) {
    console.log('\n🎉 All tests passed!');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some tests failed');
    process.exit(1);
  }
}

// Run tests
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
