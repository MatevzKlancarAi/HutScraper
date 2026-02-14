# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Mountain Hut Scraper is a dual-version application for scraping and booking mountain hut availability:

- **v1 (Legacy)**: Node.js application focused on Bentral system scraping
- **v2 (Current)**: Modern Bun.js + TypeScript rewrite with multi-provider architecture, API server, and automated booking

Both versions use Playwright for browser automation to extract accurate calendar-based availability rather than relying on unreliable API responses.

## Key Commands

### V2 (Bun.js + TypeScript) - Primary Development

```bash
# Development server with hot reload
bun run dev

# Production server
bun start

# Database operations
bun run db:generate    # Generate Drizzle schema
bun run db:migrate     # Run migrations
bun run db:studio      # Open Drizzle Studio GUI

# CLI operations
bun run cli:scrape     # Scrape huts
bun run cli:book       # Book huts
bun run cli:list       # List available huts

# Testing
bun test               # Run all tests
bun run test:unit      # Unit tests only
bun run test:integration  # Integration tests
bun run test:bentral   # Test Bentral provider
bun run test:hut-reservation  # Test hut-reservation.org provider

# Code quality
bun run lint           # Lint with Biome
bun run format         # Format code
bun run typecheck      # TypeScript type checking
bun run check          # Lint + typecheck
bun run quality        # Format + check + test

# Docker
bun run docker:build   # Build Docker image
bun run docker:up      # Start containers
bun run docker:down    # Stop containers
bun run docker:logs    # View logs
```

### V1 (Node.js) - Legacy

```bash
# Multi-hut scraping (main feature)
npm run scrape:all     # All huts, 12 months
npm run scrape:test    # All huts, September only
npm run scrape:list    # List available huts

# Single hut scraping
npm start              # Default hut (Triglavski Dom)
npm run scrape         # Same as npm start

# Service operations
npm run service:dev    # Development mode
npm run service:prod   # Production mode
npm run pm2:start      # Start with PM2
npm run pm2:logs       # View PM2 logs

# Prerequisites
npm install
npx playwright install chromium
```

## Architecture Overview

### V2 Architecture (Multi-Provider Pattern)

The v2 codebase uses a plugin-based provider architecture:

```
v2/src/
├── core/                          # Core abstractions
│   ├── providers/
│   │   ├── BaseProvider.ts        # Abstract base for all providers
│   │   └── ProviderRegistry.ts    # Provider registration/lookup
│   ├── scraper/BaseScraper.ts     # Abstract scraper implementation
│   ├── booking/BaseBooker.ts      # Abstract booker implementation
│   ├── browser/BrowserManager.ts  # Shared browser session management
│   └── orchestration/
│       └── MultiHutOrchestrator.ts # Batch scraping with concurrency
├── providers/                     # Provider implementations
│   ├── bentral/
│   │   ├── BentralProvider.ts     # Bentral scraper (Slovenian huts)
│   │   └── BentralBooker.ts       # Bentral booking automation
│   └── hut-reservation/
│       └── HutReservationProvider.ts # hut-reservation.org API (666+ huts)
├── services/
│   ├── database/                  # Database layer
│   │   ├── ScrapePersistence.ts   # Scrape data persistence
│   │   └── repositories/          # Data access objects
│   ├── logger/                    # Pino logging
│   ├── scheduler/                 # Croner-based job scheduling
│   └── captcha/                   # CAPTCHA solving
├── api/
│   ├── server.ts                  # Hono API server
│   └── routes/                    # API endpoints
└── config/                        # Configuration files
```

**Key Design Patterns:**

1. **Provider Pattern**: Each booking system (Bentral, hut-reservation.org) implements `BaseScraper`/`BaseBooker`
2. **Repository Pattern**: Database access through dedicated repository classes
3. **Orchestration**: `MultiHutOrchestrator` handles concurrent scraping with retry logic
4. **Browser Management**: Centralized browser session pooling via `BrowserManager`

### V1 Architecture (Single-Provider Legacy)

