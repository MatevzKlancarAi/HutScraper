#!/bin/bash
set -e

echo "🐳 Starting Mountain Hut Scraper Server..."

# Function to wait for database
wait_for_database() {
    echo "⏳ Waiting for database connection..."
    
    max_attempts=30
    attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if pg_isready -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U "$DATABASE_USER" > /dev/null 2>&1; then
            echo "✅ Database is ready!"
            return 0
        fi
        
        attempt=$((attempt + 1))
        echo "   Attempt $attempt/$max_attempts - Database not ready, waiting 2 seconds..."
        sleep 2
    done
    
    echo "❌ Database connection failed after $max_attempts attempts"
    exit 1
}

# Function to run database migrations if needed
run_migrations() {
    echo "🔧 Checking database migrations..."
    
    # Run Prisma generate to ensure client is up to date
    if [ -f "prisma/schema.prisma" ]; then
        echo "   Generating Prisma client..."
        npx prisma generate || echo "   Warning: Prisma generate failed, continuing..."
        
        # Run database migrations
        echo "   Running database migrations..."
        npx prisma db push || echo "   Warning: Database push failed, continuing..."
    else
        echo "   No Prisma schema found, skipping migrations"
    fi
}

# Function to validate environment
validate_environment() {
    echo "🔍 Validating environment configuration..."
    
    # Check required environment variables
    required_vars=("DATABASE_HOST" "DATABASE_PORT" "DATABASE_NAME" "DATABASE_USER" "DATABASE_PASSWORD")
    
    for var in "${required_vars[@]}"; do
        if [ -z "${!var}" ]; then
            echo "❌ Missing required environment variable: $var"
            exit 1
        fi
    done
    
    # Set defaults for optional variables
    export PORT=${PORT:-3000}
    export NODE_ENV=${NODE_ENV:-production}
    export HEADLESS_MODE=${HEADLESS_MODE:-true}
    export ENABLE_SCHEDULED_SCRAPING=${ENABLE_SCHEDULED_SCRAPING:-true}
    export LOG_LEVEL=${LOG_LEVEL:-info}
    
    echo "✅ Environment validation complete"
    echo "   NODE_ENV: $NODE_ENV"
    echo "   PORT: $PORT"
    echo "   HEADLESS_MODE: $HEADLESS_MODE"
    echo "   SCHEDULED_SCRAPING: $ENABLE_SCHEDULED_SCRAPING"
}

# Function to setup logging directory
setup_logging() {
    echo "📝 Setting up logging..."
    
    # Ensure logs directory exists
    mkdir -p logs
    
    # Create initial log files if they don't exist
    touch logs/error.log logs/combined.log
    
    echo "✅ Logging setup complete"
}

# Function to display startup banner
display_banner() {
    echo "
🏔️  ========================================
   Mountain Hut Scraper Server
   Version: $(node -p \"require('./package.json').version\")
   Environment: $NODE_ENV
   Port: $PORT
   ========================================"
}

# Main execution flow
main() {
    display_banner
    validate_environment
    setup_logging
    wait_for_database
    run_migrations
    
    echo "🚀 Starting application..."
    echo ""
    
    # Execute the command passed to docker run
    exec "$@"
}

# Handle shutdown gracefully
cleanup() {
    echo ""
    echo "🛑 Received shutdown signal, cleaning up..."
    # Add any cleanup tasks here
    exit 0
}

# Set up signal handlers
trap cleanup SIGTERM SIGINT

# Run main function
main "$@"