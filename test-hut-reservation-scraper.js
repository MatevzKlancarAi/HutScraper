/**
 * Test script for HutReservationScraper
 *
 * Tests the scraper with Sulzenauhütte (ID: 648)
 */

const HutReservationScraper = require('./src/providers/HutReservationScraper');
const config = require('./config/hut-reservation.config');

async function testScraper() {
  console.log('========================================');
  console.log('HUT-RESERVATION.ORG SCRAPER TEST');
  console.log('========================================\n');

  // Test with Sulzenauhütte (Austria)
  const testHut = config.testHuts.AT;

  console.log(`Testing with: ${testHut.name}`);
  console.log(`Hut ID: ${testHut.id}`);
  console.log(`Location: Austria, ${testHut.altitude}`);
  console.log(`Capacity: ${testHut.beds} beds\n`);

  const scraper = new HutReservationScraper({
    headless: false,  // Show browser for testing
    slowMo: 1000,     // Slow down for visibility
    saveToDatabase: false,  // Don't save to database in test
    saveToFile: true   // Save results to file
  });

  try {
    console.log('Starting scraper...\n');

    const result = await scraper.scrape(testHut.id, {
      targetMonths: [
        "November 2025",
        "December 2025",
        "January 2026"
      ],
      categoryIndex: 0  // Select first room category
    });

    console.log('\n========================================');
    console.log('TEST RESULTS');
    console.log('========================================');

    if (result.success) {
      console.log('✅ Scraping successful!\n');

      console.log('Summary:');
      console.log(`- Hut: ${result.results.hutName}`);
      console.log(`- Country: ${result.results.country}`);
      console.log(`- Room Type: ${result.results.roomType || 'All'}`);
      console.log(`- Months Scraped: ${Object.keys(result.results.months).length}`);
      console.log(`- Total Days: ${result.results.summary.totalDays}`);
      console.log(`- Available Days: ${result.results.summary.totalAvailable}`);
      console.log(`- Availability Rate: ${result.results.summary.overallAvailabilityRate}`);

      if (result.results.summary.allAvailableDates.length > 0) {
        console.log(`\nAvailable Dates (first 10):`);
        result.results.summary.allAvailableDates.slice(0, 10).forEach(date => {
          console.log(`  - ${date}`);
        });
      }

      if (result.filepath) {
        console.log(`\n📁 Results saved to: ${result.filepath}`);
      }
    } else {
      console.log('❌ Scraping failed');
    }

  } catch (error) {
    console.error('\n❌ Test failed with error:');
    console.error(error.message);
    console.error('\nStack trace:');
    console.error(error.stack);
  }

  console.log('\n========================================');
  console.log('TEST COMPLETE');
  console.log('========================================');
}

// Run the test
testScraper().catch(console.error);