# Use the official Playwright image which includes browsers and dependencies
FROM mcr.microsoft.com/playwright:v1.40.0-jammy

# Set working directory
WORKDIR /app

# Install system dependencies for PostgreSQL client
RUN apt-get update && apt-get install -y \
    postgresql-client \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create app user for security
RUN groupadd -r appgroup && useradd -r -g appgroup -s /bin/bash -m appuser

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy application source
COPY . .

# Create necessary directories and set permissions
RUN mkdir -p logs screenshots results \
    && touch logs/error.log logs/combined.log \
    && chown -R appuser:appgroup /app \
    && chmod +x src/server/index.js

# Create a script to handle database migrations and start the server
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Switch to non-root user
USER appuser

# Expose the port the app runs on
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Set environment variables defaults
ENV NODE_ENV=production \
    PORT=3000 \
    HEADLESS_MODE=true \
    ENABLE_SCHEDULED_SCRAPING=true \
    LOG_LEVEL=info

# Use the entrypoint script
ENTRYPOINT ["docker-entrypoint.sh"]

# Default command
CMD ["node", "src/server/index.js"]