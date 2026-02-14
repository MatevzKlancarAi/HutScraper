# Mountain Hut Scraper

A multi-provider availability scraper and booking automation system for mountain huts across the Alps. Supports 678 huts in 5 countries through the Bentral and hut-reservation.org booking systems.

**Coverage:** 12 Slovenian Bentral huts (102 room types) + 666 huts via hut-reservation.org (Austria, Switzerland, Germany, Italy, Slovenia)

## Tech Stack

- **Runtime:** Bun.js 1.0+
- **Language:** TypeScript 5.x
- **API Framework:** Hono
- **Browser Automation:** Playwright
- **Database:** PostgreSQL + Drizzle ORM
- **Scheduling:** Croner
- **Logging:** Pino

## Features

- **Multi-provider architecture** - Plugin-based system supporting Bentral and hut-reservation.org
- **REST API** - Full-featured Hono API for scraping, booking, and querying availability
- **Automated scheduling** - Built-in Croner scheduler with configurable job management
- **Booking automation** - Automated booking with CAPTCHA solving for Bentral huts
- **Concurrent scraping** - Orchestrated batch scraping with retry logic and rate limiting
- **Docker support** - Production-ready containerization

## Quick Start

### Prerequisites

- Bun 1.0+
- PostgreSQL 12+
- Chromium (installed via Playwright)

### Installation

```bash
cd v2
bun install
bunx playwright install chromium
```

### Environment Setup

```bash
cp .env.example .env
# Edit .env with your database credentials
```

### Database Setup

```bash
bun run db:migrate
```

### Run

```bash
# Development server with hot reload
bun run dev

# Production server
bun start
```

## API Reference

Base URL: `http://localhost:3000`

### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Service health check with uptime |

### Scraping

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/scrape` | Start a scraping job |
| GET | `/scrape/status/:jobId` | Get job status and progress |
| GET | `/scrape/jobs` | List recent scraping jobs |

**POST /scrape body:**
```json
{
  "provider": "hut-reservation",
  "hutIds": [123, 456],
  "startDate": "2025-06-01",
  "endDate": "2025-09-30",
  "concurrency": 3
}
```

### Booking

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/book` | Start a booking job |
| GET | `/book/status/:jobId` | Get booking status |
| GET | `/book/jobs` | List recent booking jobs |

**POST /book body:**
```json
{
  "provider": "bentral",
  "hutId": "5f4451784d415f4e",
  "roomTypeId": "5f5441324e446b4d",
  "checkIn": "2025-07-15",
  "checkOut": "2025-07-17",
  "guestInfo": {
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "phone": "+38641123456"
  },
  "dryRun": true
}
```

### Properties

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/properties` | List all properties (supports `?bookingSystem=bentral`) |
| GET | `/properties/:id` | Get property details |
| GET | `/properties/:id/room-types` | Get room types for property |
| GET | `/properties/:id/availability` | Get availability (requires `startDate` and `endDate`) |
| GET | `/properties/search/:query` | Search properties by name |

### Scheduler

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/scheduler/status` | Get scheduler and job status |
| GET | `/scheduler/jobs/:jobName` | Get specific job details |
| POST | `/scheduler/jobs/:jobName/trigger` | Manually trigger a job |
| POST | `/scheduler/jobs/:jobName/pause` | Pause a job |
| POST | `/scheduler/jobs/:jobName/resume` | Resume a job |

## Supported Huts

### Bentral (Slovenia) - 12 Huts

| Hut | Room Types |
|-----|------------|
| Triglavski dom na Kredarici | 15 |
| Koča pri Triglavskih jezerih | 11 |
| Vodnikov dom | 11 |
| Planinska koča na Uskovnici | 10 |
| Koča pod Bogatinom | 9 |
| Koča na Doliču | 8 |
| Dom na Komni | 7 |
| Dom Planika pod Triglavom | 7 |
| Planinski dom Krnska jezera | 7 |
| Koča na Golici | 6 |
| Prešernova koča na Stolu | 6 |
| Aljažev dom v Vratih | 5 |

