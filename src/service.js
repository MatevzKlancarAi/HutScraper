#!/usr/bin/env node

/**
 * Mountain Hut Scraper Service
 * Main entry point for the production service
 */

const http = require('http');
const url = require('url');
const Scheduler = require('./services/scheduler');
const HutManager = require('./services/hutManager');
const database = require('./services/database');
const logger = require('./services/logger');
const config = require('../config/service.config');

class MountainHutScraperService {
  constructor() {
    this.scheduler = null;
    this.hutManager = null;
    this.server = null;
    this.isShuttingDown = false;
  }

  /**
   * Initialize and start the service
   */
  async start() {
    try {
      logger.info(`Starting ${config.service.name} v${config.service.version}`, {
        environment: config.service.environment,
        nodeVersion: process.version
      });

      // Initialize database connection
      await database.initialize();
      logger.info('Database initialized successfully');

      // Initialize hut manager
      this.hutManager = new HutManager({
        parallel: config.scraper.behavior.parallel,
        maxConcurrency: config.scraper.behavior.maxConcurrency,
        saveToDatabase: config.scraper.output.saveToDatabase,
        saveToFile: config.scraper.output.saveToFile
      });

      // Initialize scheduler
      this.scheduler = new Scheduler({
        timezone: config.scheduler.timezone,
        morningSchedule: config.scheduler.morning,
        eveningSchedule: config.scheduler.evening,
        hutManagerOptions: {
          parallel: config.scraper.behavior.parallel,
          maxConcurrency: config.scraper.behavior.maxConcurrency
        }
      });

      // Start health check server if enabled
      if (config.healthCheck.enabled) {
        await this.startHealthCheckServer();
      }

      // Start scheduled jobs
      this.scheduler.start();

      // Setup graceful shutdown handlers
      this.setupShutdownHandlers();

      logger.info('Service started successfully', {
        schedulerRunning: this.scheduler.isRunning,
        healthCheckEnabled: config.healthCheck.enabled,
        healthCheckPort: config.healthCheck.port
      });

      // Run initial scraping if in development mode
      if (config.service.environment === 'development') {
        logger.info('Development mode: Running initial scraping in 10 seconds...');
        setTimeout(() => {
          this.runManualScraping().catch(error => {
            logger.error('Initial scraping failed', { error: error.message });
          });
        }, 10000);
      }

    } catch (error) {
      logger.error('Failed to start service', { error: error.message });
      process.exit(1);
    }
  }

