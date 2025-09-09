# Mountain Hut Scraper - Repository Guide

This document provides a comprehensive overview of the repository structure, how the system works, and guidelines for maintenance and cleanup.

## 🎯 Project Overview

The Mountain Hut Scraper is a Node.js application that extracts availability data from Bentral booking systems used by mountain huts. It uses Playwright to automate browser interactions and stores data in PostgreSQL for frontend applications.

### Key Features
- **Smart availability detection** via CSS class analysis (not API calls)
- **Parallel processing** for 3x faster scraping
- **Incremental database updates** preserving existing data
- **Date range management** for accurate twice-daily updates
- **Prisma ORM integration** alongside raw SQL for flexibility

### Technology Stack
- **Runtime**: Node.js 16+
- **Browser Automation**: Playwright (Chromium)
- **Database**: PostgreSQL with Prisma ORM
- **Process Management**: PM2
- **Logging**: Winston with daily rotation
- **Environment**: dotenv for configuration

---

## 📁 Repository Structure

### Core Application Files

```
src/
├── MountainHutScraper.js          # Main scraper class (CORE)
├── parallelDatabaseScraper.js     # Production parallel scraper (ACTIVE)
├── services/
│   ├── database.js                # Database service with raw SQL (ACTIVE)
│   ├── logger.js                  # Winston logging service (ACTIVE)
│   ├── scheduler.js               # Cron job scheduler (FUTURE)
│   ├── retryHandler.js            # Retry logic utilities (UTILITY)
│   └── hutManager.js              # Multi-hut management (FUTURE)
├── index.js                       # CLI entry point (LEGACY)
├── service.js                     # REST API service (DEVELOPMENT)
└── [test files]                   # Development/testing only
```

### Configuration & Schema

```
config/
└── scraper.config.js              # Main configuration (CORE)

prisma/
└── schema.prisma                  # Database schema (CORE)

scripts/
└── [various test scripts]         # Testing/development only
```

### Generated & Results

```
results/                           # Scraper output files (AUTO-GENERATED)
screenshots/                       # Debug screenshots (AUTO-GENERATED)  
src/generated/prisma/              # Prisma client (AUTO-GENERATED)
```

---

## 🔧 Core Components

### 1. MountainHutScraper.js (Main Engine)

**Purpose**: Core scraping logic for single room types
**Status**: ✅ ACTIVE - Foundation for all scrapers

```javascript
// Key methods:
- initialize()              // Set up browser and database
- selectRoomType()         // Choose room from dropdown
- scrapeAvailability()     // Extract calendar data
- getScrapedDateRange()    // Calculate date range for updates
- extractAvailableDatesForDatabase() // Format data for DB
- saveResults()            // Save with date range logic
```

**Usage**:
```bash
node src/index.js "Room Name"        # Single room scraping
```

### 2. parallelDatabaseScraper.js (Production Scraper)

**Purpose**: Fast parallel scraping with database integration
**Status**: ✅ ACTIVE - Primary production scraper

```javascript
// Key features:
- Batch processing (2 concurrent browsers)
- Database room type loading
- Smart date range updates
- Progress tracking and retry logic
- Database verification
```

**Usage**:
```bash
node src/parallelDatabaseScraper.js  # All 15 rooms, Sept only (test mode)
# Change testMode: false for 12 months
```

### 3. Database Service (services/database.js)

**Purpose**: PostgreSQL operations with smart date range management
**Status**: ✅ ACTIVE - Critical component

```javascript
// Key methods:
- upsertAvailableDates(roomTypeId, dates, dateRange)
  // Smart update: only affects scraped date range
- ensureProperty() / ensureRoomType() 
  // Property/room management
- getScrapingStats()
  // Data verification and monitoring
```

**Database Schema** (Prisma):
```prisma
model properties {
  id         Int    @id @default(autoincrement())
  name       String
  slug       String @unique
  // ... location, timestamps
}

model room_types {
  id          Int    @id @default(autoincrement())
  property_id Int
  external_id String  # Bentral room ID
  name        String
  capacity    Int
  // ... features, timestamps
}

model available_dates {
  id           BigInt   @id @default(autoincrement())
  property_id  Int
  room_type_id Int
  date         DateTime @db.Date
  can_checkin  Boolean
  can_checkout Boolean
  scraped_at   DateTime @default(now())
  // ... relationships
}
```

---

## 🔄 Data Flow

### 1. Scraping Process

```mermaid
Browser → Bentral iframe → Calendar HTML → CSS Analysis → Available Dates → Database
```

