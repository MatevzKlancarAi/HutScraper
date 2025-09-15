# Hetzner Deployment Guide

Complete step-by-step guide for deploying the Mountain Hut Scraper to Hetzner Cloud.

## Prerequisites

- Hetzner Cloud server (Ubuntu 24.04)
- Docker installed on server
- GitHub repository access
- PostgreSQL database credentials

## Server Setup (One-time)

### 1. SSH Access
```bash
ssh root@YOUR_SERVER_IP
```

### 2. Install Docker (if not already installed)
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
```

## Deployment Process

### 1. Clone/Update Repository
```bash
# First time deployment
git clone https://github.com/MatevzKlancarAi/HutScraper.git
cd HutScraper

# For updates
cd HutScraper
git pull origin cleanup-for-deployment
```

### 2. Create Environment File
Create `.env.production` with the following content:

```env
# Database Configuration (External PostgreSQL)
DATABASE_HOST=159.69.183.35
DATABASE_PORT=5432
DATABASE_NAME=world_discovery
DATABASE_USER=availability_activities
DATABASE_PASSWORD=QDPCFvH4Jhr5QPozTy2f
DATABASE_MAX_CONNECTIONS=10
DATABASE_URL="postgresql://availability_activities:QDPCFvH4Jhr5QPozTy2f@159.69.183.35:5432/world_discovery?schema=availability"

# Server Configuration
NODE_ENV=production
LOG_LEVEL=info
PORT=3000
API_KEY=temp_key_change_later
ALLOWED_ORIGINS=*
TZ=Europe/Ljubljana

# Scheduled Scraping Configuration
ENABLE_SCHEDULED_SCRAPING=true
SCRAPE_CRON_MORNING=0 6 * * *
SCRAPE_CRON_EVENING=0 18 * * *
MAX_SCRAPE_RETRIES=3
SCRAPER_RETRY_DELAY=300000
ENABLE_MAINTENANCE_JOB=false
MAINTENANCE_CRON=0 2 * * 0

# Scraper Configuration  
SCRAPER_MAX_CONCURRENCY=2
SCRAPER_DELAY_HUTS=5000
SCRAPER_DELAY_ROOMS=2000

# Browser Configuration
HEADLESS_MODE=true
SLOW_MO=0
SCREENSHOT_ON_ERROR=true
PARALLEL_SCRAPING=true

# Notification Configuration (optional)
ALERT_EMAIL=
SLACK_WEBHOOK_URL=
```

### 3. Stop Existing Container (if running)
```bash
docker stop mountain-huts-scraper-prod 2>/dev/null || true
docker rm mountain-huts-scraper-prod 2>/dev/null || true
```

### 4. Build Docker Image
```bash
docker build -t mountain-huts-scraper:latest .
```
*Note: This takes ~9 minutes due to Playwright dependencies (722MB download)*

### 5. Run Container
Use the command from `deploy-command.txt`:

```bash
docker run -d --name mountain-huts-scraper-prod --restart unless-stopped -p 3000:3000 --env-file .env.production -e DATABASE_URL="postgresql://availability_activities:QDPCFvH4Jhr5QPozTy2f@159.69.183.35:5432/world_discovery?schema=availability" mountain-huts-scraper:latest
```

### 6. Verify Deployment
```bash
# Check container status
docker ps | grep mountain-huts-scraper-prod

# Check logs
docker logs -f mountain-huts-scraper-prod

# Test API endpoints
curl http://localhost:3000/health
curl http://localhost:3000/api/v1/scraping/status
```

## Common Issues & Solutions

### Issue: Docker build fails with Playwright version mismatch
**Solution:** Ensure Dockerfile uses the correct Playwright version:
```dockerfile
FROM mcr.microsoft.com/playwright:v1.55.0-jammy
```

### Issue: Container fails to start with database errors
**Solution:** Check database credentials and network access:
```bash
# Test database connection from server
apt-get install postgresql-client
psql "postgresql://availability_activities:QDPCFvH4Jhr5QPozTy2f@159.69.183.35:5432/world_discovery"
```

### Issue: Port 3000 not accessible from outside
**Solution:** Check Hetzner firewall rules - ensure port 3000 is open

### Issue: Environment file not found
**Solution:** Ensure `.env.production` is in the same directory as your `docker run` command

## File Structure
```
HutScraper/
├── Dockerfile                 # Updated with Playwright v1.55.0
├── .env.production           # Production environment variables
├── deploy-command.txt        # Docker run command for copy/paste
├── docker-entrypoint.sh      # Container startup script
├── SERVER_USAGE_GUIDE.md     # API documentation
├── DEPLOYMENT_GUIDE.md       # This file
└── TLDR.md                   # Quick summary
```

## Maintenance Commands

### View logs in real-time
```bash
docker logs -f mountain-huts-scraper-prod
```

### Restart container
```bash
docker restart mountain-huts-scraper-prod
```

### Update application
```bash
cd HutScraper
git pull origin cleanup-for-deployment
docker stop mountain-huts-scraper-prod
docker rm mountain-huts-scraper-prod
docker build -t mountain-huts-scraper:latest .
# Run container again using deploy-command.txt
```

### Check container resource usage
```bash
docker stats mountain-huts-scraper-prod
```

## API Endpoints (External Access)

Replace `YOUR_SERVER_IP` with your actual server IP:

- Health Check: `http://YOUR_SERVER_IP:3000/health`
- Scraping Status: `http://YOUR_SERVER_IP:3000/api/v1/scraping/status`
- Trigger Scraping: `http://YOUR_SERVER_IP:3000/api/v1/scraping/trigger`

## Troubleshooting

1. **Container won't start**: Check `docker logs mountain-huts-scraper-prod`
2. **Database connection issues**: Verify credentials and network access
3. **Scraping failures**: Check Playwright version compatibility
4. **High memory usage**: Monitor with `docker stats` and adjust if needed

## Production Considerations

- **Monitoring**: Set up log monitoring and alerts
- **Backups**: Consider database backup strategy
- **SSL**: Use nginx reverse proxy for HTTPS in production
- **Security**: Change default API_KEY and restrict ALLOWED_ORIGINS
- **Updates**: Set up automated deployment pipeline