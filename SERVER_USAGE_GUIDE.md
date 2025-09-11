# Mountain Hut Scraper - Server Usage Guide

This comprehensive guide covers day-to-day operations of the Mountain Hut Scraper server. For deployment instructions, see [SERVER_DEPLOYMENT.md](SERVER_DEPLOYMENT.md).

## 🚀 Quick Start

### Starting the Server
```bash
# Development mode
npm run start:dev

# Production mode
npm start

# Using PM2 (recommended for production)
npm run pm2:start

# Using Docker
npm run docker:up
```

### Basic Health Check
```bash
# Quick health check
npm run health

# Or direct curl
curl http://localhost:3000/health

# Detailed health with database info
curl "http://localhost:3000/health?detailed=true"
```

### Stopping the Server
```bash
# If using PM2
npm run pm2:stop

# If using Docker
npm run docker:down

# Kill processes on port 3000
lsof -ti:3000 | xargs kill
```

## 📡 API Reference

### Health Endpoints

#### GET /health
Basic server health check.
```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2025-09-10T11:00:00.000Z",
  "uptime": "2h 30m 15s",
  "database": "connected"
}
```

#### GET /health?detailed=true
Detailed health information including database stats.
```bash
curl "http://localhost:3000/health?detailed=true"
```

#### GET /health/ready
Kubernetes-style readiness probe.

#### GET /health/live
Kubernetes-style liveness probe.

#### GET /health/metrics
Basic performance metrics.

### Scraping Operations

#### GET /api/v1/scraping/status
Get current scraping status.
```bash
curl http://localhost:3000/api/v1/scraping/status
```

For detailed status with database statistics:
```bash
curl "http://localhost:3000/api/v1/scraping/status?detailed=true"
```

Response:
```json
{
  "isRunning": false,
  "lastRun": "2025-09-10T11:26:31.501Z",
  "lastResult": {
    "success": true,
    "hutsProcessed": 1,
    "roomTypesProcessed": 7,
    "totalAvailableDates": 75,
    "duration": 29200
  },
  "runCount": 5,
  "nextScheduled": "2025-09-10T18:00:00.000Z"
}
```

#### POST /api/v1/scraping/trigger
Manually trigger a scraping operation. **Requires API key authentication** if `API_KEY` environment variable is set.

Basic scraping (test mode):
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_api_key_here" \
  -d '{"testMode": true}' \
  http://localhost:3000/api/v1/scraping/trigger
```

Full production scraping:
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_api_key_here" \
  -d '{"testMode": false}' \
  http://localhost:3000/api/v1/scraping/trigger
```

Scraping specific huts:
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_api_key_here" \
  -d '{
    "testMode": true,
    "targetHuts": ["Dom na Komni", "Koča na Doliču"]
  }' \
  http://localhost:3000/api/v1/scraping/trigger
```

Advanced options:
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_api_key_here" \
  -d '{
    "testMode": false,
    "maxConcurrency": 2,
    "delayBetweenHuts": 5000,
    "delayBetweenRooms": 2000,
    "maxRetries": 3
  }' \
  http://localhost:3000/api/v1/scraping/trigger
```

**Parameters:**
- `testMode` (boolean): If true, only scrapes September 2025. If false, scrapes 12 months ahead.
- `targetHuts` (array): Specific hut names to scrape. If null, scrapes all active huts.
- `maxConcurrency` (number): Number of concurrent browsers (default: 2).
- `delayBetweenHuts` (number): Delay between huts in milliseconds (default: 5000).
- `delayBetweenRooms` (number): Delay between room types in milliseconds (default: 2000).
- `maxRetries` (number): Number of retry attempts on failure (default: 3).

Response:
```json
{
  "message": "Scraping job completed successfully",
  "result": {
    "hutsProcessed": 1,
    "roomTypesProcessed": 7,
    "totalAvailableDates": 75,
    "errors": [],
    "success": true,
    "duration": 29200
  },
  "triggeredAt": "2025-09-10T11:26:31.501Z"
}
```

#### GET /api/v1/scraping/properties
Get list of all properties and their room types.
```bash
curl http://localhost:3000/api/v1/scraping/properties
```

#### GET /api/v1/scraping/history
Get scraping statistics and history.
```bash
curl http://localhost:3000/api/v1/scraping/history
```

Filter by property:
```bash
curl "http://localhost:3000/api/v1/scraping/history?property=Dom+na+Komni"
```

### Availability Data Queries

#### GET /api/v1/availability
Query availability data with various filters.

Basic query:
```bash
curl http://localhost:3000/api/v1/availability
```

Filter by property:
```bash
curl "http://localhost:3000/api/v1/availability?property_id=1"
```

Filter by date range:
```bash
curl "http://localhost:3000/api/v1/availability?start_date=2025-09-01&end_date=2025-09-30"
```

Filter by availability status:
```bash
# Only fully available dates
curl "http://localhost:3000/api/v1/availability?availability_status=fully_available"

# Only partially available dates
curl "http://localhost:3000/api/v1/availability?availability_status=partially_available"

# Only unavailable dates
curl "http://localhost:3000/api/v1/availability?availability_status=unavailable"
```

