# Hut-Reservation.org Integration Guide

## Overview

The HutReservation scraper uses an API-based approach to fetch availability data for 666+ mountain huts across Austria, Switzerland, Germany, and Italy. It integrates with your existing database to store availability alongside Bentral bookings.

## How It Works

### 1. Authentication Flow
```
1. Load booking wizard page (triggers session creation)
2. Extract XSRF-TOKEN from browser cookies
3. Make authenticated API call using token
4. Parse and store 2+ years of availability data
```

**Key Discovery**: Only the `XSRF-TOKEN` cookie is required - no SESSION cookie needed!

### 2. API Endpoint

```javascript
GET https://www.hut-reservation.org/api/v1/reservation/getHutAvailability
    ?hutId=320
    &step=WIZARD

Headers:
  x-xsrf-token: {extracted_token}
  cookie: XSRF-TOKEN={extracted_token}
  referer: https://www.hut-reservation.org/reservation/book-hut/{hutId}/wizard
```

### 3. Response Structure

The API returns an array of 730+ day objects:

```json
[
  {
    "date": "2025-06-17T00:00:00Z",
    "dateFormatted": "17.06.2025",
    "hutStatus": "OPEN",           // or "CLOSED"
    "freeBeds": 98,                // null if closed
    "freeBedsPerCategory": {
      "1836": 56,                  // Category ID: bed count
      "1837": 42
    },
    "totalSleepingPlaces": 98,
    "percentage": "100%"           // or "CLOSED", "50%", etc.
  }
]
```

## Usage

### Single Hut Scraping

```javascript
const HutReservationScraper = require('./src/providers/HutReservationScraper');

const scraper = new HutReservationScraper({
  headless: true,           // Run in background
  slowMo: 500,              // Delay between actions (ms)
  saveToDatabase: true,     // Save to DB
  saveToFile: true          // Also save JSON file
});

// Scrape single hut
const result = await scraper.scrape(320, {
  categoryIndex: 0          // Which room category (0 = first)
});

console.log(result.results.summary);
// {
//   totalDays: 731,
//   totalAvailable: 477,
//   overallAvailabilityRate: "65.3%",
//   allAvailableDates: [...]
// }
```

### Database Integration

The scraper automatically integrates with your existing database when `saveToDatabase: true`:

```javascript
// During initialization
propertyId = await database.ensureProperty(
  hutName,                    // e.g., "Innsbrucker Hütte"
  bookingUrl,                 // Hut booking page URL
  description                 // Hut details
);

roomTypeId = await database.ensureRoomType(
  propertyId,
  roomTypeName,               // e.g., "Dormitory"
  bedCount                    // e.g., 68
);

// After scraping
await database.saveAvailability(
  propertyId,
  roomTypeId,
  availabilityData            // Parsed availability by date
);
```

## Batch Scraping All Huts

### Step 1: Get List of All Huts

Create a discovery script to fetch all 666 hut IDs:

```javascript
// scripts/discover-hut-reservation-huts.js
const axios = require('axios');

async function discoverAllHuts() {
  const huts = [];

  // The platform likely has an endpoint listing all huts
  // Based on the pattern, try:
  const countries = ['AT', 'CH', 'DE', 'IT'];

  for (const country of countries) {
    const response = await axios.get(
      `https://www.hut-reservation.org/api/v1/huts`,
      { params: { country } }
    );

    huts.push(...response.data);
  }

  return huts;
}
```

### Step 2: Create Batch Scraper

```javascript
// src/core/HutReservationOrchestrator.js
const HutReservationScraper = require('../providers/HutReservationScraper');
const logger = require('../services/logger');
const database = require('../services/database');

class HutReservationOrchestrator {
  constructor(options = {}) {
    this.options = {
      headless: true,
      concurrentBrowsers: 3,      // Run 3 browsers in parallel
      delayBetweenHuts: 10000,    // 10 seconds between huts
      retryAttempts: 3,
      ...options
    };

    this.hutQueue = [];
    this.results = {
      successful: [],
      failed: [],
      skipped: []
    };
  }