```
src/
├── MountainHutScraper.js          # Single-hut scraper class
├── multiHutScraper.js             # Multi-hut orchestration
├── multiHutCli.js                 # CLI entry point
├── MicrogrammBookingBot.js        # Booking automation
├── services/
│   ├── database.js                # PostgreSQL with retry logic
│   ├── logger.js                  # Winston logging
│   └── captchaSolver.js           # CAPTCHA solving
└── server/                        # Express API server
    ├── index.js
    └── routes/
```

## Critical Implementation Details

### Availability Detection Strategy

Both versions solve the same problem: booking APIs return pricing data even for unavailable dates, making API-only approaches unreliable.

**Solution:**
1. Load booking calendar UI directly (iframe for Bentral, page for hut-reservation.org)
2. Analyze pre-rendered HTML before JavaScript modifications
3. Use CSS class logic or API responses for availability

**Bentral CSS Logic:**
- Available: Has `"day"` class WITHOUT `"unavail"`, `"disabled"`, `"old"`, or `"new"` classes
- Excludes dates with `title="Zasedeno"` (occupied in Slovenian)

**Hut-Reservation.org Logic:**
- Uses authenticated API calls to `/api/hutInfo` and `/api/availability`
- Requires XSRF token extraction from page load
- Direct API approach (more reliable than CSS scraping)

### Database Schema

Both versions use PostgreSQL with the `availability` schema:

```sql
-- Properties table
properties (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  location TEXT,
  booking_system TEXT,  -- 'bentral' | 'hut-reservation' | 'microgramm'
  external_id TEXT,      -- Provider-specific ID (hutID for hut-reservation)
  is_active BOOLEAN
)

-- Room types per property
room_types (
  id SERIAL PRIMARY KEY,
  property_id INTEGER REFERENCES properties(id),
  name TEXT NOT NULL,
  capacity INTEGER,
  external_id TEXT,      -- Provider-specific ID (categoryID for hut-reservation)
  bed_type TEXT,
  room_category TEXT
)

-- Available dates with check-in/out capabilities
available_dates (
  id SERIAL PRIMARY KEY,
  property_id INTEGER REFERENCES properties(id),
  room_type_id INTEGER REFERENCES room_types(id),
  date DATE NOT NULL,
  can_checkin BOOLEAN,
  can_checkout BOOLEAN,
  scraped_at TIMESTAMP,
  UNIQUE(property_id, room_type_id, date)
)
```

### Provider System (V2 Only)

**Adding a New Provider:**

1. Create provider directory: `v2/src/providers/your-provider/`
2. Extend `BaseScraper` or `BaseBooker`:
   ```typescript
   export class YourProvider extends BaseScraper {
     metadata: ProviderMetadata = {
       id: 'your-provider',
       name: 'Your Booking System',
       version: '1.0.0',
       type: 'scraper',
       capabilities: { ... }
     };

     async initialize() { /* Setup browser, auth */ }
     async cleanup() { /* Close browser */ }
     async scrape(request: ScrapeRequest): Promise<ScrapeResult> { /* Scraping logic */ }
   }
   ```
3. Register in `ProviderRegistry`
4. Add configuration to `v2/src/config/providers/`

### Concurrency & Rate Limiting

**V1 (multiHutScraper.js):**
- Configurable concurrency via `--concurrency` flag (default: 2)
- Delays between huts (`--delay-huts`, default: 5000ms)
- Delays between room types (`--delay-rooms`, default: 2000ms)

**V2 (MultiHutOrchestrator):**
- Default concurrency: 3 browsers
- Provider-specific rate limits defined in metadata
- Exponential backoff retry logic (10 attempts)
- Smart batch scheduling with configurable delays

### Database Race Conditions

**Problem:** Concurrent scrapers may conflict on `available_dates` inserts.

**Solution (V1):** Retry logic with exponential backoff + jitter (100ms - 1600ms+) in `services/database.js`

**Solution (V2):**
- Transaction-based upserts via `ScrapePersistence`
- Smart date range deletion (only clears dates within scraped range)
- Manual ID generation to avoid sequence contention

### CAPTCHA Handling

Both versions include CAPTCHA solving for booking flows:

**V1:** `src/services/captchaSolver.js` - Text-based CAPTCHA solver
**V2:** `v2/src/services/captcha/CaptchaSolver.ts` - Enhanced with image analysis

