import type { ProviderConfig } from '@/types';
import { env } from '@config/env';
import { hutReservationConfig } from '@config/providers/hut-reservation';
import { MultiHutOrchestrator } from '@core/orchestration/MultiHutOrchestrator';
import type { HutTarget } from '@core/orchestration/types';
import type { BaseScraper } from '@core/scraper/BaseScraper';
import { BentralProvider } from '@providers/bentral/BentralProvider';
import { HutReservationProvider } from '@providers/hut-reservation';
import { ScrapePersistence, database } from '@services/database';
import { logger } from '@services/logger';
import type { Job } from '../JobScheduler';

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

/**
 * Daily scrape job
 * Scrapes all configured huts and saves to database
 */
export class ScrapeJob implements Job {
  name = 'daily-scrape';
  schedule: string;
  enabled: boolean;
  status: 'idle' | 'running' | 'error' = 'idle';
  lastRun?: Date;
  nextRun?: Date;
  lastError?: string;

  constructor() {
    this.schedule = env.SCHEDULER_CRON_SCRAPING;
    this.enabled = env.SCHEDULER_ENABLED;
  }

  async run(): Promise<void> {
    logger.info('Starting scheduled scrape job');

    try {
      // Get all huts to scrape
      // For now, we'll scrape the test huts from hut-reservation
      // TODO: Add configuration for which huts to scrape daily
      const targets: HutTarget[] = Object.entries(hutReservationConfig.testHuts).map(
        ([_country, hutInfo]) => ({
          hutId: hutInfo.id,
          hutName: hutInfo.name,
          provider: 'hut-reservation' as const,
          url: `https://www.hut-reservation.org/reservation/book-hut/${hutInfo.id}/wizard`,
        })
      );

      logger.info({ hutCount: targets.length }, 'Scraping huts');

      // Create persistence layer
      const persistence = new ScrapePersistence(database, logger);

      // Create orchestrator
      const orchestrator = new MultiHutOrchestrator(createProvider, logger, persistence, {
        concurrency: env.SCRAPER_MAX_CONCURRENCY,
        retries: 3,
        delayBetweenBatches: 10000,
        saveToDatabase: true,
        saveToFile: false,
        dateRange: {
          start: new Date(),
          end: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
        },
      });

      // Run with progress tracking
      const report = await orchestrator.scrapeAll(targets, (progress) => {
        logger.info(
          {
            completed: progress.completed,
            failed: progress.failed,
            total: progress.total,
            percentage: Math.round((progress.completed / progress.total) * 100),
          },
          'Scrape progress'
        );
      });

      logger.info(
        {
          successful: report.summary.successful,
          failed: report.summary.failed,
          skipped: report.summary.skipped,
          duration: report.summary.duration,
        },
        'Scheduled scrape job completed'
      );

      // Log any failures
      if (report.failed.length > 0) {
        logger.warn(
          {
            failed: report.failed.map((f) => ({
              hut: f.hutName,
              error: f.error,
            })),
          },
          'Some huts failed to scrape'
        );
      }
    } catch (error) {
      logger.error({ error }, 'Scheduled scrape job failed');
      throw error;
    }
  }
}

/**
 * Create and return the scrape job instance
 */
export function createScrapeJob(): ScrapeJob {
  return new ScrapeJob();
}
