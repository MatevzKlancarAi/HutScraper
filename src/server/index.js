#!/usr/bin/env node

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const winston = require('winston');
require('dotenv').config();

const database = require('../services/database');
const scheduler = require('./jobs/scheduler');

const healthRoutes = require('./routes/health');
const scrapingRoutes = require('./routes/scraping');
const availabilityRoutes = require('./routes/availability');
const errorHandler = require('./middleware/errorHandler');

class MountainHutServer {
    constructor() {
        this.app = express();
        this.port = process.env.PORT || 3000;
        this.logger = this.createLogger();
        this.server = null;
    }

    createLogger() {
        return winston.createLogger({
            level: process.env.LOG_LEVEL || 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.errors({ stack: true }),
                winston.format.json()
            ),
            defaultMeta: { service: 'mountain-hut-server' },
            transports: [
                new winston.transports.File({ 
                    filename: 'logs/error.log', 
                    level: 'error',
                    maxsize: 5242880, // 5MB
                    maxFiles: 5
                }),
                new winston.transports.File({ 
                    filename: 'logs/combined.log',
                    maxsize: 5242880, // 5MB
                    maxFiles: 5
                }),
                new winston.transports.Console({
                    format: winston.format.combine(
                        winston.format.colorize(),
                        winston.format.simple()
                    )
                })
            ]
        });
    }

    async initialize() {
        try {
            // Initialize database connection
            await database.initialize();
            this.logger.info('Database initialized successfully');

            // Configure middleware
            this.app.use(helmet({
                contentSecurityPolicy: false // Allow for development flexibility
            }));
            this.app.use(cors({
                origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
                methods: ['GET', 'POST', 'PUT', 'DELETE'],
                allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
            }));
            this.app.use(express.json({ limit: '10mb' }));
            this.app.use(express.urlencoded({ extended: true }));

            // Request logging
            this.app.use((req, res, next) => {
                this.logger.info(`${req.method} ${req.path}`, {
                    ip: req.ip,
                    userAgent: req.get('User-Agent'),
                    query: req.query
                });
                next();
            });

            // API routes
            this.app.use('/health', healthRoutes);
            this.app.use('/api/v1/scraping', scrapingRoutes);
            this.app.use('/api/v1/availability', availabilityRoutes);

            // Root endpoint
            this.app.get('/', (req, res) => {
                res.json({
                    name: 'Mountain Hut Scraper API',
                    version: '1.0.0',
                    status: 'running',
                    timestamp: new Date().toISOString(),
                    endpoints: {
                        health: '/health',
                        scraping: '/api/v1/scraping',
                        availability: '/api/v1/availability'
                    }
                });
            });

            // 404 handler
            this.app.use((req, res) => {
                res.status(404).json({
                    error: 'Endpoint not found',
                    path: req.originalUrl,
                    method: req.method
                });
            });

            // Global error handler (must be last)
            this.app.use(errorHandler(this.logger));

            // Initialize scheduled jobs if enabled
            if (process.env.ENABLE_SCHEDULED_SCRAPING === 'true') {
                await scheduler.initialize(this.logger);
                this.logger.info('Scheduled scraping jobs initialized');
            } else {
                this.logger.info('Scheduled scraping disabled by configuration');
            }

            this.logger.info('Server initialized successfully');
            return true;

        } catch (error) {
            this.logger.error('Failed to initialize server:', error);
            throw error;
        }
    }

    async start() {
        try {
            await this.initialize();
            
            this.server = this.app.listen(this.port, '0.0.0.0', () => {
                this.logger.info(`🚀 Mountain Hut Server running on port ${this.port}`);
                this.logger.info(`📊 Health check: http://localhost:${this.port}/health`);
                this.logger.info(`📖 API docs: http://localhost:${this.port}/`);
            });

            // Graceful shutdown handlers
            process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM'));
            process.on('SIGINT', () => this.gracefulShutdown('SIGINT'));

        } catch (error) {
            this.logger.error('Failed to start server:', error);
            process.exit(1);
        }
    }

    async gracefulShutdown(signal) {
        this.logger.info(`Received ${signal}. Starting graceful shutdown...`);
        
        try {
            // Stop accepting new connections
            if (this.server) {
                this.server.close(async () => {
                    this.logger.info('HTTP server closed');
                    
                    try {
                        // Stop scheduled jobs
                        if (scheduler.isInitialized()) {
                            await scheduler.destroy();
                            this.logger.info('Scheduled jobs stopped');
                        }

                        // Close database connections
                        await database.close();
                        this.logger.info('Database connections closed');

                        this.logger.info('Graceful shutdown completed');
                        process.exit(0);
                    } catch (error) {
                        this.logger.error('Error during graceful shutdown:', error);
                        process.exit(1);
                    }
                });
            }
        } catch (error) {
            this.logger.error('Error during graceful shutdown:', error);
            process.exit(1);
        }

        // Force exit if graceful shutdown takes too long
        setTimeout(() => {
            this.logger.error('Graceful shutdown timeout, forcing exit');
            process.exit(1);
        }, 30000); // 30 seconds timeout
    }

    getApp() {
        return this.app;
    }
}

// Start server if this file is run directly
if (require.main === module) {
    const server = new MountainHutServer();
    server.start().catch((error) => {
        console.error('Failed to start server:', error);
        process.exit(1);
    });
}

module.exports = MountainHutServer;