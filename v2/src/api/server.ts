import { env } from '@config/env';
import { logger } from '@services/logger';
import { JobScheduler, createScrapeJob } from '@services/scheduler';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger as honoLogger } from 'hono/logger';
import { errorHandler } from './middleware/errorHandler';
import { rateLimiter } from './middleware/rateLimiter';
import { bookingRoutes } from './routes/booking';
import { propertiesRoutes } from './routes/properties';
import { schedulerRoutes } from './routes/scheduler';
import { scrapingRoutes } from './routes/scraping';

const app = new Hono();

// Middleware
app.use('*', cors());
app.use('*', honoLogger());
app.use('*', rateLimiter);

// Health check
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Routes
app.route('/scrape', scrapingRoutes);
app.route('/book', bookingRoutes);
app.route('/properties', propertiesRoutes);
app.route('/scheduler', schedulerRoutes);

// Error handler (must be last)
app.onError(errorHandler);

// Initialize scheduler
let scheduler: JobScheduler | null = null;

if (env.SCHEDULER_ENABLED) {
  scheduler = JobScheduler.getInstance();

  // Register jobs
  const scrapeJob = createScrapeJob();
  scheduler.registerJob(scrapeJob);
  logger.info({ jobName: scrapeJob.name, schedule: scrapeJob.schedule }, 'Scrape job registered');

  // Start scheduler
  scheduler.start();
  logger.info('Job scheduler started');
}

// Start server
const port = env.PORT;
logger.info(`Starting API server on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  if (scheduler) {
    await scheduler.stop();
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT signal received: closing HTTP server');
  if (scheduler) {
    await scheduler.stop();
  }
  process.exit(0);
});
