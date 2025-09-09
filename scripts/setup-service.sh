#!/bin/bash

# Mountain Hut Scraper Service Setup Script
# This script sets up the service environment and dependencies

set -e  # Exit on any error

echo "🏔️ Mountain Hut Scraper Service Setup"
echo "====================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# Check if Node.js is installed
print_status "Checking Node.js installation..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    print_success "Node.js $NODE_VERSION is installed"
else
    print_error "Node.js is not installed. Please install Node.js 16+ before continuing."
    exit 1
fi

# Check Node.js version
NODE_MAJOR_VERSION=$(node --version | cut -d'.' -f1 | sed 's/v//')
if [ "$NODE_MAJOR_VERSION" -lt 16 ]; then
    print_error "Node.js version $NODE_MAJOR_VERSION is not supported. Please install Node.js 16 or higher."
    exit 1
fi

# Install dependencies
print_status "Installing npm dependencies..."
if npm install; then
    print_success "Dependencies installed successfully"
else
    print_error "Failed to install dependencies"
    exit 1
fi

# Install Playwright browsers
print_status "Installing Playwright browsers..."
if npx playwright install chromium; then
    print_success "Playwright browsers installed"
else
    print_error "Failed to install Playwright browsers"
    exit 1
fi

# Create required directories
print_status "Creating required directories..."
mkdir -p logs
mkdir -p results
mkdir -p screenshots

print_success "Directories created"

# Setup environment configuration
if [ ! -f .env ]; then
    print_status "Creating .env file from template..."
    if [ -f .env.example ]; then
        cp .env.example .env
        print_warning "Please edit .env file with your database credentials and settings"
    else
        print_error ".env.example file not found"
        exit 1
    fi
else
    print_success ".env file already exists"
fi

# Check if PM2 is installed globally
print_status "Checking PM2 installation..."
if command -v pm2 &> /dev/null; then
    PM2_VERSION=$(pm2 --version)
    print_success "PM2 $PM2_VERSION is installed"
else
    print_warning "PM2 is not installed globally. Installing PM2..."
    if npm install -g pm2; then
        print_success "PM2 installed successfully"
    else
        print_error "Failed to install PM2 globally. You can still run the service manually."
    fi
fi

# Check PostgreSQL connection (optional)
print_status "Checking PostgreSQL connection..."
if command -v psql &> /dev/null; then
    # Source environment variables safely
    if [ -f .env ]; then
        set -a
        source .env
        set +a
    fi
    
    if [ -n "$DATABASE_PASSWORD" ] && [ "$DATABASE_PASSWORD" != "your_password" ]; then
        print_status "Testing database connection..."
        # This is a basic test - in production you'd want more robust checking
        print_warning "Database connection test skipped. Please ensure PostgreSQL is running and accessible."
    else
        print_warning "Database credentials not configured. Please update .env file."
    fi
else
    print_warning "PostgreSQL client (psql) not found. Please ensure PostgreSQL is installed."
fi

# Make scripts executable
print_status "Making scripts executable..."
chmod +x scripts/*.sh
print_success "Scripts are now executable"

# Print usage instructions
echo ""
echo "🎉 Setup completed successfully!"
echo ""
echo "📋 Next steps:"
echo "1. Edit .env file with your database credentials"
echo "2. Ensure PostgreSQL is running and database exists"
echo "3. Run database migrations: npm run db:migrate (if available)"
echo ""
echo "🚀 Start the service:"
echo "   Development: npm run dev"
echo "   Production:  npm run start"
echo "   With PM2:    pm2 start ecosystem.config.js"
echo ""
echo "💡 Useful commands:"
echo "   Health check: curl http://localhost:3000/health"
echo "   View logs:    pm2 logs mountain-hut-scraper"
echo "   Stop service: pm2 stop mountain-hut-scraper"
echo ""