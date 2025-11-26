/**
 * Test script for Multi-Hut Orchestrator
 * Demonstrates batch scraping with concurrency and progress tracking
 */

import { hutReservationConfig } from '../src/config/providers/hut-reservation.ts';
import { MultiHutOrchestrator } from '../src/core/orchestration/index.ts';
import type { HutTarget, OrchestrationProgress } from '../src/core/orchestration/index.ts';
import type { BaseScraper } from '../src/core/scraper/BaseScraper.ts';
import { BentralProvider } from '../src/providers/bentral/BentralProvider.ts';
import { HutReservationProvider } from '../src/providers/hut-reservation/index.ts';
import { logger } from '../src/services/logger/index.ts';
import type { ProviderConfig } from '../src/types/index.ts';

/**
 * Provider factory function
 */
function createProvider(providerType: string): BaseScraper | null {
  const config: ProviderConfig = {
    name: providerType,
    type: 'scraper',
    enabled: true,
  };

  switch (providerType) {
    case 'hut-reservation':
      return new HutReservationProvider(config, logger);
    case 'bentral':
      return new BentralProvider(config, logger);
    default:
      return null;
  }
}

/**
 * Progress callback
 */
function onProgress(progress: OrchestrationProgress) {
  const progressBar = '█'.repeat(Math.floor(progress.successRate / 5));
  const emptyBar = '░'.repeat(20 - progressBar.length);

  console.log(
    `\n📊 Progress: Batch ${progress.currentBatch}/${progress.totalBatches} | ` +
      `${progress.completed}/${progress.total} huts | ` +
      `✅ ${progress.successful} | ❌ ${progress.failed} | ` +
      `${progress.successRate.toFixed(1)}%`
  );
  console.log(`   [${progressBar}${emptyBar}] ${progress.successRate.toFixed(1)}%`);
}

/**
 * Main test function
 */
async function main() {
  console.log('🏔️  Multi-Hut Orchestrator Test\n');

  // Test 1: Scrape test huts from each country
  const testTargets: HutTarget[] = Object.entries(hutReservationConfig.testHuts).map(
    ([country, hutInfo]) => ({
      hutId: hutInfo.id,
      hutName: hutInfo.name,
      provider: 'hut-reservation' as const,
      url: `https://www.hut-reservation.org/reservation/book-hut/${hutInfo.id}/wizard`,
    })
  );

  console.log(`Testing with ${testTargets.length} huts (one from each country)\n`);
  console.log('Targets:');
  for (const target of testTargets) {
    console.log(`  • ${target.hutName} (ID: ${target.hutId})`);
  }
  console.log('');

  // Create orchestrator
  const orchestrator = new MultiHutOrchestrator(createProvider, logger, {
    concurrency: 2, // Run 2 huts at once
    retries: 2, // Retry failed huts 2 times
    delayBetweenBatches: 5000, // 5 seconds between batches
    delayBetweenHuts: 0, // No delay between huts in same batch
    saveToDatabase: false, // Don't save to DB for testing
    saveToFile: false,
    dateRange: {
      start: new Date('2025-12-01'),
      end: new Date('2026-02-28'),
    },
  });

  console.log('⚙️  Configuration:');
  console.log('  • Concurrency: 2 huts at once');
  console.log('  • Retries: 2 attempts per hut');
  console.log('  • Delay between batches: 5 seconds');
  console.log('  • Date range: Dec 2025 - Feb 2026');
  console.log('');

  console.log('🚀 Starting batch scraping...\n');

  try {
    // Run orchestrator
    const report = await orchestrator.scrapeAll(testTargets, onProgress);

    // Display results
    console.log('\n' + '='.repeat(80));
    console.log('📋 Final Report');
    console.log('='.repeat(80));

    console.log('\n📊 Summary:');
    console.log(`  Total Huts: ${report.summary.total}`);
    console.log(`  Successful: ${report.summary.successful} ✅`);
    console.log(`  Failed: ${report.summary.failed} ❌`);
    console.log(`  Success Rate: ${report.summary.successRate}`);
    console.log(`  Duration: ${report.summary.duration}`);
    console.log(`  Avg Time/Hut: ${report.summary.avgTimePerHut}`);

    if (report.successful.length > 0) {
      console.log('\n✅ Successful Huts:');
      for (const hut of report.successful) {
        console.log(
          `  • ${hut.hutName} (ID: ${hut.hutId})` +
            ` - ${hut.roomTypes} room types, ${hut.totalDates} dates` +
            ` - ${(hut.duration / 1000).toFixed(1)}s` +
            ` - ${hut.attempts} attempt(s)`
        );
      }
    }

    if (report.failed.length > 0) {
      console.log('\n❌ Failed Huts:');
      for (const hut of report.failed) {
        console.log(
          `  • ${hut.hutName} (ID: ${hut.hutId})` +
            ` - ${hut.attempts} attempts` +
            ` - Error: ${hut.error}`
        );
      }
    }

    console.log('');

    // Exit with appropriate code
    if (report.summary.failed > 0) {
      console.log('⚠️  Some huts failed to scrape');
      process.exit(1);
    } else {
      console.log('🎉 All huts scraped successfully!');
      process.exit(0);
    }
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run test
main();
