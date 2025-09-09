#!/usr/bin/env node

/**
 * Parallel Database Scraper - Scrapes multiple room types concurrently and saves directly to database
 * Fetches room types from database and saves available dates back to database
 */

const MountainHutScraper = require('./MountainHutScraper');
const database = require('./services/database');
const config = require('../config/scraper.config.js');

class ParallelDatabaseScraper {
  constructor(options = {}) {
    this.batchSize = options.batchSize || 2; // Reduce to 2 concurrent scrapers to avoid overload
    this.delayBetweenBatches = options.delayBetweenBatches || 15000; // 15 seconds between batches
    this.maxRetries = options.maxRetries || 1; // Reduce retries for faster testing
    this.testMode = options.testMode !== undefined ? options.testMode : true; // For testing with just September
    
    this.propertyName = 'Triglavski Dom';
    this.propertyId = null;
    this.roomTypes = [];
    
    this.results = {
      scrapingDate: new Date().toISOString(),
      propertyName: this.propertyName,
      period: this.testMode ? "September 2025 (TEST)" : "12 months from today",
      roomTypes: {},
      summary: {
        totalRooms: 0,
        successfulRooms: 0,
        failedRooms: 0,
        totalDatesScraped: 0,
        startTime: null,
        endTime: null,
        duration: null
      }
    };
  }

  /**
   * Initialize database and load property/room types
   */
  async initializeDatabase() {
    console.log('🔗 Initializing database connection...');
    await database.initialize();
    
    // Get property from database
    console.log(`🏠 Loading property: ${this.propertyName}`);
    const property = await database.getPropertyByName(this.propertyName);
    if (!property) {
      throw new Error(`Property '${this.propertyName}' not found in database`);
    }
    
    this.propertyId = property.id;
    console.log(`   ✅ Property loaded (ID: ${this.propertyId})`);
    
    // Load room types from database
    console.log('🛏️  Loading room types from database...');
    const dbRoomTypes = await database.getRoomTypesForProperty(this.propertyId);
    
    if (dbRoomTypes.length === 0) {
      throw new Error('No active room types found in database');
    }
    
    this.roomTypes = dbRoomTypes;
    this.results.summary.totalRooms = dbRoomTypes.length;
    
    console.log(`   ✅ Loaded ${dbRoomTypes.length} room types:`);
    dbRoomTypes.forEach((roomType, index) => {
      console.log(`      ${index + 1}. ${roomType.name} (ID: ${roomType.id}, External: ${roomType.external_id})`);
    });
    
    return { propertyId: this.propertyId, roomTypes: this.roomTypes };
  }