**Total: 102 room types**

### hut-reservation.org - 666 Huts

| Country | Huts |
|---------|------|
| Austria | ~400 |
| Switzerland | ~150 |
| Germany | ~70 |
| Italy | ~30 |
| Slovenia | ~16 |

Huts are automatically discovered via the hut-reservation.org API. Room categories are fetched dynamically during scraping.

## Commands Reference

### Development

```bash
bun run dev          # Start with hot reload
bun start            # Production server
bun run typecheck    # TypeScript type checking
bun run lint         # Lint with Biome
bun run format       # Format code
bun run check        # Lint + typecheck
bun run quality      # Format + check + test
```

### Database

```bash
bun run db:generate  # Generate Drizzle schema
bun run db:migrate   # Run migrations
bun run db:studio    # Open Drizzle Studio GUI
bun run db:push      # Push schema changes
```

### Testing

```bash
bun test                     # Run all tests
bun run test:unit            # Unit tests
bun run test:integration     # Integration tests
bun run test:bentral         # Test Bentral provider
bun run test:hut-reservation # Test hut-reservation provider
bun run test:orchestrator    # Test orchestrator
```

### CLI

```bash
bun run cli:scrape   # Scrape huts
bun run cli:book     # Book huts
bun run cli:list     # List available huts
```

### Docker

```bash
bun run docker:build # Build Docker image
bun run docker:up    # Start containers
bun run docker:down  # Stop containers
bun run docker:logs  # View logs
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_HOST` | PostgreSQL host | `localhost` |
| `DATABASE_PORT` | PostgreSQL port | `5432` |
| `DATABASE_NAME` | Database name | `mountain_huts` |
| `DATABASE_USER` | Database user | `postgres` |
| `DATABASE_PASSWORD` | Database password | - |
| `PORT` | API server port | `3000` |
| `NODE_ENV` | Environment | `development` |
| `SCHEDULER_ENABLED` | Enable job scheduler | `false` |
| `LOG_LEVEL` | Logging level | `info` |
| `HEADLESS` | Run browser headless | `true` |

## Architecture

### Provider Pattern

Each booking system implements the `BaseScraper` or `BaseBooker` abstract class:

```
v2/src/
├── core/
│   ├── providers/          # Provider abstractions
│   ├── scraper/            # BaseScraper interface
│   ├── booking/            # BaseBooker interface
│   └── orchestration/      # Multi-hut batch processing
├── providers/
│   ├── bentral/            # Bentral implementation
│   └── hut-reservation/    # hut-reservation.org implementation
├── services/
│   ├── database/           # Drizzle ORM + repositories
│   ├── scheduler/          # Croner job scheduling
│   └── captcha/            # CAPTCHA solving
└── api/
    ├── server.ts           # Hono server
    └── routes/             # API endpoints
```

### Database Schema

```sql
-- Properties (huts)
properties (id, name, slug, location, booking_system, external_id, is_active)

-- Room types per property
room_types (id, property_id, name, capacity, external_id, bed_type, room_category)

-- Available dates
available_dates (id, property_id, room_type_id, date, can_checkin, can_checkout, scraped_at)
```

### Availability Detection

Booking APIs often return pricing data for unavailable dates. This scraper solves this by:

1. **Bentral:** Analyzing pre-rendered calendar HTML for CSS classes (`day`, `unavail`, `disabled`)
2. **hut-reservation.org:** Using authenticated API calls to `/api/availability` with XSRF tokens

## Legacy (v1)

The `src/` directory contains legacy Node.js code for Bentral-only scraping. This is maintained for backwards compatibility but all new development occurs in `v2/`. For legacy usage, see the v1 commands:

```bash
npm install
npm run scrape:all     # Scrape all Bentral huts
npm run scrape:list    # List huts
```

## License

MIT
