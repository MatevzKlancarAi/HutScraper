#!/bin/bash

# Mountain Hut Scraper Service Management Script
# Provides common service management operations

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SERVICE_NAME="mountain-hut-scraper"
ECOSYSTEM_FILE="ecosystem.config.js"

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if PM2 is available
check_pm2() {
    if ! command -v pm2 &> /dev/null; then
        print_error "PM2 is not installed. Please install PM2 first: npm install -g pm2"
        exit 1
    fi
}

# Start service
start_service() {
    check_pm2
    print_status "Starting $SERVICE_NAME service..."
    
    if pm2 start $ECOSYSTEM_FILE; then
        print_success "Service started successfully"
        pm2 list
    else
        print_error "Failed to start service"
        exit 1
    fi
}

# Stop service
stop_service() {
    check_pm2
    print_status "Stopping $SERVICE_NAME service..."
    
    if pm2 stop $SERVICE_NAME; then
        print_success "Service stopped successfully"
    else
        print_warning "Service may not have been running"
    fi
}

# Restart service
restart_service() {
    check_pm2
    print_status "Restarting $SERVICE_NAME service..."
    
    if pm2 restart $SERVICE_NAME; then
        print_success "Service restarted successfully"
    else
        print_error "Failed to restart service"
        exit 1
    fi
}

# Reload service (zero-downtime restart)
reload_service() {
    check_pm2
    print_status "Reloading $SERVICE_NAME service..."
    
    if pm2 reload $SERVICE_NAME; then
        print_success "Service reloaded successfully"
    else
        print_error "Failed to reload service"
        exit 1
    fi
}

# Delete service from PM2
delete_service() {
    check_pm2
    print_status "Deleting $SERVICE_NAME service from PM2..."
    
    if pm2 delete $SERVICE_NAME; then
        print_success "Service deleted successfully"
    else
        print_warning "Service may not have been registered"
    fi
}

# Show service status
status_service() {
    check_pm2
    print_status "Service status:"
    pm2 list | grep -E "(App name|$SERVICE_NAME)" || print_warning "Service not found in PM2"
    
    # Show more details if service exists
    if pm2 describe $SERVICE_NAME &> /dev/null; then
        echo ""
        print_status "Detailed status:"
        pm2 describe $SERVICE_NAME
    fi
}

# Show service logs
logs_service() {
    check_pm2
    print_status "Showing logs for $SERVICE_NAME..."
    pm2 logs $SERVICE_NAME
}

# Monitor service
monitor_service() {
    check_pm2
    print_status "Opening PM2 monitoring interface..."
    pm2 monit
}

# Run health check
health_check() {
    print_status "Running health check..."
    
    # Try different ports/endpoints
    for port in 3000 8080; do
        for endpoint in health status; do
            url="http://localhost:$port/$endpoint"
            if curl -s "$url" > /dev/null 2>&1; then
                print_success "Health check passed: $url"
                curl -s "$url" | jq . 2>/dev/null || curl -s "$url"
                return 0
            fi
        done
    done
    
    print_error "Health check failed - service may not be running or not accessible"
    return 1
}

# Trigger manual scraping
manual_scrape() {
    print_status "Triggering manual scraping..."
    
    # Try different ports
    for port in 3000 8080; do
        url="http://localhost:$port/scrape"
        if curl -s -X POST -H "Content-Type: application/json" "$url" > /dev/null 2>&1; then
            print_success "Manual scraping triggered: $url"
            curl -s -X POST -H "Content-Type: application/json" "$url" | jq . 2>/dev/null || curl -s -X POST -H "Content-Type: application/json" "$url"
            return 0
        fi
    done
    
    print_error "Failed to trigger manual scraping - service may not be accessible"
    return 1
}

# Save PM2 configuration for startup
save_pm2() {
    check_pm2
    print_status "Saving PM2 configuration for startup..."
    
    if pm2 save; then
        print_success "PM2 configuration saved"
        
        # Setup startup script
        print_status "Setting up PM2 startup script..."
        pm2 startup
    else
        print_error "Failed to save PM2 configuration"
        exit 1
    fi
}

# Show usage
usage() {
    echo "🏔️ Mountain Hut Scraper Service Management"
    echo ""
    echo "Usage: $0 <command>"
    echo ""
    echo "Commands:"
    echo "  start     - Start the service with PM2"
    echo "  stop      - Stop the service"
    echo "  restart   - Restart the service"
    echo "  reload    - Reload the service (zero-downtime)"
    echo "  delete    - Remove the service from PM2"
    echo "  status    - Show service status"
    echo "  logs      - Show service logs"
    echo "  monitor   - Open PM2 monitoring interface"
    echo "  health    - Run health check"
    echo "  scrape    - Trigger manual scraping"
    echo "  save      - Save PM2 config for startup"
    echo ""
    echo "Examples:"
    echo "  $0 start         # Start the service"
    echo "  $0 status        # Check if service is running"
    echo "  $0 logs          # View live logs"
    echo "  $0 health        # Test if service is responding"
    echo ""
}

# Main script logic
case "$1" in
    start)
        start_service
        ;;
    stop)
        stop_service
        ;;
    restart)
        restart_service
        ;;
    reload)
        reload_service
        ;;
    delete)
        delete_service
        ;;
    status)
        status_service
        ;;
    logs)
        logs_service
        ;;
    monitor)
        monitor_service
        ;;
    health)
        health_check
        ;;
    scrape)
        manual_scrape
        ;;
    save)
        save_pm2
        ;;
    *)
        usage
        exit 1
        ;;
esac