  /**
   * Start health check HTTP server
   */
  async startHealthCheckServer() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleHealthCheckRequest(req, res);
      });

      this.server.listen(config.healthCheck.port, (error) => {
        if (error) {
          reject(error);
        } else {
          logger.info('Health check server started', { port: config.healthCheck.port });
          resolve();
        }
      });

      this.server.on('error', (error) => {
        logger.error('Health check server error', { error: error.message });
      });
    });
  }

  /**
   * Handle health check HTTP requests
   */
  async handleHealthCheckRequest(req, res) {
    const parsedUrl = url.parse(req.url, true);
    const path = parsedUrl.pathname;

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    try {
      switch (path) {
        case '/health':
          await this.handleHealthCheck(req, res);
          break;
        case '/status':
          await this.handleStatusCheck(req, res);
          break;
        case '/stats':
          await this.handleStatsRequest(req, res);
          break;
        case '/scrape':
          if (req.method === 'POST') {
            await this.handleManualScrape(req, res);
          } else {
            this.sendMethodNotAllowed(res);
          }
          break;
        default:
          this.sendNotFound(res);
      }
    } catch (error) {
      logger.error('Health check request error', { 
        path, 
        method: req.method, 
        error: error.message 
      });
      this.sendInternalServerError(res, error.message);
    }
  }

  /**
   * Handle basic health check
   */
  async handleHealthCheck(req, res) {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: config.service.name,
      version: config.service.version,
      database: database.getHealthStatus(),
      scheduler: this.scheduler ? this.scheduler.getStatus() : { status: 'not_initialized' }
    };

    res.writeHead(200);
    res.end(JSON.stringify(health, null, 2));
  }

  /**
   * Handle detailed status check
   */
  async handleStatusCheck(req, res) {
    const hutHealth = await this.hutManager.getHealthStatus();
    const schedulerStatus = this.scheduler ? this.scheduler.getStatus() : null;

    const status = {
      service: {
        name: config.service.name,
        version: config.service.version,
        environment: config.service.environment,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: new Date().toISOString()
      },
      database: database.getHealthStatus(),
      scheduler: schedulerStatus,
      huts: hutHealth
    };

    res.writeHead(200);
    res.end(JSON.stringify(status, null, 2));
  }

  /**
   * Handle scraping statistics request
   */
  async handleStatsRequest(req, res) {
    try {
      const stats = await this.hutManager.getScrapingStats();
      res.writeHead(200);
      res.end(JSON.stringify(stats, null, 2));
    } catch (error) {
      this.sendInternalServerError(res, error.message);
    }
  }

  /**
   * Handle manual scraping request
   */
  async handleManualScrape(req, res) {
    if (this.isShuttingDown) {
      this.sendServiceUnavailable(res, 'Service is shutting down');
      return;
    }

    // Parse request body for parameters
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const params = body ? JSON.parse(body) : {};
        const hutId = params.hutId || null;
        const roomTypes = params.roomTypes || null;

        logger.info('Manual scraping requested', { hutId, roomTypes });

        // Start scraping asynchronously
        this.runManualScraping(hutId, roomTypes)
          .then(result => {
            logger.info('Manual scraping completed', { 
              hutId, 
              summary: result.summary 
            });
          })
          .catch(error => {
            logger.error('Manual scraping failed', { 
              hutId, 
              error: error.message 
            });
          });

        res.writeHead(202); // Accepted
        res.end(JSON.stringify({
          message: 'Scraping started',
          hutId,
          roomTypes,
          timestamp: new Date().toISOString()
        }));

      } catch (error) {
        this.sendBadRequest(res, 'Invalid JSON in request body');
      }
    });
  }

  /**
   * Run manual scraping
   */
  async runManualScraping(hutId = null, roomTypes = null) {
    return await this.scheduler.runManualScraping(hutId, roomTypes);
  }

  /**
   * Setup graceful shutdown handlers
   */
  setupShutdownHandlers() {
    const gracefulShutdown = (signal) => {
      logger.info(`Received ${signal}, starting graceful shutdown...`);
      this.isShuttingDown = true;
      this.shutdown();
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', { error: error.message, stack: error.stack });
      this.shutdown(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection', { reason, promise });
      this.shutdown(1);
    });
  }

  /**
   * Graceful shutdown
   */
  async shutdown(exitCode = 0) {
    logger.info('Shutting down service...');

    try {
      // Stop scheduler
      if (this.scheduler) {
        this.scheduler.stop();
        logger.info('Scheduler stopped');
      }

      // Close health check server
      if (this.server) {
        await new Promise((resolve) => {
          this.server.close(resolve);
        });
        logger.info('Health check server closed');
      }

      // Close database connections
      await database.close();
      logger.info('Database connections closed');

      logger.info('Service shutdown completed');
      process.exit(exitCode);
    } catch (error) {
      logger.error('Error during shutdown', { error: error.message });
      process.exit(1);
    }
  }

  // HTTP response helpers
  sendNotFound(res) {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  }

  sendMethodNotAllowed(res) {
    res.writeHead(405);
    res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  sendBadRequest(res, message) {
    res.writeHead(400);
    res.end(JSON.stringify({ error: message }));
  }

  sendInternalServerError(res, message) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: message }));
  }

  sendServiceUnavailable(res, message) {
    res.writeHead(503);
    res.end(JSON.stringify({ error: message }));
  }
}

// Start service if run directly
if (require.main === module) {
  const service = new MountainHutScraperService();
  service.start();
}

module.exports = MountainHutScraperService;