1. **Browser Setup**: Playwright launches Chromium
2. **Navigation**: Direct access to Bentral booking iframe
3. **Room Selection**: Use external_id from database to select room
4. **Month Navigation**: Click through calendar months
5. **Data Extraction**: Analyze CSS classes for availability:
   - Available: Has `"day"` class WITHOUT `"unavail"`, `"disabled"`, `"old"`, `"new"`
   - Partial availability: Check `title` attributes for check-in/out restrictions
6. **Database Save**: Use date range to update only scraped months

### 2. Database Updates (Smart Range Logic)

**Key Innovation**: Only update dates within scraped range

```sql
-- OLD (problematic): DELETE all dates
DELETE FROM available_dates WHERE room_type_id = $1

-- NEW (smart): DELETE only scraped range  
DELETE FROM available_dates 
WHERE room_type_id = $1 
AND date BETWEEN $2 AND $3  -- Only scraped months
```

**Benefits**:
- ✅ Future months preserved when scraping single month
- ✅ Unavailable dates removed from scraped range
- ✅ Perfect for twice-daily cron jobs
- ✅ No data loss during incremental updates

### 3. Data Formats

**Scraper Output**:
```javascript
{
  date: "2025-09-04",
  can_checkin: false,  // Partial availability
  can_checkout: true   // Can checkout but not checkin
}
```

**Database Storage**:
```sql
room_type_id | date       | can_checkin | can_checkout | scraped_at
1           | 2025-09-04 | false       | true         | 2025-01-04 13:29:51
```

---

## 🚀 Execution Methods

### Production Scripts (Use These)

#### 1. Parallel Database Scraper (Recommended)
```bash
node src/parallelDatabaseScraper.js
```
- **Purpose**: Fast scraping with database storage
- **Features**: 15 rooms, parallel processing, date range updates
- **Configuration**: Edit `testMode: false` for full 12 months
- **Time**: ~2-3 minutes (September), ~15-20 minutes (12 months)

#### 2. Single Room Scraping
```bash
node src/index.js "Dvoposteljna soba - zakonska postelja"
```
- **Purpose**: Test specific room type
- **Use case**: Debugging, verification

### NPM Scripts

```bash
# Production
npm start                    # Single room (legacy)
npm run scrape:parallel     # Old parallel scraper (file-based)

# Database operations  
npm run db:seed             # Database seeder (legacy)

# Service management
npm run service             # REST API server
npm run pm2:start           # Background service
```

### Test Scripts (Development Only)

```bash
# Testing date range logic
node src/testDateRange.js

# Testing 3 rooms only
node src/testParallelDB.js

# Database tests
node scripts/test-database-scraper.js
```

---

## 🗂️ File Classification

### ✅ Keep (Active/Essential)

**Core Components**:
- `src/MountainHutScraper.js` - Main scraper engine
- `src/parallelDatabaseScraper.js` - Production scraper
- `src/services/database.js` - Database operations
- `src/services/logger.js` - Logging
- `config/scraper.config.js` - Configuration
- `prisma/schema.prisma` - Database schema

**Entry Points**:
- `src/index.js` - CLI interface
- `package.json` - Dependencies and scripts
- `.env` - Environment variables

**Documentation**:
- `CLAUDE.md` - Development instructions
- `SIMPLIFIED-SYSTEM.md` - Architecture overview

### 🧹 Clean Up Candidates

**Legacy Scrapers**:
- `src/scrapeFullYear.js` - Sequential scraper (slow)
- `src/parallelScraper.js` - File-based parallel scraper  
- `src/dataTransformer.js` - JSON to SQL transformer

**Development/Testing**:
- `src/testDateRange.js` - Date range testing
- `src/testParallelDB.js` - 3-room test
- `scripts/test-*.js` - Various test scripts
- `scripts/populate-*.js` - Database population scripts

**Utilities** (Evaluate):
- `src/identifyRoomTypes.js` - Room type discovery
- `src/viewAvailability.js` - Data viewing utility
- `src/createGoogleSheetsExport.js` - Google Sheets export

**Service Layer** (Future):
- `src/service.js` - REST API (under development)
- `src/services/scheduler.js` - Cron management  
- `src/services/hutManager.js` - Multi-property support
- `src/services/retryHandler.js` - Retry utilities

### 🗑️ Safe to Delete

**Auto-generated**:
- `results/` contents - Scraper output files
- `screenshots/` contents - Debug images
- `node_modules/` - Dependencies

---

## ⏰ Cron Job Setup

### Recommended Cron Script

Use `parallelDatabaseScraper.js` with these modifications:

