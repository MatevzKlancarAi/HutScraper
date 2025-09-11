#!/bin/bash
set -e

echo "🚀 Deploying Mountain Hut Scraper to Hetzner..."

# Load environment variables
if [ ! -f .env.production ]; then
    echo "❌ .env.production file not found!"
    exit 1
fi

# Load environment variables (skip sourcing to avoid cron expression issues)
echo "📋 Loading environment variables..."

# Stop existing container if running
echo "🛑 Stopping existing container..."
docker stop mountain-huts-scraper-prod 2>/dev/null || true
docker rm mountain-huts-scraper-prod 2>/dev/null || true

# Create necessary directories on host
echo "📁 Creating host directories..."
mkdir -p ./logs ./screenshots ./results ./config

# Set proper permissions for mounted directories (appuser UID is 1000)
echo "🔧 Setting directory permissions..."
chown -R 1000:1000 ./logs ./screenshots ./results 2>/dev/null || true

# Run the container (without volume mounts to avoid permission issues)
echo "🐳 Starting new container..."
docker run -d \
  --name mountain-huts-scraper-prod \
  --restart unless-stopped \
  -p 3000:3000 \
  --env-file .env.production \
  -e DATABASE_URL="postgresql://availability_activities:QDPCFvH4Jhr5QPozTy2f@159.69.183.35:5432/world_discovery?schema=availability" \
  hutscraper_app:latest

echo "✅ Container started successfully!"

# Wait a moment and check status
sleep 5
echo ""
echo "📊 Container status:"
docker ps | grep mountain-huts-scraper-prod || echo "❌ Container not found in running processes"

echo ""
echo "📝 Recent logs:"
docker logs --tail 20 mountain-huts-scraper-prod

echo ""
echo "🔗 Application should be available at: http://YOUR_SERVER_IP:3000"
echo "🔍 To view logs: docker logs -f mountain-huts-scraper-prod"
echo "🛑 To stop: docker stop mountain-huts-scraper-prod"