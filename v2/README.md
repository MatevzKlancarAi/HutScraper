# Mountain Hut Scraper v2 - Bun.js + TypeScript

This is the new implementation of the Mountain Hut Scraper using **Bun.js**, **TypeScript**, **Hono**, and **Drizzle ORM**.

## 🚀 Quick Start

### Prerequisites

- [Bun](https://bun.sh) >= 1.0.0
- PostgreSQL >= 12
- Playwright browsers

### Installation

```bash
# Install dependencies
bun install

# Install Playwright browsers
bunx playwright install chromium

# Copy environment file
cp .env.example .env

# Edit .env with your database credentials
nano .env

# Run database migrations
bun run db:migrate
```

### Development

```bash
# Start development server (with hot reload)
bun run dev

# Run tests
bun test

# Run tests in watch mode
bun test --watch

# Type checking
bun run type-check
```

### Running Scrapers

```bash
# List available huts
bun run cli:list

# Scrape specific hut
bun cli:scrape --hut "Triglavski Dom" --months 3

# Scrape all huts
bun cli:scrape --all
```

### Running Booking Bot

```bash
# Interactive booking
bun run cli:book

# Dry run (test without submitting)
bun cli:book --hut "Triglavski Dom" --arrival "01.06.2025" --departure "02.06.2025" --dry-run
```

## 📁 Project Structure

```
v2/
├── src/
│   ├── core/           # Core abstractions (BaseProvider, BaseScraper, etc.)
│   ├── providers/      # Provider implementations (Bentral, HutReservation, etc.)
│   ├── services/       # Business services (database, logger, scheduler)
│   ├── api/            # Hono API server
│   ├── cli/            # CLI tools
│   ├── config/         # Configuration files
│   ├── utils/          # Shared utilities
│   └── types/          # Shared TypeScript types
├── tests/              # Test suite
├── docker/             # Docker configuration
└── docs/               # Documentation
```

## 🏗️ Architecture

### Provider System

All scrapers and bookers extend from base classes:

- `BaseProvider` - Abstract base for all providers
- `BaseScraper` - Abstract base for scraping functionality
- `BaseBooker` - Abstract base for booking functionality

### Type Safety

Everything is fully typed with TypeScript strict mode. Zod is used for runtime validation of API requests and environment variables.

### Database

Drizzle ORM with PostgreSQL. Schema mirrors the existing database structure for compatibility.

## 📚 Documentation

- [API Documentation](./docs/api/)
- [Adding New Providers](./docs/providers/)
- [Development Guide](./docs/development.md)

## 🧪 Testing

```bash
# Run all tests
bun test

# Unit tests only
bun test:unit

# Integration tests
bun test:integration

# E2E tests
bun test:e2e

# Coverage report
bun test:coverage
```

## 🐳 Docker

```bash
# Build image
bun run docker:build

# Start services
bun run docker:up

# View logs
bun run docker:logs

# Stop services
bun run docker:down
```

## 📝 Migration from v1

This v2 implementation maintains compatibility with the existing database. You can run both versions side-by-side during migration.

See [Migration Guide](./docs/migration.md) for details.

## 🔧 Configuration

All configuration is via environment variables. See [.env.example](./.env.example) for all options.

## 📄 License

MIT