```javascript
// For cron jobs, modify constructor:
const scraper = new ParallelDatabaseScraper({
  batchSize: 2,           // Gentle on server
  delayBetweenBatches: 15000,  // 15 second delays
  maxRetries: 2,          // Handle temporary failures
  testMode: false         // Full 12 months
});
```

### Cron Schedule (Twice Daily)

```bash
# /etc/crontab or crontab -e
0 8,20 * * * cd /path/to/HutScraper && node src/parallelDatabaseScraper.js >> logs/cron.log 2>&1
```

**Schedule**: 8 AM and 8 PM daily
**Logging**: Append to `logs/cron.log`
**Error Handling**: Built-in retries and database verification

### Monitoring

```bash
# Check last successful run
tail -n 20 logs/cron.log

# Database verification
psql mountain_huts -c "
SELECT 
  rt.name,
  COUNT(*) as available_dates,
  MAX(ad.scraped_at) as last_updated
FROM room_types rt 
LEFT JOIN available_dates ad ON rt.id = ad.room_type_id
WHERE rt.property_id = 1  -- Triglavski Dom
GROUP BY rt.id, rt.name
ORDER BY rt.name;
"
```

---

## 🔄 Migration Path

### Current State
- ✅ Working parallel scraper with database integration
- ✅ Smart date range updates  
- ✅ Prisma schema defined
- 🔄 Mix of raw SQL (database.js) and Prisma potential

### Future Improvements

#### 1. Migrate to Full Prisma
Replace raw SQL in `database.js` with Prisma ORM:

```javascript
// Current: Raw SQL
await client.query('DELETE FROM availability.available_dates WHERE room_type_id = $1', [roomTypeId]);

// Future: Prisma
await prisma.available_dates.deleteMany({
  where: {
    room_type_id: roomTypeId,
    date: {
      gte: dateRange.minDate,
      lte: dateRange.maxDate
    }
  }
});
```

#### 2. Consolidate Scripts
- Keep: `parallelDatabaseScraper.js` as main production script
- Remove: Legacy scrapers and test files
- Simplify: Single entry point with command-line flags

#### 3. Service Architecture  
- Move cron management to `services/scheduler.js`
- Add API endpoints in `service.js`
- Implement proper logging and monitoring

---

## 📊 Performance Metrics

### Current Performance
- **Single room**: ~45 seconds (1 month)
- **All 15 rooms (parallel)**: ~2-3 minutes (1 month)
- **Full year scraping**: ~15-20 minutes (12 months)

### Database Operations
- **Smart date range update**: ~500ms per room type
- **Full table replacement**: ~2-3 seconds per room type  
- **Database verification**: ~100ms

### Resource Usage
- **Memory**: ~200MB per browser instance
- **CPU**: Moderate (parallel processing)
- **Network**: Light (direct iframe access)

---

## 🔍 Debugging Guide

### Common Issues

#### 1. Room Type Not Found
```bash
# Check room types in database
psql mountain_huts -c "SELECT id, name, external_id FROM room_types WHERE property_id = 1;"

# Re-populate room types if needed
node scripts/populate-room-types.js
```

#### 2. Calendar Navigation Fails  
```javascript
// Enable debugging in MountainHutScraper.js
browser: {
  headless: false,  // See browser
  slowMo: 2000     // Slow down actions  
}
```

#### 3. Database Connection Issues
```bash
# Test database connection
node -e "
const db = require('./src/services/database');
db.initialize().then(() => console.log('DB OK')).catch(console.error);
"
```

### Development Commands

```bash
# Generate Prisma client
npx prisma generate

# View database schema
npx prisma studio

# Database migrations (if schema changes)
npx prisma migrate dev
```

---

## ✨ Summary

This repository has evolved from a simple scraper to a robust parallel data collection system with smart database management. The key innovations are:

1. **Smart date range updates** - Only modify scraped date ranges
2. **Parallel processing** - 3x faster than sequential scraping  
3. **Database integration** - Direct save to PostgreSQL with verification
4. **Cron-ready architecture** - Perfect for twice-daily updates

### Production Readiness Checklist

- ✅ Parallel scraping with error handling
- ✅ Smart database updates (preserve existing data)
- ✅ Date range management for incremental updates  
- ✅ Logging and monitoring capabilities
- ✅ Database verification after each run
- ✅ Configuration management
- ⏳ Clean up legacy files
- ⏳ Set up cron jobs
- ⏳ Add comprehensive error alerting

The system is ready for production use with `parallelDatabaseScraper.js` as the primary scraping tool.