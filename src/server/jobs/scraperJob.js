const MultiHutScraper = require('../../multiHutScraper');
const database = require('../../services/database');

class ScraperJob {
    constructor(logger) {
        this.logger = logger;
        this.isRunning = false;
        this.lastRun = null;
        this.lastResult = null;
        this.runCount = 0;
    }

    async execute(options = {}) {
        if (this.isRunning) {
            const message = 'Scraper job already running, skipping this execution';
            this.logger.warn(message);
            return { 
                success: false, 
                message,
                skipped: true 
            };
        }

        this.isRunning = true;
        const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const startTime = new Date();
        
        this.logger.info(`Starting scraper job ${jobId}`, { 
            options,
            scheduled: options.scheduled || false
        });

        try {
            // Configure scraper options
            const scraperOptions = {
                maxConcurrency: parseInt(process.env.SCRAPER_MAX_CONCURRENCY) || 2,
                delayBetweenHuts: parseInt(process.env.SCRAPER_DELAY_HUTS) || 5000,
                delayBetweenRooms: parseInt(process.env.SCRAPER_DELAY_ROOMS) || 2000,
                testMode: options.testMode || false,
                targetHuts: options.targetHuts || null,
                headless: process.env.NODE_ENV === 'production' ? true : 
                         (process.env.HEADLESS_MODE === 'true'),
                manageDatabaseConnection: false, // Don't close database in server mode
                ...options
            };

            this.logger.info('Initializing MultiHutScraper', { 
                jobId,
                options: scraperOptions 
            });

            // Create and run scraper
            const scraper = new MultiHutScraper(scraperOptions);
            const result = await scraper.scrapeAllHuts();

            const endTime = new Date();
            const duration = endTime - startTime;

            // Log results
            const logData = {
                jobId,
                duration: `${Math.round(duration / 1000)}s`,
                hutsProcessed: result.hutsProcessed,
                roomTypesProcessed: result.roomTypesProcessed,
                totalAvailableDates: result.totalAvailableDates,
                errors: result.errors?.length || 0,
                success: result.errors?.length === 0
            };

            if (result.errors?.length > 0) {
                this.logger.warn('Scraper job completed with errors', {
                    ...logData,
                    errorDetails: result.errors
                });
            } else {
                this.logger.info('Scraper job completed successfully', logData);
            }

            // Update job state
            this.lastRun = endTime;
            this.lastResult = {
                ...result,
                jobId,
                startTime,
                endTime,
                duration,
                success: result.errors?.length === 0
            };
            this.runCount++;

            return {
                success: result.errors?.length === 0,
                result: this.lastResult,
                message: result.errors?.length > 0 ? 
                    `Completed with ${result.errors.length} errors` : 
                    'Completed successfully'
            };

        } catch (error) {
            const endTime = new Date();
            const duration = endTime - startTime;

            this.logger.error('Scraper job failed', {
                jobId,
                error: error.message,
                stack: error.stack,
                duration: `${Math.round(duration / 1000)}s`
            });

            this.lastRun = endTime;
            this.lastResult = {
                jobId,
                startTime,
                endTime,
                duration,
                success: false,
                error: error.message,
                hutsProcessed: 0,
                roomTypesProcessed: 0,
                totalAvailableDates: 0
            };
            this.runCount++;

            return {
                success: false,
                result: this.lastResult,
                error: error.message,
                message: 'Job failed with error'
            };

        } finally {
            this.isRunning = false;
        }
    }

    async executeWithRetries(options = {}, maxRetries = 3) {
        const retryDelay = parseInt(process.env.SCRAPER_RETRY_DELAY) || 300000; // 5 minutes
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            this.logger.info(`Scraper job attempt ${attempt}/${maxRetries}`);
            
            const result = await this.execute({
                ...options,
                attempt
            });

            if (result.success || result.skipped) {
                return result;
            }

            if (attempt < maxRetries) {
                this.logger.warn(`Scraper job attempt ${attempt} failed, retrying in ${retryDelay/1000}s`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
            } else {
                this.logger.error(`Scraper job failed after ${maxRetries} attempts`);
                
                // Send notification if configured
                await this.sendFailureNotification(result);
                
                return result;
            }
        }
    }

    async sendFailureNotification(result) {
        try {
            // Email notification (if configured)
            const alertEmail = process.env.ALERT_EMAIL;
            if (alertEmail) {
                this.logger.info(`Sending failure notification to ${alertEmail}`);
                // TODO: Implement email notification
            }

            // Slack notification (if configured)
            const slackWebhook = process.env.SLACK_WEBHOOK_URL;
            if (slackWebhook) {
                this.logger.info('Sending Slack notification');
                // TODO: Implement Slack notification
            }

        } catch (error) {
            this.logger.error('Failed to send failure notification', {
                error: error.message
            });
        }
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            lastRun: this.lastRun,
            lastResult: this.lastResult,
            runCount: this.runCount,
            nextScheduled: null // Will be set by scheduler
        };
    }

    async getDetailedStatus() {
        try {
            // Get database statistics
            const stats = await database.getScrapingStats();
            
            // Get properties count
            const propertiesResult = await database.query(`
                SELECT COUNT(*) as count 
                FROM availability.properties 
                WHERE is_active = true
            `);
            
            const totalProperties = parseInt(propertiesResult.rows[0].count);

            return {
                ...this.getStatus(),
                statistics: {
                    totalProperties,
                    scrapingStats: stats,
                    databaseStatus: database.getHealthStatus()
                }
            };
        } catch (error) {
            this.logger.error('Failed to get detailed status', {
                error: error.message
            });
            
            return {
                ...this.getStatus(),
                error: 'Failed to get detailed status'
            };
        }
    }
}

module.exports = ScraperJob;