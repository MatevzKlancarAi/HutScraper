/**
 * Batch Scraper for Hut-Reservation.org
 *
 * Scrapes multiple huts and saves results to database
 */

const HutReservationOrchestrator = require('../src/core/HutReservationOrchestrator');
const config = require('../config/hut-reservation.config');
const logger = require('../src/services/logger');
const fs = require('fs');
const path = require('path');

async function main() {
  console.log('========================================');
  console.log('HUT-RESERVATION.ORG BATCH SCRAPER');
  console.log('========================================\n');

  // Get hut IDs from command line or use test set
  const args = process.argv.slice(2);
  let hutIds;

  if (args.length > 0) {
    // Use provided hut IDs
    hutIds = args.map(id => parseInt(id));
    console.log(`Scraping ${hutIds.length} huts from command line arguments\n`);
  } else {
    // Use test set of 20 huts from priority list + additional
    hutIds = [
      // Priority huts from config
      ...config.priorityHuts,
      // Additional test huts to make it 20
      100, 200, 300, 400, 500,
      600, 700, 800, 900, 1000
    ].slice(0, 20);

    console.log(`No hut IDs provided, using test set of ${hutIds.length} huts\n`);
  }

  console.log('Hut IDs:', hutIds.join(', '));
  console.log('');

  // Create orchestrator
  const orchestrator = new HutReservationOrchestrator({
    headless: true,            // Run headless for faster performance
    concurrentBrowsers: 5,     // 5 concurrent browsers for speed
    delayBetweenHuts: 2000,    // 2 seconds between batches
    retryAttempts: 2,          // 2 retry attempts
    saveToDatabase: true,      // Save to database
    saveToFile: false          // Skip individual files for speed
  });

  console.log('Configuration:');
  console.log(`- Concurrent browsers: ${orchestrator.options.concurrentBrowsers}`);
  console.log(`- Delay between batches: ${orchestrator.options.delayBetweenHuts / 1000}s`);
  console.log(`- Retry attempts: ${orchestrator.options.retryAttempts}`);
  console.log(`- Save to database: ${orchestrator.options.saveToDatabase}`);
  console.log('');

  // Run batch scraping
  const startTime = Date.now();
  const report = await orchestrator.scrapeAllHuts(hutIds);
  const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

  // Display results
  console.log('\n========================================');
  console.log('BATCH SCRAPING COMPLETE');
  console.log('========================================');
  console.log(`Duration: ${duration} minutes`);
  console.log(`Total: ${report.summary.total}`);
  console.log(`Successful: ${report.summary.successful}`);
  console.log(`Failed: ${report.summary.failed}`);
  console.log(`Success Rate: ${report.summary.successRate}`);
  console.log(`Avg Time per Hut: ${report.summary.avgTimePerHut}`);

  // Show successful huts
  if (report.successful.length > 0) {
    console.log('\n✅ Successful huts:');
    report.successful.forEach((hut, index) => {
      console.log(`  ${index + 1}. ${hut.hutName} (${hut.country}) - ${hut.availabilityRate} available`);
      console.log(`     ${hut.totalAvailable}/${hut.totalDays} days across ${hut.monthsScraped} months`);
    });
  }

  // Show failed huts
  if (report.failed.length > 0) {
    console.log('\n❌ Failed huts:');
    report.failed.forEach((hut, index) => {
      console.log(`  ${index + 1}. Hut ${hut.hutId}: ${hut.error} (${hut.attempts} attempts)`);
    });
  }

  // Save detailed report
  const reportsDir = path.join(__dirname, '../reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(reportsDir, `hut-reservation-batch-${timestamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`\n📊 Detailed report saved to: ${reportPath}`);
  console.log('\n========================================');
}

// Run the script
main().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
