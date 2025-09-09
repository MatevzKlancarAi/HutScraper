# Mountain Hut Scraper Service 🏔️

A production-ready Node.js service that scrapes availability data from mountain huts using the Bentral booking system. Features scheduled operations, database storage, retry logic, and comprehensive monitoring.

## Features ✨

- **🕐 Scheduled Operations**: Automatic scraping 2x daily (6 AM & 6 PM)
- **🏔️ Multi-Hut Support**: Extensible architecture for multiple mountain huts  
- **📊 Database Integration**: Direct PostgreSQL storage with optimized schema
- **🔄 Retry Logic**: Exponential backoff and circuit breaker patterns
- **🏥 Health Monitoring**: Built-in health checks and performance metrics
- **🚀 Production Ready**: PM2 process management and structured logging
- **⚡ Zero-Downtime**: Graceful shutdowns and hot reload capabilities
- **🎯 Accurate Detection**: CSS-based availability detection (not unreliable APIs)

## Quick Start 🚀

### Prerequisites

- Node.js 16+
- PostgreSQL 12+
- PM2 (optional, but recommended for production)

### 1. Setup Environment

```bash
# Clone and install dependencies
git clone <repository-url>
cd mountain-hut-scraper
npm install

# Run automated setup
npm run setup
```

### 2. Configure Database

```bash
# Create PostgreSQL database
createdb mountain_huts

# Run schema migration
psql mountain_huts < simplified-availability-schema.sql

# Update .env with your database credentials
cp .env.example .env
# Edit .env file with your settings
```

### 3. Start Service

```bash
# Development mode (with console logging)
npm run service:dev

# Production mode with PM2
npm run pm2:start

# Check service status
npm run health
```

## 📋 Service Commands

### Multi-Hut Scraper (MAIN FEATURE)
```bash
npm run scrape:all         # Scrape all huts (12 months)
npm run scrape:all:test    # Scrape all huts (September only)
npm run scrape:list        # List available huts
```

### Legacy Single-Hut Scraper
```bash
npm start                  # Run single hut scraper (Triglavski Dom)
npm run scrape             # Same as npm start
npm run scrape:double-room # Scrape specific room type
```

### Service Operations
```bash
npm run service:dev        # Start in development mode
npm run service:prod       # Start in production mode
npm run pm2:start          # Start with PM2
npm run pm2:stop           # Stop PM2 service
npm run pm2:restart        # Restart PM2 service
npm run pm2:logs           # View logs
```

### Health & Monitoring
```bash
npm run health             # Check service health
npm run status             # Detailed service status  
npm run stats              # Scraping statistics
npm run manual-scrape      # Trigger manual scraping
```

## 🏔️ Multi-Hut Scraper

The project now includes a powerful multi-hut scraper that can scrape **10 mountain huts** with **89 room types** across 12 months. This is the main feature for production use.

### Quick Start

```bash
# Scrape all huts (September only) - RECOMMENDED for testing
npm run scrape:all:test

# Scrape all huts (12 months) - Full production run
npm run scrape:all

# List all available huts and room counts
npm run scrape:list
```

### Available Mountain Huts

The scraper supports these 10 Slovenian mountain huts:

| Hut Name | Room Types | Capacity Range |
|----------|------------|----------------|
| **Triglavski Dom** | 15 types | 1-30 people |
| **Aljažev dom v Vratih** | 5 types | 2-8 people |
| **Koča pod Bogatinom** | 9 types | 2-12 people |
| **Vodnikov dom** | 11 types | 1-8 people |
| **Planinska koča na Uskovnici** | 10 types | 2-14 people |
| **Dom Planika pod Triglavom** | 7 types | 2-26 people |
| **Koča na Doliču** | 8 types | 2-15 people |
| **Koča na Golici** | 6 types | 2-8 people |
| **Dom na Komni** | 7 types | 2-24 people |
| **Koča pri Triglavskih jezerih** | 11 types | 2-16 people |

**Total: 89 room types across 10 properties**

### CLI Usage

```bash
# Basic usage
node src/multiHutCli.js [options]

# Alternative entry point
node scrape-all-huts.js [options]
```

### CLI Options

| Option | Description | Default |
|--------|-------------|---------|
| `--test` | Test mode: scrape September 2025 only | `false` |
| `--full` | Full mode: scrape 12 months (Sep 2025 - Aug 2026) | `false` |
| `--huts <names>` | Comma-separated list of specific huts | All huts |
| `--concurrency <n>` | Max concurrent browsers (1-5 recommended) | `2` |
| `--delay-huts <ms>` | Delay between huts in milliseconds | `5000` |
| `--delay-rooms <ms>` | Delay between room types in milliseconds | `2000` |
| `--list-huts` | List all available huts and exit | `false` |
| `--help` | Show help message | `false` |

