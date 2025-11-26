import { env } from '@config/env';
import { logger } from '@services/logger';
import { Cron } from 'croner';

export interface Job {
  name: string;
  schedule: string;
  enabled: boolean;
  lastRun?: Date;
  nextRun?: Date;
  status: 'idle' | 'running' | 'error';
  lastError?: string;
  run: () => Promise<void>;
}

export class JobScheduler {
  private static instance: JobScheduler;
  private jobs: Map<string, { job: Job; cron: Cron | null }> = new Map();
  private isRunning = false;

  private constructor() {
    logger.info('JobScheduler initialized');
  }

  static getInstance(): JobScheduler {
    if (!JobScheduler.instance) {
      JobScheduler.instance = new JobScheduler();
    }
    return JobScheduler.instance;
  }

  /**
   * Register a job to the scheduler
   */
  registerJob(job: Job): void {
    if (this.jobs.has(job.name)) {
      logger.warn({ jobName: job.name }, 'Job already registered, skipping');
      return;
    }

    this.jobs.set(job.name, {
      job,
      cron: null,
    });

    logger.info({ jobName: job.name, schedule: job.schedule }, 'Job registered');
  }

  /**
   * Start the scheduler
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('Scheduler already running');
      return;
    }

    logger.info('Starting job scheduler');

    for (const [name, { job }] of this.jobs) {
      if (!job.enabled) {
        logger.info({ jobName: name }, 'Job disabled, skipping');
        continue;
      }

      try {
        const cron = new Cron(
          job.schedule,
          {
            timezone: env.SCHEDULER_TIMEZONE,
            name: job.name,
          },
          async () => {
            await this.executeJob(name);
          }
        );

        // Get next run time
        const nextRun = cron.nextRun();
        if (nextRun) {
          job.nextRun = nextRun;
        }

        this.jobs.get(name)!.cron = cron;

        logger.info(
          {
            jobName: name,
            schedule: job.schedule,
            nextRun: job.nextRun?.toISOString(),
          },
          'Job scheduled'
        );
      } catch (error) {
        logger.error({ jobName: name, error }, 'Failed to schedule job');
      }
    }

    this.isRunning = true;
    logger.info('Job scheduler started');
  }

  /**
   * Stop the scheduler
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      logger.warn('Scheduler not running');
      return;
    }

    logger.info('Stopping job scheduler');

    for (const [name, { cron }] of this.jobs) {
      if (cron) {
        cron.stop();
        logger.info({ jobName: name }, 'Job stopped');
      }
    }

    this.isRunning = false;
    logger.info('Job scheduler stopped');
  }

  /**
   * Execute a job manually
   */
  async executeJob(jobName: string): Promise<void> {
    const jobEntry = this.jobs.get(jobName);
    if (!jobEntry) {
      throw new Error(`Job ${jobName} not found`);
    }

    const { job } = jobEntry;

    if (job.status === 'running') {
      logger.warn({ jobName }, 'Job already running, skipping');
      return;
    }

    try {
      logger.info({ jobName }, 'Executing job');
      job.status = 'running';
      delete job.lastError;

      await job.run();

      job.status = 'idle';
      job.lastRun = new Date();

      // Update next run time
      if (jobEntry.cron) {
        const nextRun = jobEntry.cron.nextRun();
        if (nextRun) {
          job.nextRun = nextRun;
        }
      }

      logger.info({ jobName }, 'Job completed successfully');
    } catch (error) {
      job.status = 'error';
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      job.lastError = errorMessage;
      job.lastRun = new Date();

      logger.error({ jobName, error }, 'Job execution failed');
      throw error;
    }
  }

  /**
   * Get job status
   */
  getJobStatus(jobName: string): Job | undefined {
    const jobEntry = this.jobs.get(jobName);
    return jobEntry?.job;
  }

  /**
   * Get all jobs
   */
  getAllJobs(): Job[] {
    return Array.from(this.jobs.values()).map((entry) => entry.job);
  }

  /**
   * Check if scheduler is running
   */
  isSchedulerRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Pause a job
   */
  pauseJob(jobName: string): void {
    const jobEntry = this.jobs.get(jobName);
    if (!jobEntry) {
      throw new Error(`Job ${jobName} not found`);
    }

    if (jobEntry.cron) {
      jobEntry.cron.pause();
      jobEntry.job.enabled = false;
      logger.info({ jobName }, 'Job paused');
    }
  }

  /**
   * Resume a job
   */
  resumeJob(jobName: string): void {
    const jobEntry = this.jobs.get(jobName);
    if (!jobEntry) {
      throw new Error(`Job ${jobName} not found`);
    }

    if (jobEntry.cron) {
      jobEntry.cron.resume();
      jobEntry.job.enabled = true;

      // Update next run time
      const nextRun = jobEntry.cron.nextRun();
      if (nextRun) {
        jobEntry.job.nextRun = nextRun;
      }

      logger.info({ jobName, nextRun: jobEntry.job.nextRun }, 'Job resumed');
    }
  }
}