Used in `MicrogrammBookingBot.js` and `BentralBooker.ts` for automated bookings.

## Environment Configuration

Key environment variables (see `.env.example`):

```bash
# Database
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=mountain_huts
DATABASE_USER=postgres
DATABASE_PASSWORD=your_password

# API Server (v2)
PORT=3000
NODE_ENV=production
SCHEDULER_ENABLED=true

# Logging
LOG_LEVEL=info

# Browser (optional)
HEADLESS=true
```

## Development Workflow

### Working on V2 (Recommended)

1. **Setup:**
   ```bash
   cd v2
   bun install
   bun run db:migrate
   ```

2. **Development:**
   ```bash
   bun run dev  # Start API server with hot reload
   ```

3. **Testing:**
   ```bash
   bun run test:bentral          # Test Bentral provider
   bun run test:hut-reservation  # Test hut-reservation provider
   ```

4. **Code Quality:**
   ```bash
   bun run quality  # Format + lint + typecheck + test
   ```

### Working on V1 (Legacy Maintenance)

1. **Setup:**
   ```bash
   npm install
   npx playwright install chromium
   ```

2. **Testing:**
   ```bash
   npm run scrape:test  # Quick test (September only)
   ```

3. **Debugging:**
   - Set `headless: false` in `config/scraper.config.js`
   - Set `slowMo: 1000` to watch browser actions
   - Screenshots saved to `screenshots/` directory

## Common Tasks

### Add Support for New Bentral Hut

**V1:**
1. Find iframe URL on hut's website
2. Extract room type IDs from dropdown
3. Add to `config/all-huts-room-types.json`

**V2:**
1. Add hut config to `v2/src/config/providers/bentral-huts.ts`
2. Register in provider configuration
3. Test with `bun run test:bentral`

### Add Support for Hut-Reservation.org Hut

**V2 Only:**
1. Find hut's `hutID` from hut-reservation.org
2. Add to `v2/src/providers/hut-reservation/hut-data.ts`
3. Provider automatically discovers room types via API

### Debug Browser Issues

1. **V1:** Set `headless: false` in `config/scraper.config.js`
2. **V2:** Set `HEADLESS=false` in `.env` and check `v2/src/config/scraper.ts`
3. Use `slowMo` to slow down actions for debugging
4. Check `screenshots/` directory for error screenshots

### Schedule Automatic Scraping

**V1:** Add cron job:
```bash
0 6 * * * cd /path/to/scraper && npm run scrape:all >> /var/log/hut-scraper.log 2>&1
```

**V2:** Use built-in scheduler (set `SCHEDULER_ENABLED=true`):
```typescript
// Edit v2/src/services/scheduler/jobs/ScrapeJob.ts
// Default: Daily at 6 AM and 6 PM
```

## Performance Benchmarks

**V1 Multi-Hut Scraper:**
- Test mode (Sep only): 2-3 minutes for 89 room types
- Full mode (12 months): 15-25 minutes for ~12,000 dates
- Optimal concurrency: 2-3 browsers

**V2 Multi-Provider:**
- Bentral: ~1-2 seconds per room type
- Hut-reservation.org: ~5-10 seconds per hut (all room types at once)
- Recommended concurrency: 3 browsers

## Troubleshooting

### Browser Installation Issues
```bash
# V1
npx playwright install chromium

# V2
cd v2 && bunx playwright install chromium
```

### Database Connection Failures
- Check PostgreSQL is running
- Verify `.env` credentials
- Ensure `availability` schema exists
- V1: Check `search_path` includes `availability` schema

### Slow Scraping
- Reduce `--concurrency` flag (V1)
- Reduce `concurrency` in orchestrator options (V2)
- Increase delays between requests

### Race Condition Errors
- Both versions handle automatically with retry logic
- V1: Check logs for retry attempts in `services/database.js`
- V2: Check `ScrapePersistence.ts` transaction handling

### CAPTCHA Solving Failures
- Check `CaptchaSolver` configuration
- Verify CAPTCHA image visibility in screenshots
- May need to update text recognition logic
