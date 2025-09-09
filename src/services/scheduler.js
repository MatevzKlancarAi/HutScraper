const cron = require('node-cron');
const HutManager = require('./hutManager');
const logger = require('./logger');
const config = require('../../config/service.config');

/**
 * Scheduler Service
 * Manages scheduled scraping operations using cron jobs
 */
class Scheduler {
  constructor(options = {}) {
    this.options = {
      timezone: options.timezone || config.scheduler.timezone,
      morningSchedule: options.morningSchedule || config.scheduler.morning,
      eveningSchedule: options.eveningSchedule || config.scheduler.evening,
      ...options
    };
    
    this.jobs = new Map();
    this.hutManager = new HutManager(options.hutManagerOptions || {});
    this.isRunning = false;
  }

  /**
   * Start the scheduled scraping jobs
   */
  start() {
    if (this.isRunning) {
      logger.warn('Scheduler is already running');
      return;
    }

    logger.logSchedulerEvent('starting', {
      morningSchedule: this.options.morningSchedule,
      eveningSchedule: this.options.eveningSchedule,
      timezone: this.options.timezone
    });

    // Schedule morning scraping
    const morningJob = cron.schedule(
      this.options.morningSchedule,
      () => this.runScheduledScraping('morning'),
      {
        scheduled: false,
        timezone: this.options.timezone
      }
    );

    // Schedule evening scraping
    const eveningJob = cron.schedule(
      this.options.eveningSchedule,
      () => this.runScheduledScraping('evening'),
      {
        scheduled: false,
        timezone: this.options.timezone
      }
    );

    // Store jobs for management
    this.jobs.set('morning', morningJob);
    this.jobs.set('evening', eveningJob);

    // Start both jobs
    morningJob.start();
    eveningJob.start();

    this.isRunning = true;
    
    logger.logSchedulerEvent('started', {
      totalJobs: this.jobs.size,
      jobs: ['morning', 'evening']
    });

    // Log next execution times
    this.logNextExecutions();
  }

  /**
   * Stop all scheduled jobs
   */
  stop() {
    if (!this.isRunning) {
      logger.warn('Scheduler is not running');
      return;
    }

    logger.logSchedulerEvent('stopping');

    this.jobs.forEach((job, name) => {
      job.stop();
      logger.logSchedulerEvent('job_stopped', { jobName: name });
    });

    this.jobs.clear();
    this.isRunning = false;
    
    logger.logSchedulerEvent('stopped');
  }

  /**
   * Run a manual scraping job
   */
  async runManualScraping(hutId = null, roomTypes = null) {
    logger.logSchedulerEvent('manual_scraping_started', { hutId, roomTypes });
    
    try {
      let result;
      
      if (hutId) {
        result = await this.hutManager.scrapeHut(hutId, roomTypes);
      } else {
        result = await this.hutManager.scrapeAllHuts();
      }

      logger.logSchedulerEvent('manual_scraping_completed', {
        hutId,
        success: true,
        summary: result.summary
      });

      return result;
    } catch (error) {
      logger.logSchedulerEvent('manual_scraping_failed', {
        hutId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Internal method to run scheduled scraping
   */
  async runScheduledScraping(schedule) {
    const startTime = Date.now();
    
    logger.logSchedulerEvent('scheduled_scraping_started', { schedule });

    try {
      const result = await this.hutManager.scrapeAllHuts();
      const duration = Date.now() - startTime;

      logger.logSchedulerEvent('scheduled_scraping_completed', {
        schedule,
        duration: Math.round(duration / 1000),
        summary: result.summary
      });

      // Send success notification if configured
      await this.sendNotification('success', {
        schedule,
        summary: result.summary,
        duration
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.logSchedulerEvent('scheduled_scraping_failed', {
        schedule,
        duration: Math.round(duration / 1000),
        error: error.message
      });

      // Send failure notification
      await this.sendNotification('failure', {
        schedule,
        error: error.message,
        duration
      });

      throw error;
    }
  }

  /**
   * Send notifications (placeholder for future implementation)
   */
  async sendNotification(type, details) {
    // This is a placeholder for notification system
    // Can be extended to send emails, Slack messages, etc.
    
    if (type === 'failure' && config.notifications.enableOnFailure) {
      logger.warn('Scraping failure notification would be sent', details);
    } else if (type === 'success' && config.notifications.enableOnSuccess) {
      logger.info('Scraping success notification would be sent', details);
    }
  }

  /**
   * Get scheduler status
   */
  getStatus() {
    const jobs = [];
    
    this.jobs.forEach((job, name) => {
      // Get next execution time
      let nextExecution = null;
      try {
        const schedule = name === 'morning' ? this.options.morningSchedule : this.options.eveningSchedule;
        // This is a simplified next execution calculation
        // In a real implementation, you'd want to use a more robust cron parser
        nextExecution = 'Next execution calculated';
      } catch (error) {
        nextExecution = 'Unable to calculate';
      }

      jobs.push({
        name,
        schedule: name === 'morning' ? this.options.morningSchedule : this.options.eveningSchedule,
        running: job.running,
        nextExecution
      });
    });

    return {
      isRunning: this.isRunning,
      totalJobs: this.jobs.size,
      timezone: this.options.timezone,
      jobs
    };
  }

  /**
   * Update job schedules
   */
  updateSchedule(jobName, newSchedule) {
    if (!this.jobs.has(jobName)) {
      throw new Error(`Job '${jobName}' not found`);
    }

    // Validate cron expression
    if (!cron.validate(newSchedule)) {
      throw new Error(`Invalid cron expression: ${newSchedule}`);
    }

    // Stop existing job
    const existingJob = this.jobs.get(jobName);
    existingJob.stop();

    // Create new job with updated schedule
    const newJob = cron.schedule(
      newSchedule,
      () => this.runScheduledScraping(jobName),
      {
        scheduled: false,
        timezone: this.options.timezone
      }
    );

    // Update options and restart
    if (jobName === 'morning') {
      this.options.morningSchedule = newSchedule;
    } else if (jobName === 'evening') {
      this.options.eveningSchedule = newSchedule;
    }

    this.jobs.set(jobName, newJob);
    newJob.start();

    logger.logSchedulerEvent('schedule_updated', {
      jobName,
      newSchedule,
      timezone: this.options.timezone
    });
  }

  /**
   * Log next execution times
   */
  logNextExecutions() {
    // This is a placeholder for logging next execution times
    // In a production implementation, you'd use a proper cron parser
    logger.info('Scheduled jobs configured', {
      morning: this.options.morningSchedule,
      evening: this.options.eveningSchedule,
      timezone: this.options.timezone
    });
  }

  /**
   * Validate cron expression
   */
  static validateCronExpression(expression) {
    return cron.validate(expression);
  }

  /**
   * Get available timezones (placeholder)
   */
  static getAvailableTimezones() {
    return [
      'Europe/Ljubljana',
      'Europe/Vienna',
      'Europe/Rome',
      'UTC',
      'Europe/London',
      'America/New_York'
    ];
  }
}

module.exports = Scheduler;