  /**
   * Generate target months list
   */
  getTargetMonths() {
    if (this.testMode) {
      return ['September 2025']; // Just test with September
    }
    
    // Generate 12 months starting from current month
    const currentDate = new Date();
    const months = [];
    
    const monthNames = [
      'Januar', 'Februar', 'Marec', 'April', 'Maj', 'Junij',
      'Julij', 'Avgust', 'September', 'Oktober', 'November', 'December'
    ];
    
    for (let i = 0; i < 12; i++) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth() + i, 1);
      const monthName = monthNames[date.getMonth()];
      const year = date.getFullYear();
      months.push(`${monthName} ${year}`);
    }
    
    return months;
  }

  /**
   * Create scraper configuration for database mode
   */
  createScraperConfig(roomType) {
    const targetMonths = this.getTargetMonths();
    
    return {
      target: {
        name: this.propertyName,
        baseUrl: 'https://triglavskidom.si/',
        bookingSystem: 'Bentral'
      },
      bentral: config.bentral,
      scraper: {
        ...config.scraper,
        browser: {
          ...config.scraper.browser,
          headless: true, // Run headless for performance
          slowMo: 1000    // Slow down to avoid timeouts
        },
        targetMonths: targetMonths
      },
      // Database configuration
      propertyId: this.propertyId,
      roomTypeId: roomType.id,
      saveToDatabase: true,  // Enable database saving
      saveToFile: false      // Skip file saving for performance
    };
  }

  /**
   * Scrape all room types in parallel batches
   */
  async scrapeAllRooms() {
    console.log('\n🏔️ PARALLEL DATABASE SCRAPER');
    console.log('=' . repeat(50));
    console.log(`Property: ${this.propertyName} (ID: ${this.propertyId})`);
    console.log(`Room Types: ${this.roomTypes.length}`);
    console.log(`Target Months: ${this.getTargetMonths().join(', ')}`);
    console.log(`Batch Size: ${this.batchSize} concurrent scrapers`);
    console.log(`Mode: ${this.testMode ? 'TEST (September only)' : 'FULL (12 months)'}`);
    console.log('=' . repeat(50) + '\n');

    this.results.summary.startTime = Date.now();
    
    const batches = this.createBatches(this.roomTypes, this.batchSize);

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(`\n🚀 Starting Batch ${batchIndex + 1}/${batches.length} (${batch.length} rooms)`);
      console.log(`Rooms: ${batch.map(rt => rt.name).join(', ')}`);
      
      await this.scrapeBatch(batch, batchIndex + 1);
      
      // Delay between batches (except for the last batch)
      if (batchIndex < batches.length - 1) {
        console.log(`\n⏳ Waiting ${this.delayBetweenBatches / 1000}s before next batch...`);
        await this.delay(this.delayBetweenBatches);
      }
    }

    this.results.summary.endTime = Date.now();
    this.results.summary.duration = this.results.summary.endTime - this.results.summary.startTime;

    await this.generateSummary();
    return this.results;
  }

  /**
   * Scrape a batch of room types concurrently
   */
  async scrapeBatch(batch, batchNumber) {
    const promises = batch.map(async (roomType, index) => {
      const roomLabel = `Batch ${batchNumber}-${index + 1}`;
      
      try {
        console.log(`  🔄 [${roomLabel}] Starting: ${roomType.name} (DB ID: ${roomType.id})`);
        
        const results = await this.scrapeRoomWithRetry(roomType, roomLabel);
        
        this.results.roomTypes[roomType.name] = {
          id: roomType.id,
          external_id: roomType.external_id,
          months: results.months,
          summary: results.summary,
          totalAvailable: results.summary.totalAvailable,
          databaseSaved: results.databaseSaved || false
        };
        
        this.results.summary.successfulRooms++;
        this.results.summary.totalDatesScraped += results.summary.totalAvailable || 0;
        
        console.log(`  ✅ [${roomLabel}] Completed: ${roomType.name} (${results.summary.overallAvailabilityRate || '0%'}, ${results.summary.totalAvailable || 0} dates saved)`);
        
        return { success: true, roomType, results };
        
      } catch (error) {
        console.error(`  ❌ [${roomLabel}] Failed: ${roomType.name} - ${error.message}`);
        
        this.results.roomTypes[roomType.name] = {
          id: roomType.id,
          external_id: roomType.external_id,
          error: error.message,
          months: {},
          summary: null
        };
        
        this.results.summary.failedRooms++;
        return { success: false, roomType, error: error.message };
      }
    });

    // Wait for all scrapers in this batch to complete
    const batchResults = await Promise.allSettled(promises);
    
    // Log batch summary
    const successful = batchResults.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const failed = batchResults.length - successful;
    console.log(`\n📊 Batch ${batchNumber} Complete: ${successful} successful, ${failed} failed`);
  }

  /**
   * Scrape a single room type with retry logic
   */
  async scrapeRoomWithRetry(roomType, roomLabel) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.maxRetries + 1; attempt++) {
      try {
        return await this.scrapeRoom(roomType);
      } catch (error) {
        lastError = error;
        
        if (attempt <= this.maxRetries) {
          console.log(`    ⚠️  [${roomLabel}] Attempt ${attempt} failed, retrying...`);
          await this.delay(5000); // Wait 5 seconds before retry
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Scrape a single room type and save to database
   */
  async scrapeRoom(roomType) {
    const scraper = new MountainHutScraper(this.createScraperConfig(roomType));
    
    try {
      // Initialize scraper
      await scraper.initialize();
      
      // Select the room type using its name
      await scraper.selectRoomType(roomType.name);
      
      // Scrape availability
      await scraper.scrapeAvailability();
      
      // Get results
      const results = scraper.getResults();
      
      // Extract dates and date range for database
      const availableDates = scraper.extractAvailableDatesForDatabase();
      const dateRange = scraper.getScrapedDateRange();
      
      // Save to database (even if no available dates, to clear unavailable ones)
      await database.upsertAvailableDates(roomType.id, availableDates, dateRange);
      results.databaseSaved = true;
      results.dateRange = dateRange;
      
      return results;
      
    } finally {
      // Always cleanup
      if (scraper && scraper.browser) {
        await scraper.cleanup();
      }
    }
  }

  /**
   * Split array into batches
   */
  createBatches(array, batchSize) {
    const batches = [];
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Delay execution
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate and display final summary
   */
  async generateSummary() {
    console.log('\n' + '='.repeat(70));
    console.log('📈 PARALLEL DATABASE SCRAPING COMPLETE');
    console.log('='.repeat(70));

    console.log(`🏠 Property: ${this.propertyName} (ID: ${this.propertyId})`);
    console.log(`⏱️  Duration: ${this.formatDuration(this.results.summary.duration)}`);
    console.log(`📊 Results: ${this.results.summary.successfulRooms} successful, ${this.results.summary.failedRooms} failed`);
    console.log(`💾 Total dates saved: ${this.results.summary.totalDatesScraped}`);
    
    if (this.results.summary.successfulRooms > 0) {
      // Find best and worst availability
      const successfulRooms = Object.entries(this.results.roomTypes)
        .filter(([_, data]) => !data.error)
        .sort((a, b) => (b[1].totalAvailable || 0) - (a[1].totalAvailable || 0));

      if (successfulRooms.length > 0) {
        const best = successfulRooms[0];
        const worst = successfulRooms[successfulRooms.length - 1];
        
        console.log(`🏆 Most available: ${best[0]} (${best[1].totalAvailable || 0} dates)`);
        console.log(`📉 Least available: ${worst[0]} (${worst[1].totalAvailable || 0} dates)`);
      }
    }

    // Verify database results
    await this.verifyDatabaseResults();
    
    console.log('='.repeat(70));
  }

  /**
   * Verify that data was actually saved to the database
   */
  async verifyDatabaseResults() {
    console.log('\n🔍 Verifying database results...');
    
    try {
      const stats = await database.getScrapingStats(this.propertyId);
      
      console.log(`📊 Database verification:`);
      console.log(`   - Room types with data: ${stats.length}`);
      
      let totalDatesInDb = 0;
      stats.forEach(stat => {
        totalDatesInDb += parseInt(stat.available_dates_count);
        console.log(`   - ${stat.room_type_name}: ${stat.available_dates_count} dates (${stat.earliest_date} to ${stat.latest_date})`);
      });
      
      console.log(`   - Total dates in database: ${totalDatesInDb}`);
      
      if (totalDatesInDb > 0) {
        console.log('   ✅ Database verification successful!');
      } else {
        console.log('   ⚠️  No data found in database');
      }
      
    } catch (error) {
      console.error('   ❌ Database verification failed:', error.message);
    }
  }

  /**
   * Format duration in milliseconds to human readable
   */
  formatDuration(ms) {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }

  /**
   * Close database connection
   */
  async cleanup() {
    if (database) {
      await database.close();
    }
  }
}

// CLI execution
if (require.main === module) {
  async function main() {
    const scraper = new ParallelDatabaseScraper({
      batchSize: 2,        // Start with just 2 concurrent scrapers
      delayBetweenBatches: 15000, // 15 seconds between batches
      maxRetries: 1,       // Reduce retries for testing
      testMode: false      // Full 12-month scraping enabled
    });

    try {
      // Initialize database and load room types
      await scraper.initializeDatabase();
      
      // Run the scraping
      await scraper.scrapeAllRooms();
      
      console.log('\n🎉 Parallel database scraping completed successfully!');
      
    } catch (error) {
      console.error('\n💥 Scraping failed:', error.message);
      console.error('Stack:', error.stack);
    } finally {
      // Always cleanup
      await scraper.cleanup();
      process.exit(0);
    }
  }

  main();
}

module.exports = ParallelDatabaseScraper;