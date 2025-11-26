import { logger } from '@services/logger';
import { JobScheduler } from '@services/scheduler';
import { Hono } from 'hono';

const app = new Hono();

// Get scheduler status
app.get('/status', (c) => {
  const scheduler = JobScheduler.getInstance();
  const jobs = scheduler.getAllJobs();

  return c.json({
    isRunning: scheduler.isSchedulerRunning(),
    jobs: jobs.map((job) => ({
      name: job.name,
      schedule: job.schedule,
      enabled: job.enabled,
      status: job.status,
      lastRun: job.lastRun?.toISOString(),
      nextRun: job.nextRun?.toISOString(),
      lastError: job.lastError,
    })),
  });
});

// Get specific job status
app.get('/jobs/:jobName', (c) => {
  const jobName = c.req.param('jobName');
  const scheduler = JobScheduler.getInstance();
  const job = scheduler.getJobStatus(jobName);

  if (!job) {
    return c.json({ error: 'Job not found' }, 404);
  }

  return c.json({
    name: job.name,
    schedule: job.schedule,
    enabled: job.enabled,
    status: job.status,
    lastRun: job.lastRun?.toISOString(),
    nextRun: job.nextRun?.toISOString(),
    lastError: job.lastError,
  });
});

// Manually trigger a job
app.post('/jobs/:jobName/trigger', async (c) => {
  const jobName = c.req.param('jobName');
  const scheduler = JobScheduler.getInstance();

  try {
    logger.info({ jobName }, 'Manually triggering job');
    await scheduler.executeJob(jobName);

    return c.json({
      message: `Job ${jobName} triggered successfully`,
      jobName,
    });
  } catch (error) {
    logger.error({ jobName, error }, 'Failed to trigger job');
    throw error;
  }
});

// Pause a job
app.post('/jobs/:jobName/pause', (c) => {
  const jobName = c.req.param('jobName');
  const scheduler = JobScheduler.getInstance();

  try {
    scheduler.pauseJob(jobName);

    return c.json({
      message: `Job ${jobName} paused`,
      jobName,
    });
  } catch (error) {
    logger.error({ jobName, error }, 'Failed to pause job');
    throw error;
  }
});

// Resume a job
app.post('/jobs/:jobName/resume', (c) => {
  const jobName = c.req.param('jobName');
  const scheduler = JobScheduler.getInstance();

  try {
    scheduler.resumeJob(jobName);

    return c.json({
      message: `Job ${jobName} resumed`,
      jobName,
    });
  } catch (error) {
    logger.error({ jobName, error }, 'Failed to resume job');
    throw error;
  }
});

export { app as schedulerRoutes };
