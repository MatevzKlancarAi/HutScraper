#!/bin/bash

# Mountain Hut Scraper Deployment Script
# Usage: ./deploy.sh [environment] [server]
# Example: ./deploy.sh production my-server.com

set -e

# Configuration
ENVIRONMENT=${1:-production}
SERVER=${2:-}
APP_NAME="mountain-hut-scraper"
REMOTE_PATH="/var/www/$APP_NAME"
CURRENT_DIR=$(pwd)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check requirements
check_requirements() {
    log_info "Checking deployment requirements..."
    
    if [ -z "$SERVER" ]; then
        log_error "Server address is required"
        echo "Usage: $0 [environment] [server]"
        exit 1
    fi
    
    if ! command -v rsync &> /dev/null; then
        log_error "rsync is required for deployment"
        exit 1
    fi
    
    if ! command -v ssh &> /dev/null; then
        log_error "ssh is required for deployment"
        exit 1
    fi
    
    log_info "Requirements check passed ✓"
}

# Build application
build_application() {
    log_info "Building application for $ENVIRONMENT..."
    
    # Run any build steps (currently none for Node.js)
    npm run build:production
    
    log_info "Build completed ✓"
}

# Deploy files to server
deploy_files() {
    log_info "Deploying files to $SERVER..."
    
    # Create remote directory if it doesn't exist
    ssh deploy@$SERVER "mkdir -p $REMOTE_PATH"
    
    # Sync files (excluding development files)
    rsync -avz --delete \
        --exclude 'node_modules' \
        --exclude '.git' \
        --exclude 'logs/*' \
        --exclude 'screenshots/*' \
        --exclude 'results/*' \
        --exclude '.env' \
        --exclude '*.log' \
        --exclude '.DS_Store' \
        ./ deploy@$SERVER:$REMOTE_PATH/
    
    log_info "Files deployed ✓"
}

# Install dependencies on server
install_dependencies() {
    log_info "Installing dependencies on server..."
    
    ssh deploy@$SERVER "cd $REMOTE_PATH && npm ci --only=production"
    
    log_info "Dependencies installed ✓"
}

# Run database migrations
run_migrations() {
    log_info "Running database migrations..."
    
    ssh deploy@$SERVER "cd $REMOTE_PATH && npm run db:deploy"
    
    log_info "Migrations completed ✓"
}

# Restart application
restart_application() {
    log_info "Restarting application..."
    
    # Stop existing processes
    ssh deploy@$SERVER "cd $REMOTE_PATH && (npm run pm2:stop || true)"
    
    # Start with new configuration
    ssh deploy@$SERVER "cd $REMOTE_PATH && npm run pm2:start"
    
    # Wait a moment for startup
    sleep 5
    
    # Check if application is running
    if ssh deploy@$SERVER "cd $REMOTE_PATH && npm run pm2:status | grep -q 'online'"; then
        log_info "Application restarted successfully ✓"
    else
        log_error "Application failed to start properly"
        ssh deploy@$SERVER "cd $REMOTE_PATH && npm run pm2:logs"
        exit 1
    fi
}

# Health check
health_check() {
    log_info "Running health check..."
    
    # Wait for application to be fully ready
    sleep 10
    
    # Check health endpoint
    if ssh deploy@$SERVER "curl -f http://localhost:3000/health > /dev/null 2>&1"; then
        log_info "Health check passed ✓"
    else
        log_error "Health check failed"
        ssh deploy@$SERVER "cd $REMOTE_PATH && npm run pm2:logs"
        exit 1
    fi
}

# Rollback function (basic)
rollback() {
    log_warn "Rolling back to previous version..."
    
    # This is a basic rollback - in production you'd want more sophisticated versioning
    ssh deploy@$SERVER "cd $REMOTE_PATH && git reset --hard HEAD~1 && npm ci --only=production && npm run pm2:restart"
    
    log_info "Rollback completed"
}

# Main deployment flow
main() {
    log_info "Starting deployment to $ENVIRONMENT environment on $SERVER"
    
    check_requirements
    
    # Set trap for cleanup on error
    trap 'log_error "Deployment failed! Check the logs above."; exit 1' ERR
    
    build_application
    deploy_files
    install_dependencies
    run_migrations
    restart_application
    health_check
    
    log_info "🎉 Deployment completed successfully!"
    log_info "Application is available at: http://$SERVER"
    log_info "Health check: http://$SERVER/health"
    log_info "API docs: http://$SERVER/"
}

# Handle command line arguments
case "${1:-}" in
    "rollback")
        if [ -z "$2" ]; then
            log_error "Server address is required for rollback"
            exit 1
        fi
        SERVER=$2
        rollback
        ;;
    "help"|"-h"|"--help")
        echo "Mountain Hut Scraper Deployment Script"
        echo ""
        echo "Usage:"
        echo "  $0 [environment] [server]     Deploy to server"
        echo "  $0 rollback [server]          Rollback to previous version"
        echo "  $0 help                       Show this help"
        echo ""
        echo "Examples:"
        echo "  $0 production my-server.com"
        echo "  $0 staging staging.example.com"
        echo "  $0 rollback my-server.com"
        ;;
    *)
        main
        ;;
esac