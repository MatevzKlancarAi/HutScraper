# Mountain Hut Scraper - Server Deployment Guide

This document provides comprehensive instructions for deploying the Mountain Hut Scraper as a production server with scheduled scraping capabilities.

## 🚀 Quick Start

### Development
```bash
# Start the server in development mode
npm run start:dev

# Or using Docker
npm run docker:up
```

### Production
```bash
# Using PM2 (recommended)
npm run pm2:start

# Or using Docker
docker-compose up -d

# Or manual deployment to server
./deploy.sh production your-server.com
```

## 📊 API Endpoints

Once the server is running, you can access:

- **Health Check**: `GET /health`
- **Server Status**: `GET /`
- **Scraping Status**: `GET /api/v1/scraping/status`
- **Manual Scraping**: `POST /api/v1/scraping/trigger`
- **Availability Data**: `GET /api/v1/availability`
- **Property List**: `GET /api/v1/scraping/properties`

## 🔧 Environment Configuration

Copy `.env.example` to `.env` and configure:

### Required Variables
```env
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=mountain_huts
DATABASE_USER=postgres
DATABASE_PASSWORD=your_secure_password
```

### Server Configuration
```env
PORT=3000
NODE_ENV=production
API_KEY=your_secure_api_key_here
ENABLE_SCHEDULED_SCRAPING=true
```

### Scheduled Scraping
```env
SCRAPE_CRON_MORNING=0 6 * * *    # 6 AM daily
SCRAPE_CRON_EVENING=0 18 * * *   # 6 PM daily
MAX_SCRAPE_RETRIES=3
```

## 🐳 Docker Deployment

### Development with Docker Compose
```bash
# Start all services (app + database)
npm run docker:up

# View logs
npm run docker:logs

# Stop services
npm run docker:down
```

### Production Docker Build
```bash
# Build image
npm run docker:build

# Run with environment file
npm run docker:run
```

## 🔄 PM2 Process Management

### Local Development
```bash
# Start in development mode
npm run pm2:dev

# Monitor processes
npm run pm2:monit

# View logs
npm run pm2:logs

# Restart
npm run pm2:restart

# Stop
npm run pm2:stop
```

### Production Deployment
```bash
# Start in production mode
npm run pm2:start

# Reload without downtime
npm run pm2:reload

# Check status
npm run pm2:status
```

## 🌐 Server Deployment (Hetzner, AWS, etc.)

### Prerequisites on Server
```bash
# Install Node.js (v18+)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 globally
sudo npm install -g pm2

# Install PostgreSQL
sudo apt-get install postgresql postgresql-contrib

# Install Playwright dependencies
npx playwright install-deps
```

### Manual Deployment
```bash
# Clone repository
git clone https://github.com/matevzklancar/mountain-hut-scraper.git
cd mountain-hut-scraper

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your configuration

# Run database migrations
npm run db:deploy

# Start with PM2
npm run pm2:start
```

### Automated Deployment
```bash
# Make deployment script executable
chmod +x deploy.sh

# Deploy to production server
./deploy.sh production your-server.com

# Deploy to staging server
./deploy.sh staging staging.example.com
```

## 🔒 Security Configuration

### API Key Authentication
Set `API_KEY` in your environment to secure sensitive endpoints:
```bash
# Example API call with authentication
curl -H "X-API-Key: your_api_key" \
     -X POST http://localhost:3000/api/v1/scraping/trigger
```

### Nginx Reverse Proxy (Recommended for Production)
```bash
# Copy nginx configuration
sudo cp nginx.conf /etc/nginx/sites-available/mountain-hut-scraper
sudo ln -s /etc/nginx/sites-available/mountain-hut-scraper /etc/nginx/sites-enabled/

# Test and reload nginx
sudo nginx -t
sudo systemctl reload nginx
```

## 📊 Monitoring & Maintenance

### Health Checks
```bash
# Check server health
npm run health

# Or direct curl
curl -f http://localhost:3000/health
```

### Viewing Logs
```bash
# PM2 logs
npm run pm2:logs

# Docker logs
npm run docker:logs

# Direct log files
tail -f logs/combined.log
tail -f logs/error.log
```

### Database Management
```bash
# Open Prisma Studio
npm run db:studio

# Run migrations
npm run db:migrate

# Reset database (development only)
npm run db:reset
```

## 🔄 Scheduled Scraping

The server automatically runs scraping jobs based on cron schedules:

- **Morning**: 6:00 AM daily (configurable with `SCRAPE_CRON_MORNING`)
- **Evening**: 6:00 PM daily (configurable with `SCRAPE_CRON_EVENING`)

### Manual Triggering
```bash
# Trigger scraping via API
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_api_key" \
  -d '{"testMode": false}' \
  http://localhost:3000/api/v1/scraping/trigger
```

### Viewing Scraping Status
```bash
curl http://localhost:3000/api/v1/scraping/status?detailed=true
```

## 🔧 Troubleshooting

### Common Issues

1. **Database Connection Errors**
   - Check database credentials in `.env`
   - Ensure PostgreSQL is running
   - Run: `npm run db:generate`

2. **Playwright Browser Issues**
   - Install system dependencies: `npx playwright install-deps`
   - Set `HEADLESS_MODE=true` in production

3. **Port Already in Use**
   - Change `PORT` in `.env`
   - Or kill existing process: `lsof -ti:3000 | xargs kill`

4. **PM2 Process Issues**
   - Check status: `npm run pm2:status`
   - View logs: `npm run pm2:logs`
   - Restart: `npm run pm2:restart`

### Log Locations
- Application logs: `logs/combined.log`, `logs/error.log`
- PM2 logs: `~/.pm2/logs/`
- Docker logs: `docker-compose logs -f app`

## 🚨 Production Checklist

- [ ] Environment variables configured
- [ ] Database migrations run
- [ ] SSL certificate installed (if using HTTPS)
- [ ] Nginx reverse proxy configured
- [ ] PM2 process manager setup
- [ ] Log rotation configured
- [ ] Monitoring/alerting setup
- [ ] Backup strategy implemented
- [ ] Firewall configured
- [ ] API key authentication enabled

## 📈 Scaling Considerations

- **Multiple Instances**: Use only 1 instance for scheduled jobs to avoid conflicts
- **Load Balancing**: Use nginx upstream for multiple worker processes
- **Database**: Consider connection pooling for high load
- **Monitoring**: Implement Prometheus/Grafana for production monitoring

## 🆘 Support

For deployment issues:
1. Check the logs (`npm run pm2:logs` or `npm run docker:logs`)
2. Verify environment configuration
3. Test database connectivity
4. Check server resources (CPU, memory, disk)
5. Review nginx configuration (if using reverse proxy)