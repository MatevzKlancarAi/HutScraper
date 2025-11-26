import type { ProviderConfig } from '@/types';
import { hutReservationConfig } from '@config/providers/hut-reservation';
import { MultiHutOrchestrator } from '@core/orchestration/MultiHutOrchestrator';
import type { HutTarget, OrchestrationReport } from '@core/orchestration/types';
import type { BaseScraper } from '@core/scraper/BaseScraper';
import { BentralProvider } from '@providers/bentral/BentralProvider';
import { HutReservationProvider } from '@providers/hut-reservation';
import { logger } from '@services/logger';
import { Hono } from 'hono';
import { z } from 'zod';

const app = new Hono();

// Provider factory function
function createProvider(providerType: string): BaseScraper | null {
  const config: ProviderConfig = {
    name: providerType,
    type: 'scraper',
    enabled: true,
    settings: {},
  };

  switch (providerType) {
    case 'hut-reservation':
      return new HutReservationProvider(config, logger);
    case 'bentral':
      return new BentralProvider(config, logger);
    default:
      return null;
  }
}

// In-memory job tracking
const jobs = new Map<
  string,
  {
    id: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    startedAt: Date;
    completedAt?: Date;
    report?: OrchestrationReport;
    error?: string;
    progress?: {
      total: number;
      completed: number;
      failed: number;
      successRate: number;
    };
  }
>();

const scrapeRequestSchema = z.object({
  provider: z.enum(['hut-reservation', 'bentral']).optional(),
  hutIds: z.array(z.number()).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  concurrency: z.number().min(1).max(10).optional(),
});

app.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const params = scrapeRequestSchema.parse(body);

    const jobId = `scrape-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Create job record
    jobs.set(jobId, {
      id: jobId,
      status: 'pending',
      startedAt: new Date(),
    });

    // Start scraping asynchronously
    (async () => {
      try {
        const job = jobs.get(jobId)!;
        job.status = 'running';

        // Determine which huts to scrape
        const targets: HutTarget[] = [];

        if (params.hutIds && params.hutIds.length > 0) {
          // Scrape specific huts
          const provider = params.provider || 'hut-reservation';
          for (const hutId of params.hutIds) {
            targets.push({
              hutId,
              hutName: `Hut ${hutId}`,
              provider,
              url: `https://www.hut-reservation.org/reservation/book-hut/${hutId}/wizard`,
            });
          }
        } else if (params.provider === 'hut-reservation' || !params.provider) {
          // Scrape test huts from hut-reservation
          const testTargets = Object.entries(hutReservationConfig.testHuts).map(
            ([_country, hutInfo]) => ({
              hutId: hutInfo.id,
              hutName: hutInfo.name,
              provider: 'hut-reservation' as const,
              url: `https://www.hut-reservation.org/reservation/book-hut/${hutInfo.id}/wizard`,
            })
          );
          targets.push(...testTargets);
        }

        if (targets.length === 0) {
          throw new Error('No huts to scrape');
        }

        logger.info({ jobId, hutCount: targets.length }, 'Starting scrape job');

        // Create orchestrator
        const orchestratorOptions: {
          concurrency: number;
          retries: number;
          delayBetweenBatches: number;
          saveToDatabase: boolean;
          saveToFile: boolean;
          dateRange?: {
            start: Date;
            end: Date;
          };
        } = {
          concurrency: params.concurrency || 3,
          retries: 3,
          delayBetweenBatches: 10000,
          saveToDatabase: true,
          saveToFile: false,
        };

        if (params.startDate && params.endDate) {
          orchestratorOptions.dateRange = {
            start: new Date(params.startDate),
            end: new Date(params.endDate),
          };
        }

        const orchestrator = new MultiHutOrchestrator(
          createProvider,
          logger,
          null,
          orchestratorOptions
        );

        // Run with progress tracking
        const report = await orchestrator.scrapeAll(targets, (progress) => {
          job.progress = {
            total: progress.total,
            completed: progress.completed,
            failed: progress.failed,
            successRate: progress.successRate,
          };
        });

        job.status = 'completed';
        job.completedAt = new Date();
        job.report = report;

        logger.info({ jobId, report: report.summary }, 'Scrape job completed');
      } catch (error) {
        const job = jobs.get(jobId)!;
        job.status = 'failed';
        job.completedAt = new Date();
        job.error = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ jobId, error }, 'Scrape job failed');
      }
    })();

    return c.json({
      jobId,
      message: 'Scraping job started',
      statusUrl: `/scrape/status/${jobId}`,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to start scraping job');
    throw error;
  }
});

app.get('/status/:jobId', (c) => {
  const jobId = c.req.param('jobId');
  const job = jobs.get(jobId);

  if (!job) {
    return c.json({ error: 'Job not found' }, 404);
  }

  return c.json(job);
});

app.get('/jobs', (c) => {
  const limit = Number.parseInt(c.req.query('limit') || '10');
  const allJobs = Array.from(jobs.values())
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
    .slice(0, limit);

  return c.json({
    jobs: allJobs,
    total: jobs.size,
  });
});

export { app as scrapingRoutes };