  async scrapeAllHuts(hutIds) {
    logger.info(`Starting batch scraping for ${hutIds.length} huts...`);

    await database.initialize();

    // Process huts in batches
    const batchSize = this.options.concurrentBrowsers;

    for (let i = 0; i < hutIds.length; i += batchSize) {
      const batch = hutIds.slice(i, i + batchSize);

      logger.info(`Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(hutIds.length/batchSize)}`);

      // Run batch in parallel
      await Promise.all(
        batch.map(hutId => this.scrapeWithRetry(hutId))
      );

      // Delay between batches
      if (i + batchSize < hutIds.length) {
        await this.delay(this.options.delayBetweenHuts);
      }
    }

    return this.generateReport();
  }

  async scrapeWithRetry(hutId, attempt = 1) {
    try {
      logger.info(`Scraping hut ${hutId} (attempt ${attempt}/${this.options.retryAttempts})`);

      const scraper = new HutReservationScraper({
        headless: this.options.headless,
        slowMo: 300,
        saveToDatabase: true,
        saveToFile: false  // Don't clutter disk
      });

      const result = await scraper.scrape(hutId);

      this.results.successful.push({
        hutId,
        hutName: result.results.hutName,
        totalAvailable: result.results.summary.totalAvailable,
        availabilityRate: result.results.summary.overallAvailabilityRate
      });

      logger.info(`✅ Hut ${hutId} completed: ${result.results.summary.overallAvailabilityRate} availability`);

    } catch (error) {
      logger.error(`Failed to scrape hut ${hutId}:`, error.message);

      // Retry logic
      if (attempt < this.options.retryAttempts) {
        await this.delay(30000); // Wait 30s before retry
        return this.scrapeWithRetry(hutId, attempt + 1);
      }

      this.results.failed.push({
        hutId,
        error: error.message,
        attempts: attempt
      });
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  generateReport() {
    const total = this.results.successful.length + this.results.failed.length;

    return {
      summary: {
        total,
        successful: this.results.successful.length,
        failed: this.results.failed.length,
        successRate: ((this.results.successful.length / total) * 100).toFixed(1) + '%'
      },
      successful: this.results.successful,
      failed: this.results.failed
    };
  }
}

module.exports = HutReservationOrchestrator;
```

### Step 3: Create Runner Script

```javascript
// scripts/scrape-all-hut-reservation.js
const HutReservationOrchestrator = require('../src/core/HutReservationOrchestrator');
const config = require('../config/hut-reservation.config');
const logger = require('../src/services/logger');
const fs = require('fs');

async function main() {
  console.log('========================================');
  console.log('HUT-RESERVATION.ORG BATCH SCRAPER');
  console.log('========================================\n');

  // Load hut IDs (you'll need to discover these first)
  const hutIds = loadHutIds();

  console.log(`Found ${hutIds.length} huts to scrape\n`);

  const orchestrator = new HutReservationOrchestrator({
    headless: true,
    concurrentBrowsers: 3,
    delayBetweenHuts: 10000,
    retryAttempts: 3
  });

  const startTime = Date.now();
  const report = await orchestrator.scrapeAllHuts(hutIds);
  const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

  console.log('\n========================================');
  console.log('BATCH SCRAPING COMPLETE');
  console.log('========================================');
  console.log(`Duration: ${duration} minutes`);
  console.log(`Total: ${report.summary.total}`);
  console.log(`Successful: ${report.summary.successful}`);
  console.log(`Failed: ${report.summary.failed}`);
  console.log(`Success Rate: ${report.summary.successRate}`);

  // Save detailed report
  const reportPath = `./reports/hut-reservation-batch-${Date.now()}.json`;
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📊 Detailed report: ${reportPath}`);

  if (report.failed.length > 0) {
    console.log('\n❌ Failed huts:');
    report.failed.forEach(f => {
      console.log(`  - Hut ${f.hutId}: ${f.error}`);
    });
  }
}

function loadHutIds() {
  // Option 1: Load from pre-discovered file
  if (fs.existsSync('./data/hut-reservation-ids.json')) {
    return JSON.parse(fs.readFileSync('./data/hut-reservation-ids.json'));
  }

  // Option 2: Use priority huts for testing
  return config.priorityHuts;
}

main().catch(console.error);
```

## Database Schema Updates

Ensure your database schema supports multiple platforms:

```sql
-- Add platform field to properties table
ALTER TABLE properties
ADD COLUMN platform VARCHAR(50) DEFAULT 'bentral';

-- Add platform-specific metadata
ALTER TABLE properties
ADD COLUMN platform_id VARCHAR(50),
ADD COLUMN country CHAR(2),
ADD COLUMN altitude VARCHAR(20),
ADD COLUMN coordinates JSONB;

-- Create index for efficient platform queries
CREATE INDEX idx_properties_platform ON properties(platform);
CREATE INDEX idx_properties_country ON properties(country);
```

## Performance Estimates

Based on testing:

- **Single hut**: ~10-15 seconds (including browser startup)
- **Browser startup overhead**: ~5 seconds
- **API call + parsing**: ~1 second
- **Concurrent browsers**: 3 recommended (balance speed/resources)

**Estimated times for 666 huts:**

| Setup | Duration |
|-------|----------|
| Sequential (1 at a time) | ~3 hours |
| Concurrent (3 browsers) | ~1 hour |
| Concurrent (5 browsers) | ~40 minutes |

**Recommendations:**
- Start with 10-20 test huts to validate
- Monitor for rate limiting or blocking
- Run during off-peak hours
- Use `headless: true` for production

## Integration Checklist

- [ ] Test single hut scraping with database integration
- [ ] Verify data appears correctly in existing DB
- [ ] Discover all 666 hut IDs
- [ ] Test batch scraper with 10 huts
- [ ] Set up monitoring/alerting for batch runs
- [ ] Schedule daily/weekly scraping jobs
- [ ] Update frontend to display both Bentral and HutReservation data

## Example: Querying Combined Data

```javascript
// Query all available huts across both platforms
const results = await database.query(`
  SELECT
    p.name,
    p.platform,
    p.country,
    rt.name as room_type,
    a.date,
    a.available_beds
  FROM properties p
  JOIN room_types rt ON p.id = rt.property_id
  JOIN availability a ON rt.id = a.room_type_id
  WHERE
    a.date >= '2026-06-01'
    AND a.date <= '2026-06-30'
    AND a.available_beds > 0
    AND p.country IN ('AT', 'CH')
  ORDER BY a.available_beds DESC
  LIMIT 20
`);

// Results include both Bentral and HutReservation huts!
```

## Cost & Resource Usage

- **Browser instances**: ~150-200 MB RAM each
- **Disk space**: ~5 KB per hut (results files)
- **Network**: ~50 KB per hut (API response)
- **Total for 666 huts**: ~600 MB RAM, ~3 MB disk, ~33 MB bandwidth

## Troubleshooting

### Issue: XSRF-TOKEN not found
**Solution**: Increase wait time after page load
```javascript
await this.page.waitForTimeout(5000); // Increase from 3000
```

### Issue: API returns empty array
**Solution**: The hut may not have availability data loaded. Check hut status on website.

### Issue: High failure rate
**Solution**:
- Reduce concurrent browsers
- Increase delay between batches
- Check for IP rate limiting

### Issue: Database conflicts
**Solution**: Ensure unique constraint on `(property_id, room_type_id, date)`
```sql
CREATE UNIQUE INDEX idx_availability_unique
ON availability(property_id, room_type_id, date);
```

## Next Steps

1. **Discover all huts**: Create script to fetch complete hut list from API
2. **Test batch scraper**: Run with 10-20 huts first
3. **Production deployment**: Schedule daily runs for all 666 huts
4. **Monitoring**: Set up alerts for failures or data anomalies
5. **Frontend integration**: Display combined Bentral + HutReservation data
6. **Analytics**: Track availability trends across platforms

## Support

For issues or questions:
- Check logs in `./logs/hut-reservation.log`
- Review screenshots in `./screenshots/`
- Consult API response in saved JSON files
- Reference implementation: `src/providers/HutReservationScraper.js`