Filter by room capacity:
```bash
curl "http://localhost:3000/api/v1/availability?min_capacity=2&max_capacity=4"
```

Pagination:
```bash
curl "http://localhost:3000/api/v1/availability?limit=50&offset=0"
```

#### GET /api/v1/availability/search
Advanced search with multiple filters.
```bash
curl -X GET \
  -G \
  -d "property_name=Komni" \
  -d "location=Triglav" \
  -d "min_capacity=2" \
  -d "availability_status=fully_available" \
  "http://localhost:3000/api/v1/availability/search"
```

#### GET /api/v1/availability/summary
Get availability summary statistics.
```bash
curl http://localhost:3000/api/v1/availability/summary
```

Filter summary by date range:
```bash
curl "http://localhost:3000/api/v1/availability/summary?start_date=2025-09-01&end_date=2025-12-31"
```

#### GET /api/v1/availability/properties/:id
Get detailed availability for a specific property.
```bash
curl http://localhost:3000/api/v1/availability/properties/1
```

## 🔄 Scraping Operations Guide

### Test Mode vs Production Mode

**Test Mode** (`testMode: true`):
- Scrapes only September 2025
- Faster execution (~30 seconds for single hut)
- Good for testing and debugging
- Recommended for development

**Production Mode** (`testMode: false`):
- Scrapes 12 months ahead (September 2025 - August 2026)
- Takes longer (~10-15 minutes for single hut)
- Complete data collection
- Used for scheduled production runs

### Monitoring Scraping Progress

1. **Check if scraping is running:**
```bash
curl http://localhost:3000/api/v1/scraping/status | jq '.isRunning'
```

2. **View last scraping results:**
```bash
curl http://localhost:3000/api/v1/scraping/status | jq '.lastResult'
```

3. **Monitor server logs:**
```bash
# If using PM2
npm run pm2:logs

# If using Docker
npm run docker:logs

# Direct log files
tail -f logs/combined.log
```

### Handling Scraping Errors

Common error scenarios and solutions:

#### Database Pool Errors
If you see "Called end on pool more than once" errors, this has been fixed in the latest version. The database connection pool is now properly managed in server mode.

#### Browser Timeout Errors
If scraping fails with browser timeouts:
```bash
# Increase delays between operations
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "testMode": true,
    "delayBetweenHuts": 10000,
    "delayBetweenRooms": 5000
  }' \
  http://localhost:3000/api/v1/scraping/trigger
```

#### Playwright Dependencies Missing
If you get browser launch errors:
```bash
npx playwright install chromium
npx playwright install-deps
```

#### Rate Limiting or Blocking
If requests are being blocked:
```bash
# Reduce concurrency and increase delays
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "testMode": true,
    "maxConcurrency": 1,
    "delayBetweenHuts": 15000,
    "delayBetweenRooms": 8000
  }' \
  http://localhost:3000/api/v1/scraping/trigger
```

### Retry Logic

The scraper has built-in retry logic:
- Automatic retries for failed scraping attempts
- Configurable retry count with `maxRetries` parameter
- Exponential backoff between retries (5 minutes default)
- Failure notifications (if configured)

## ⏰ Scheduled Jobs

### Default Schedule
- **Morning**: 6:00 AM daily (`SCRAPE_CRON_MORNING=0 6 * * *`)
- **Evening**: 6:00 PM daily (`SCRAPE_CRON_EVENING=0 18 * * *`)

### Checking Next Scheduled Run
```bash
curl http://localhost:3000/api/v1/scraping/status | jq '.nextScheduled'
```

### Configuring Schedules
Schedules are configured via environment variables in `.env`:

```env
ENABLE_SCHEDULED_SCRAPING=true
SCRAPE_CRON_MORNING=0 6 * * *    # 6 AM daily
SCRAPE_CRON_EVENING=0 18 * * *   # 6 PM daily
```

**Cron format:** `minute hour day-of-month month day-of-week`

Examples:
```env
# Every 6 hours
SCRAPE_CRON_MORNING=0 */6 * * *

# Weekdays only at 8 AM
SCRAPE_CRON_MORNING=0 8 * * 1-5

# Twice daily (8 AM and 8 PM)
SCRAPE_CRON_MORNING=0 8 * * *
SCRAPE_CRON_EVENING=0 20 * * *
```

### Disabling Scheduled Jobs
```env
ENABLE_SCHEDULED_SCRAPING=false
```

## 🔍 Monitoring & Debugging

### Log Levels
Configure logging with `LOG_LEVEL` environment variable:
```env
LOG_LEVEL=info    # info, warn, error, debug
```

### Log Files
- **Combined logs**: `logs/combined.log`
- **Error logs**: `logs/error.log`
- **PM2 logs**: `~/.pm2/logs/mountain-hut-scraper-*.log`

