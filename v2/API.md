# Mountain Hut Scraper API Documentation

## Overview

The Mountain Hut Scraper v2 provides a REST API for scraping availability data and automating bookings for mountain huts.

## Base URL

```
http://localhost:3000
```

## Endpoints

### Health Check

**GET** `/health`

Returns the health status of the API server.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-11-23T10:00:00.000Z",
  "uptime": 1234.56
}
```

---

## Scraping Endpoints

### Start Scrape Job

**POST** `/scrape`

Starts an asynchronous scraping job for one or more mountain huts.

**Request Body:**
```json
{
  "provider": "hut-reservation",  // Optional: "hut-reservation" | "bentral"
  "hutIds": [648, 710],            // Optional: specific hut IDs to scrape
  "startDate": "2025-12-01",       // Optional: start date (ISO format)
  "endDate": "2026-02-28",         // Optional: end date (ISO format)
  "concurrency": 3                 // Optional: concurrent huts (1-10, default: 3)
}
```

**Response:**
```json
{
  "jobId": "scrape-1234567890-abc123",
  "message": "Scraping job started",
  "statusUrl": "/scrape/status/scrape-1234567890-abc123"
}
```

### Get Scrape Job Status

**GET** `/scrape/status/:jobId`

Returns the status of a scraping job.

**Response:**
```json
{
  "id": "scrape-1234567890-abc123",
  "status": "completed",  // "pending" | "running" | "completed" | "failed"
  "startedAt": "2025-11-23T10:00:00.000Z",
  "completedAt": "2025-11-23T10:05:30.000Z",
  "progress": {
    "total": 4,
    "completed": 4,
    "failed": 0,
    "successRate": 100
  },
  "report": {
    "summary": {
      "total": 4,
      "successful": 4,
      "failed": 0,
      "skipped": 0,
      "successRate": "100%",
      "duration": "5m 30s",
      "avgTimePerHut": "1m 22s"
    }
  }
}
```

### List Recent Scrape Jobs

**GET** `/scrape/jobs?limit=10`

Returns a list of recent scraping jobs.

---

## Booking Endpoints

### Start Booking Job

**POST** `/book`

Starts an asynchronous booking job for a mountain hut.

**Request Body:**
```json
{
  "provider": "bentral",
  "hutId": "123",
  "roomTypeId": "456",
  "checkIn": "2025-12-20",
  "checkOut": "2025-12-22",
  "guestInfo": {
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "phone": "+1234567890",
    "country": "SI"
  },
  "paymentMethod": "ponudbo",  // Optional: "ponudbo" | "inquiry"
  "dryRun": true                // Optional: test without actual booking
}
```

**Response:**
```json
{
  "jobId": "book-1234567890-xyz789",
  "message": "Booking job started",
  "statusUrl": "/book/status/book-1234567890-xyz789"
}
```

### Get Booking Job Status

**GET** `/book/status/:jobId`

Returns the status of a booking job.

**Response:**
```json
{
  "id": "book-1234567890-xyz789",
  "status": "completed",
  "startedAt": "2025-11-23T10:00:00.000Z",
  "completedAt": "2025-11-23T10:02:15.000Z",
  "provider": "bentral",
  "hutId": "123",
  "result": {
    "sessionId": "book-1234567890-xyz789",
    "status": "success",
    "confirmationNumber": "CONF-12345",
    "screenshots": ["step1.png", "step2.png", "step3.png"]
  }
}
```

### List Recent Booking Jobs

**GET** `/book/jobs?limit=10`

---

## Properties Endpoints

### List Properties

**GET** `/properties?bookingSystem=bentral&limit=100&offset=0`

Returns a list of properties (mountain huts).

**Response:**
```json
{
  "properties": [
    {
      "id": 1,
      "name": "Sulzenauhütte",
      "bookingSystem": "hut-reservation",
      "externalId": "648",
      "metadata": {},
      "active": true,
      "createdAt": "2025-11-23T10:00:00.000Z"
    }
  ],
  "total": 1,
  "limit": 100,
  "offset": 0
}
```

### Get Property by ID

**GET** `/properties/:id`

### Get Room Types for Property

**GET** `/properties/:id/room-types`

**Response:**
```json
{
  "roomTypes": [
    {
      "id": 1,
      "propertyId": 1,
      "name": "Double Room",
      "externalId": "456",
      "capacity": 2,
      "metadata": {}
    }
  ],
  "total": 1
}
```

### Get Availability

**GET** `/properties/:id/availability?roomTypeId=1&startDate=2025-12-01&endDate=2025-12-31`

**Response:**
```json
{
  "propertyId": 1,
  "roomTypeId": "1",
  "startDate": "2025-12-01",
  "endDate": "2025-12-31",
  "availableDates": [
    {
      "id": 1,
      "propertyId": 1,
      "roomTypeId": 1,
      "date": "2025-12-05",
      "canCheckin": true,
      "canCheckout": true,
      "scrapedAt": "2025-11-23T10:00:00.000Z"
    }
  ],
  "total": 30
}
```

### Search Properties

**GET** `/properties/search/:query`

---

## Scheduler Endpoints

### Get Scheduler Status

**GET** `/scheduler/status`

Returns the status of the job scheduler and all registered jobs.

**Response:**
```json
{
  "isRunning": true,
  "jobs": [
    {
      "name": "daily-scrape",
      "schedule": "0 6,18 * * *",
      "enabled": true,
      "status": "idle",
      "lastRun": "2025-11-23T06:00:00.000Z",
      "nextRun": "2025-11-23T18:00:00.000Z",
      "lastError": null
    }
  ]
}
```

### Get Specific Job Status

**GET** `/scheduler/jobs/:jobName`

### Manually Trigger Job

**POST** `/scheduler/jobs/:jobName/trigger`

Manually triggers a scheduled job to run immediately.

**Response:**
```json
{
  "message": "Job daily-scrape triggered successfully",
  "jobName": "daily-scrape"
}
```

### Pause Job

**POST** `/scheduler/jobs/:jobName/pause`

### Resume Job

**POST** `/scheduler/jobs/:jobName/resume`

---

## Error Responses

All endpoints may return error responses in the following format:

**Validation Error (400):**
```json
{
  "error": "Validation error",
  "details": [
    {
      "path": "guestInfo.email",
      "message": "Invalid email address"
    }
  ]
}
```

**Not Found (404):**
```json
{
  "error": "Job not found"
}
```

**Rate Limit (429):**
```json
{
  "error": "Rate limit exceeded",
  "retryAfter": 30
}
```

**Internal Server Error (500):**
```json
{
  "error": "Internal server error",
  "message": "Database connection failed"
}
```

---

## Configuration

### Environment Variables

See `.env.example` for all available configuration options:

- **Server**: `PORT`, `API_RATE_LIMIT_REQUESTS`
- **Database**: `DATABASE_HOST`, `DATABASE_PORT`, etc.
- **Scraper**: `SCRAPER_HEADLESS`, `SCRAPER_MAX_CONCURRENCY`
- **Scheduler**: `SCHEDULER_ENABLED`, `SCHEDULER_CRON_SCRAPING`, `SCHEDULER_TIMEZONE`
- **Booking**: `BOOKING_HEADLESS`, `BOOKING_DRY_RUN`

### Starting the Server

```bash
# Development (with auto-reload)
bun run dev

# Production
bun run start
```

---

## Scheduler Configuration

The default daily scrape runs at:
- **6:00 AM** (morning scrape)
- **6:00 PM** (evening scrape)

Configure via `SCHEDULER_CRON_SCRAPING` environment variable using cron syntax.

Example: `0 6,18 * * *` (every day at 6 AM and 6 PM)