### Usage Examples

```bash
# Test mode - all huts, September only (RECOMMENDED first run)
node src/multiHutCli.js --test

# Full production run - all huts, 12 months
node src/multiHutCli.js --full

# Scrape specific huts
node src/multiHutCli.js --huts "Triglavski Dom" --test
node src/multiHutCli.js --huts "Vodnikov dom,Koča na Doliču" --full

# High performance settings
node src/multiHutCli.js --full --concurrency 3 --delay-huts 2000

# List available huts
node src/multiHutCli.js --list-huts
```

### Performance & Reliability

#### **🚀 Optimized for Speed**
- **Concurrent Processing**: Up to 3 browsers run simultaneously
- **Smart Delays**: Configurable delays prevent server overload
- **Batch Database Operations**: Efficient bulk inserts with upserts

#### **🔒 100% Reliable**
- **Race Condition Handling**: Advanced retry logic with exponential backoff
- **10 Retry Attempts**: Handles even extreme database contention
- **Transaction Safety**: Complete rollback on failure
- **Error Recovery**: Automatic retry with jittered delays (100ms - 1600ms+)

#### **💾 Database Features**
- **Smart Date Range Deletion**: Only clears dates within scraped range
- **ON CONFLICT Upserts**: Handles duplicate data gracefully  
- **Manual ID Generation**: Avoids sequence permission issues
- **Comprehensive Logging**: Detailed operation tracking

### Typical Performance

| Mode | Duration | Room Types | Available Dates | Concurrency |
|------|----------|------------|------------------|-------------|
| **Test Mode** | 2-3 minutes | 89 types | ~1,000 dates | 3 browsers |
| **Full Mode** | 15-25 minutes | 89 types | ~12,000 dates | 3 browsers |

### Output & Results

The scraper stores results directly in PostgreSQL with this structure:

```sql
-- Properties table
properties (id, name, slug, location, booking_system, is_active)

-- Room types per property  
room_types (id, property_id, name, capacity, external_id, bed_type, room_category)

-- Available dates with check-in/out capabilities
available_dates (id, property_id, room_type_id, date, can_checkin, can_checkout, scraped_at)
```

Sample completion summary:
```
🎉 Multi-Hut Scraping Complete!
Duration: 5 minutes
Huts processed: 10
Room types scraped: 89  
Total available dates found: 12,847
Errors: 0
```

### Troubleshooting

#### **Common Issues**

1. **Race condition errors**: The retry logic handles these automatically
2. **Slow performance**: Reduce concurrency (`--concurrency 1`)
3. **Database connection issues**: Check `.env` configuration
4. **Missing huts**: Run `--list-huts` to see available options

#### **Optimal Settings**

```bash
# Balanced performance/reliability (RECOMMENDED)
node src/multiHutCli.js --full --concurrency 3

# Conservative (slower but minimal server load)  
node src/multiHutCli.js --full --concurrency 1 --delay-huts 10000

# Aggressive (faster but higher server load)
node src/multiHutCli.js --full --concurrency 3 --delay-huts 2000 --delay-rooms 1000
```

#### **Production Deployment**

For scheduled production runs:
```bash
# Add to cron for daily runs
0 6 * * * cd /path/to/scraper && npm run scrape:all >> /var/log/hut-scraper.log 2>&1
```

## Configuration ⚙️

The scraper is configured via `config/scraper.config.js`:

```javascript
module.exports = {
  target: {
    name: "Triglavski Dom",
    baseUrl: "https://triglavskidom.si/",
  },

  bentral: {
    iframeUrl: "https://www.bentral.com/service/embed/booking.html?...",
    roomTypes: {
      "Dvoposteljna soba - zakonska postelja": "5f5441324e446b4d",
    },
  },

  scraper: {
    targetMonths: ["September 2025", "October 2025"],
    browser: {
      headless: false, // Set to true for production
      slowMo: 1000,
    },
  },
};
```

## How It Works 🔍

### The Problem We Solved

Mountain hut booking systems often show visual availability (colored calendars) that doesn't match their API responses. The API typically returns pricing data even for unavailable dates, leading to incorrect availability reports.

### Our Solution

1. **Direct Calendar Scraping**: We scrape the pre-rendered HTML calendar instead of relying on APIs
2. **CSS Class Analysis**: We identify availability based on specific CSS classes:

   - `"day"` = Potentially available
   - `"day unavail"` = Unavailable
   - `"day disabled"` = Disabled
   - `title="Zasedeno"` = Occupied

3. **Visual Verification**: Screenshots are taken to verify results match what users see