### Database Connection Monitoring
```bash
# Check database connectivity
curl "http://localhost:3000/health?detailed=true" | jq '.database'

# View connection pool status
curl http://localhost:3000/health/metrics
```

### Performance Monitoring
```bash
# Server metrics
curl http://localhost:3000/health/metrics

# Detailed status with statistics
curl "http://localhost:3000/api/v1/scraping/status?detailed=true"
```

## 🏗️ Production Best Practices

### Running Multiple Scrapes
✅ **Good**: Wait for current scrape to complete before starting another
```bash
# Check if running first
if [ "$(curl -s http://localhost:3000/api/v1/scraping/status | jq -r '.isRunning')" = "false" ]; then
  curl -X POST ... /api/v1/scraping/trigger
fi
```

❌ **Bad**: Starting multiple scrapes simultaneously (will be rejected)

### Database Connection Management
The database connection pool is automatically managed:
- ✅ Connection pool stays open during server operation
- ✅ Multiple scrapes can run sequentially without issues
- ✅ Graceful shutdown closes connections properly

### Memory Management
For large scraping operations:
```env
# Increase Node.js memory limit if needed
NODE_OPTIONS="--max-old-space-size=4096"
```

### Error Recovery
The server includes automatic error recovery:
- Failed individual huts don't stop the entire job
- Database connection issues are handled gracefully
- Browser crashes are recovered automatically
- Partial results are saved even if some huts fail

## 🔐 Security

### API Key Authentication
Protected endpoints require an API key:
```bash
# Set in environment
API_KEY=your_secure_api_key_here

# Use in requests
curl -H "X-API-Key: your_secure_api_key_here" \
     -X POST http://localhost:3000/api/v1/scraping/trigger
```

### Protected Endpoints
- `POST /api/v1/scraping/trigger`
- `POST /api/v1/scraping/schedule`
- `GET /api/v1/scraping/logs`

### Public Endpoints
- All health endpoints
- `GET /api/v1/scraping/status`
- `GET /api/v1/scraping/properties`
- `GET /api/v1/scraping/history`
- All availability endpoints

## 🆘 Troubleshooting

### Common Issues

#### 1. Server Won't Start
```bash
# Check if port is in use
lsof -i :3000

# Check logs
npm run pm2:logs
# or
tail -f logs/error.log
```

#### 2. Database Connection Failed
```bash
# Test database connection
psql -h localhost -p 5432 -U your_user -d your_database

# Check environment variables
grep DATABASE .env
```

#### 3. Scraping Job Stuck
```bash
# Check job status
curl http://localhost:3000/api/v1/scraping/status

# Force kill if necessary (last resort)
lsof -ti:3000 | xargs kill
npm start
```

#### 4. No Data After Scraping
```bash
# Check for errors in last result
curl http://localhost:3000/api/v1/scraping/status | jq '.lastResult.errors'

# Verify database has data
curl "http://localhost:3000/api/v1/availability?limit=10"
```

#### 5. High Memory Usage
```bash
# Check memory usage
ps aux | grep node

# Restart if needed
npm run pm2:restart

# Consider reducing concurrency
# Set maxConcurrency: 1 in scraping requests
```

### Getting Help

1. **Check server logs first:**
```bash
npm run pm2:logs
```

2. **Check health status:**
```bash
curl "http://localhost:3000/health?detailed=true"
```

3. **Verify environment configuration:**
```bash
grep -v '^#' .env | grep -v '^$'
```

4. **Test database connectivity:**
```bash
curl http://localhost:3000/health | jq '.database'
```

## 📊 Example Workflows

### Daily Operations Check
```bash
#!/bin/bash
# daily-check.sh

echo "=== Server Health ==="
curl -s http://localhost:3000/health | jq '.'

echo -e "\n=== Scraping Status ==="
curl -s http://localhost:3000/api/v1/scraping/status | jq '.'

echo -e "\n=== Recent Data ==="
curl -s "http://localhost:3000/api/v1/availability?limit=5" | jq '.data[0:2]'
```

### Trigger Full Production Scrape
```bash
#!/bin/bash
# full-scrape.sh

echo "Starting full production scrape..."
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "testMode": false,
    "maxConcurrency": 2,
    "delayBetweenHuts": 5000,
    "delayBetweenRooms": 2000
  }' \
  http://localhost:3000/api/v1/scraping/trigger | jq '.'
```

### Monitor Scraping Progress
```bash
#!/bin/bash
# monitor-scrape.sh

while true; do
  STATUS=$(curl -s http://localhost:3000/api/v1/scraping/status)
  IS_RUNNING=$(echo "$STATUS" | jq -r '.isRunning')
  
  if [ "$IS_RUNNING" = "true" ]; then
    echo "$(date): Scraping is running..."
  else
    echo "$(date): Scraping completed"
    echo "$STATUS" | jq '.lastResult'
    break
  fi
  
  sleep 30
done
```

---

**Next Steps:** For deployment and infrastructure setup, see [SERVER_DEPLOYMENT.md](SERVER_DEPLOYMENT.md)