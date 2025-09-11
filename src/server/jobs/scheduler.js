const cron = require('node-cron');
const ScraperJob = require('./scraperJob');

class JobScheduler {
    constructor() {
        this.jobs = new Map();
        this.scraperJob = null;
        this.logger = null;
        this.initialized = false;
    }

    async initialize(logger) {
        if (this.initialized) {
            return;
        }

        this.logger = logger;
        this.scraperJob = new ScraperJob(logger);

        // Schedule morning scraping job
        const morningSchedule = process.env.SCRAPE_CRON_MORNING || '0 6 * * *'; // 6 AM daily
        this.scheduleJob('morning-scrape', morningSchedule, async () => {
            this.logger.info('Executing scheduled morning scraping job');
            await this.scraperJob.executeWithRetries(
                { 
                    scheduled: true, 
                    type: 'morning',
                    testMode: false // Full scrape for scheduled jobs
                },
                parseInt(process.env.MAX_SCRAPE_RETRIES) || 3
            );
        });

        // Schedule evening scraping job
        const eveningSchedule = process.env.SCRAPE_CRON_EVENING || '0 18 * * *'; // 6 PM daily
        this.scheduleJob('evening-scrape', eveningSchedule, async () => {
            this.logger.info('Executing scheduled evening scraping job');
            await this.scraperJob.executeWithRetries(
                { 
                    scheduled: true, 
                    type: 'evening',
                    testMode: false // Full scrape for scheduled jobs
                },
                parseInt(process.env.MAX_SCRAPE_RETRIES) || 3
            );
        });

        // Optional: Schedule weekly maintenance job (cleanup old logs, etc.)
        if (process.env.ENABLE_MAINTENANCE_JOB === 'true') {
            const maintenanceSchedule = process.env.MAINTENANCE_CRON || '0 2 * * 0'; // 2 AM on Sundays
            this.scheduleJob('maintenance', maintenanceSchedule, async () => {
                this.logger.info('Executing scheduled maintenance job');
                await this.runMaintenanceJob();
            });
        }

        this.initialized = true;
        
        this.logger.info('Job scheduler initialized', {
            jobs: Array.from(this.jobs.keys()),
            morningSchedule,
            eveningSchedule,
            timezone: process.env.TZ || 'UTC'
        });
    }

    scheduleJob(name, schedule, task) {
        try {
            // Validate cron expression
            if (!cron.validate(schedule)) {
                throw new Error(`Invalid cron expression: ${schedule}`);
            }

            // Stop existing job if it exists
            if (this.jobs.has(name)) {
                this.jobs.get(name).destroy();
                this.logger.info(`Stopped existing job: ${name}`);
            }

            // Create new scheduled job
            const job = cron.schedule(schedule, async () => {
                try {
                    await task();
                } catch (error) {
                    this.logger.error(`Scheduled job '${name}' failed`, {
                        error: error.message,
                        stack: error.stack
                    });
                }
            }, {
                scheduled: true,
                timezone: process.env.TZ || 'UTC'
            });

            this.jobs.set(name, job);
            
            this.logger.info(`Scheduled job '${name}'`, {
                schedule,
                timezone: process.env.TZ || 'UTC',
                nextRun: this.getNextRunTime(schedule)
            });

            return job;
        } catch (error) {
            this.logger.error(`Failed to schedule job '${name}'`, {
                schedule,
                error: error.message
            });
            throw error;
        }
    }

    async runMaintenanceJob() {
        try {
            this.logger.info('Starting maintenance job');

            // Clean up old log files (if needed)
            // Clean up old scraping data (if configured)
            // Database maintenance tasks

            this.logger.info('Maintenance job completed');
        } catch (error) {
            this.logger.error('Maintenance job failed', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    getNextRunTime(cronExpression) {
        try {
            // Simple next run calculation (cron.schedule doesn't expose this easily)
            const now = new Date();
            const nextRun = new Date(now);
            
            // This is a simplified version - in production you might want to use a library like 'cron-parser'
            const [minute, hour, day, month, weekday] = cronExpression.split(' ');
            
            if (hour !== '*') {
                nextRun.setHours(parseInt(hour));
                nextRun.setMinutes(parseInt(minute || 0));
                nextRun.setSeconds(0);
                
                if (nextRun <= now) {
                    nextRun.setDate(nextRun.getDate() + 1);
                }
            }
            
            return nextRun.toISOString();
        } catch (error) {
            return 'Unable to calculate';
        }
    }

    async triggerManualScrape(options = {}) {
        if (!this.scraperJob) {
            throw new Error('Scheduler not initialized');
        }

        this.logger.info('Triggering manual scrape', { options });
        
        return await this.scraperJob.executeWithRetries(
            {
                ...options,
                scheduled: false,
                manual: true
            },
            options.maxRetries || parseInt(process.env.MAX_SCRAPE_RETRIES) || 1
        );
    }

    getJobStatus() {
        if (!this.scraperJob) {
            return { error: 'Scheduler not initialized' };
        }

        const jobsStatus = {};
        for (const [name, job] of this.jobs.entries()) {
            jobsStatus[name] = {
                running: job.getStatus ? job.getStatus() : 'scheduled',
                // Add next run time if available
            };
        }

        const scraperStatus = this.scraperJob.getStatus();
        
        return {
            initialized: this.initialized,
            scraperJob: {
                ...scraperStatus,
                nextScheduled: {
                    morning: this.getNextRunTime(process.env.SCRAPE_CRON_MORNING || '0 6 * * *'),
                    evening: this.getNextRunTime(process.env.SCRAPE_CRON_EVENING || '0 18 * * *')
                }
            },
            scheduledJobs: jobsStatus,
            activeJobsCount: this.jobs.size
        };
    }

    async getDetailedStatus() {
        if (!this.scraperJob) {
            return { error: 'Scheduler not initialized' };
        }

        const basicStatus = this.getJobStatus();
        const detailedScraperStatus = await this.scraperJob.getDetailedStatus();

        return {
            ...basicStatus,
            scraperJob: detailedScraperStatus
        };
    }

    stopJob(name) {
        if (!this.jobs.has(name)) {
            throw new Error(`Job '${name}' not found`);
        }

        const job = this.jobs.get(name);
        job.destroy();
        this.jobs.delete(name);
        
        this.logger.info(`Stopped job: ${name}`);
        return true;
    }

    stopAllJobs() {
        for (const [name, job] of this.jobs.entries()) {
            job.destroy();
        }
        
        this.jobs.clear();
        this.logger.info('Stopped all scheduled jobs');
    }

    async destroy() {
        this.stopAllJobs();
        this.initialized = false;
        this.logger.info('Job scheduler destroyed');
    }

    isInitialized() {
        return this.initialized;
    }
}

module.exports = new JobScheduler();