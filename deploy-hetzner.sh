#!/bin/bash
set -e

echo "🚀 Deploying Mountain Hut Scraper to Hetzner..."

# Load environment variables
if [ ! -f .env.production ]; then
    echo "❌ .env.production file not found!"
    exit 1
fi

# Source environment file
set -a
source .env.production
set +a

# Stop existing container if running
echo "🛑 Stopping existing container..."
docker stop mountain-huts-scraper-prod 2>/dev/null || true
docker rm mountain-huts-scraper-prod 2>/dev/null || true

# Create necessary directories on host
echo "📁 Creating host directories..."
mkdir -p ./logs ./screenshots ./results ./config

# Run the container
echo "🐳 Starting new container..."
docker run -d \
  --name mountain-huts-scraper-prod \
  --restart unless-stopped \
  -p 3000:3000 \
  -v "$(pwd)/logs:/app/logs" \
  -v "$(pwd)/screenshots:/app/screenshots" \
  -v "$(pwd)/results:/app/results" \
  -v "$(pwd)/config:/app/config:ro" \
  --env-file .env.production \
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