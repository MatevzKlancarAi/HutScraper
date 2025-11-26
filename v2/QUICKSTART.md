# Quick Start Guide

## Installation & Setup

### 1. Install Bun (if not already installed)
```bash
curl -fsSL https://bun.sh/install | bash
```

### 2. Navigate to v2 directory
```bash
cd v2
```

### 3. Install dependencies
```bash
bun install
```

### 4. Set up environment
```bash
cp .env.example .env
nano .env  # Edit with your database credentials
```

Required environment variables:
```bash
DATABASE_HOST=159.69.183.35  # Your PostgreSQL host
DATABASE_PORT=5432
DATABASE_NAME=world_discovery
DATABASE_USER=availability_activities
DATABASE_PASSWORD=your_password_here
```

## Verify Installation

### Test TypeScript compilation
```bash
bun run type-check
```

Expected output: No errors

### Test environment validation
```bash
bun --eval "
import { env } from './src/config/env.ts';
console.log('✅ Environment validated');
console.log('Database:', env.DATABASE_NAME);
console.log('Port:', env.PORT);
"
```

### Test database connection
```bash
bun --eval "
import { database } from './src/services/database/index.ts';

console.log('Testing database connection...');
const connected = await database.testConnection();

if (connected) {
  console.log('✅ Database connected successfully!');

  // Test a simple query
  const count = await database.properties.count();
  console.log(\`Found \${count} properties in database\`);
} else {
  console.log('❌ Database connection failed');
}

await database.close();
"
```

### Test logger
```bash
bun --eval "
import { logger, log } from './src/services/logger/index.ts';

logger.info('Logger test');
logger.debug({ foo: 'bar' }, 'Debug message');
logger.warn('Warning message');

log.scraper({
  provider: 'test',
  hutName: 'Test Hut',
  action: 'Testing logger',
  duration: 1234,
});

console.log('✅ Logger working');
"
```

### Test utilities
```bash
bun --eval "
import { sleep, formatDate, retry } from './src/utils/index.ts';

console.log('Testing utilities...');

// Test date formatting
const now = new Date();
console.log('Formatted date:', formatDate(now));

// Test sleep
console.log('Sleeping 1 second...');
await sleep(1000);
console.log('Done!');

// Test retry
let attempts = 0;
const result = await retry(
  async () => {
    attempts++;
    console.log(\`Attempt \${attempts}\`);
    if (attempts < 3) throw new Error('Retry test');
    return 'Success!';
  },
  { maxAttempts: 5, delay: 500, backoff: 1 }
);
console.log('Retry result:', result);

console.log('✅ Utilities working');
"
```

## Test Database Operations

### Create a test property
```bash
bun --eval "
import { database } from './src/services/database/index.ts';

const property = await database.properties.ensure({
  name: 'Test Hut - V2',
  url: 'https://example.com',
  bookingSystem: 'test',
  description: 'Test property from v2 migration',
});

console.log('✅ Property created/found:', property);

// Create a room type
const roomType = await database.roomTypes.ensure({
  propertyId: property.id,
  name: 'Test Room',
  capacity: 2,
});

console.log('✅ Room type created/found:', roomType);

// Add availability
await database.availability.upsertBatch([
  {
    propertyId: property.id,
    roomTypeId: roomType.id,
    date: new Date('2025-06-01'),
    canCheckin: true,
    canCheckout: true,
  },
  {
    propertyId: property.id,
    roomTypeId: roomType.id,
    date: new Date('2025-06-02'),
    canCheckin: true,
    canCheckout: true,
  },
]);

console.log('✅ Availability added');

// Query availability
const dates = await database.availability.findByRoomTypeAndDateRange(
  roomType.id,
  new Date('2025-06-01'),
  new Date('2025-06-30')
);

console.log(\`✅ Found \${dates.length} available dates\`);

await database.close();
"
```

### Query existing data
```bash
bun --eval "
import { database } from './src/services/database/index.ts';

// List all properties
const properties = await database.properties.findAllActive();
console.log(\`Found \${properties.length} active properties:\`);
properties.slice(0, 5).forEach(p => {
  console.log(\`  - \${p.name} (\${p.bookingSystem})\`);
});

// Show properties by booking system
const bentral = await database.properties.findByBookingSystem('bentral');
console.log(\`\nBentral properties: \${bentral.length}\`);

const hutReservation = await database.properties.findByBookingSystem('hut-reservation.org');
console.log(\`Hut-reservation.org properties: \${hutReservation.length}\`);

await database.close();
"
```

## Run Unit Tests (when available)

```bash
# Run all tests
bun test

# Run with watch mode
bun test --watch

# Run with coverage
bun test --coverage
```

## Next Development Steps

### 1. Create a simple test scraper
Create `v2/test-scraper.ts`:
```typescript
import { BaseScraper } from './src/core/scraper/BaseScraper.ts';
import { logger } from './src/services/logger/index.ts';
import type { ScrapeRequest, ScrapeResult } from './src/types/index.ts';

const config = {
  name: 'test-scraper',
  type: 'scraper' as const,
  enabled: true,
  settings: {},
};

class TestScraper extends BaseScraper {
  metadata = {
    id: 'test',
    name: 'Test Scraper',
    version: '1.0.0',
    type: 'scraper' as const,
    capabilities: {
      scraping: {
        supportsDateRange: true,
        supportsRoomTypes: true,
        maxConcurrency: 1,
      },
    },
  };

  async initialize() {
    this.log.info('Initializing test scraper');
  }

  async scrape(request: ScrapeRequest): Promise<ScrapeResult> {
    const start = Date.now();

    this.logScrape(request.propertyName, 'Starting scrape');

    // Simulate scraping
    await new Promise(resolve => setTimeout(resolve, 1000));

    return {
      propertyId: request.propertyId,
      propertyName: request.propertyName,
      roomTypes: [
        {
          roomTypeName: 'Test Room',
          dates: [
            {
              date: new Date('2025-06-01'),
              status: 'available',
              canCheckin: true,
              canCheckout: true,
            },
          ],
        },
      ],
      metadata: this.createMetadata(start, true),
    };
  }

  async cleanup() {
    this.log.info('Cleaning up test scraper');
  }

  async healthCheck() {
    return true;
  }
}

// Test it
const scraper = new TestScraper(config, logger);
await scraper.initialize();

const result = await scraper.scrape({
  propertyId: 1,
  propertyName: 'Test Hut',
  url: 'https://example.com',
  dateRange: {
    start: new Date('2025-06-01'),
    end: new Date('2025-06-30'),
  },
});

console.log('Scrape result:', result);

await scraper.cleanup();
```

Run it:
```bash
bun test-scraper.ts
```

## Troubleshooting

### Database connection fails
- Verify credentials in `.env`
- Check if PostgreSQL is running
- Test connection: `psql -h HOST -U USER -d DATABASE`

### TypeScript errors
- Run `bun run type-check` for detailed errors
- Check path aliases in `tsconfig.json` and `bunfig.toml` match

### Import errors
- Bun requires `.ts` extensions in imports
- Use path aliases: `@services/`, `@config/`, etc.

## Resources

- [Bun Documentation](https://bun.sh/docs)
- [Drizzle ORM](https://orm.drizzle.team/)
- [Pino Logger](https://getpino.io/)
- [Zod Validation](https://zod.dev/)

## Getting Help

1. Check [PROGRESS.md](./PROGRESS.md) for current status
2. Review [README.md](./README.md) for architecture overview
3. Examine existing code in `src/` for examples

---

✅ **All tests passing?** You're ready to start migrating providers!
