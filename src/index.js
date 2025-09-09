#!/usr/bin/env node

/**
 * Mountain Hut Scraper - Main Entry Point
 *
 * Usage: node src/index.js [room-type]
 */

const MountainHutScraper = require("./MountainHutScraper");

async function main() {
  const args = process.argv.slice(2);
  const roomType = args[0] || "Dvoposteljna soba - zakonska postelja";

  console.log("🏔️ Mountain Hut Availability Scraper");
  console.log("=====================================\n");

  const scraper = new MountainHutScraper();

  try {
    const results = await scraper.scrape(roomType);

    console.log("\n✅ Scraping completed successfully!");
    console.log(
      `📊 Found ${results.summary.totalAvailable} available days out of ${results.summary.totalDays} total days`
    );

    // Exit with success
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Scraping failed:", error.message);

    // Exit with error
    process.exit(1);
  }
}

// Handle uncaught errors
process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error);
  process.exit(1);
});

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { MountainHutScraper };