### Availability Logic

A date is considered **available** if:

- ✅ Has `"day"` CSS class
- ❌ Does NOT have `"unavail"` class
- ❌ Does NOT have `"disabled"` class
- ❌ Does NOT have `"old"` class (past dates)
- ❌ Does NOT have `"new"` class (next month dates)
- ❌ Title does NOT contain "Zasedeno" (occupied)

## Project Structure 📁

```
mountain-hut-scraper/
├── src/
│   ├── multiHutCli.js              # 🏔️ Multi-hut scraper (MAIN FEATURE)
│   ├── multiHutScraper.js          # Multi-hut scraper class
│   ├── MountainHutScraper.js       # Single hut scraper class  
│   ├── index.js                    # Legacy CLI entry point
│   └── services/
│       └── database.js             # Database operations with retry logic
├── config/
│   └── scraper.config.js           # Single hut configuration
├── scrape-all-huts.js              # Alternative multi-hut entry point
├── simplified-availability-schema.sql # Database schema
├── results/                        # JSON output files (legacy)
├── screenshots/                    # Screenshot verification
├── package.json
└── README.md
```

## Output Format 📊

The scraper generates detailed JSON results:

```json
{
  "scrapingDate": "2025-08-27T14:05:12.351Z",
  "targetSite": "Triglavski Dom",
  "roomType": "Dvoposteljna soba - zakonska postelja",
  "months": {
    "September 2025": {
      "totalDays": 30,
      "availableDays": 0,
      "availabilityRate": "0.0%",
      "availableDates": [],
      "unavailableDates": [1, 2, 3, ...]
    },
    "October 2025": {
      "totalDays": 31,
      "availableDays": 10,
      "availabilityRate": "32.3%",
      "availableDates": [1, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      "unavailableDates": [2, 3, 13, 14, ...]
    }
  },
  "summary": {
    "totalDays": 61,
    "totalAvailable": 10,
    "overallAvailabilityRate": "16.4%",
    "allAvailableDates": ["Oct 1", "Oct 4", "Oct 5", ...]
  }
}
```

## Real-World Example 🏔️

When we tested this scraper on Triglavski Dom (a popular Slovenian mountain hut):

- **September 2025**: 0% availability (completely booked)
- **October 2025**: 32% availability (10 days available)
- **Best dates**: Early October (1st, 4th-12th)

This matches exactly what users see in the booking interface!

## API vs Calendar Comparison 🔄

| Method                     | September Availability | October Availability | Accuracy     |
| -------------------------- | ---------------------- | -------------------- | ------------ |
| **Direct API Calls**       | 100% (❌ Wrong)        | 100% (❌ Wrong)      | Inaccurate   |
| **Calendar HTML Scraping** | 0% (✅ Correct)        | 32% (✅ Correct)     | **Accurate** |

## Extending to Other Mountain Huts 🏕️

To scrape other mountain huts using Bentral:

1. Find the Bentral iframe URL on their website
2. Identify room type IDs (inspect the dropdown)
3. Update `config/scraper.config.js`
4. Run the scraper!

Example sites that could work:

- Other Slovenian mountain huts
- Alpine huts using Bentral system
- Hotels with similar booking interfaces

## Development 👨‍💻

### For Laravel Integration

The scraping logic can be easily ported to Laravel:

```php
// Available = has "day" class but NOT "unavail"
$available = $element->hasClass('day') &&
             !$element->hasClass('unavail') &&
             !$element->hasClass('disabled') &&
             !$element->hasClass('old') &&
             !$element->hasClass('new') &&
             !str_contains($element->getAttribute('title'), 'Zasedeno');
```

### Adding New Features

- **Multiple Room Types**: Add room IDs to config
- **Date Ranges**: Modify `targetMonths` in config
- **Different Huts**: Update iframe URL and selectors
- **Scheduling**: Add cron job support
- **Notifications**: Add email/SMS alerts for availability

## Troubleshooting 🔧

### Common Issues

1. **Browser doesn't open**: Make sure Playwright browsers are installed

   ```bash
   npx playwright install chromium
   ```

2. **Navigation fails**: Check if the target months are too far in the future

3. **No results found**: Verify the iframe URL and room type ID are correct

4. **Screenshots show errors**: Check if the website structure has changed

### Debug Mode

Set `headless: false` in config to watch the browser in action.

## License 📄

MIT License - feel free to use this for your own mountain hut booking needs!

## Contributing 🤝

Found a bug or want to add a feature? Pull requests welcome!

## Acknowledgments 🙏

- Built for the mountain community 🏔️
- Inspired by the need for accurate booking data
- Tested on real Slovenian mountain huts

---

**Happy hiking!** 🥾
