/**
 * Types for Multi-Hut Orchestration
 */

import type { ScrapeResult } from '../../types/index.ts';

/**
 * Hut to scrape
 */
export interface HutTarget {
  hutId: number;
  hutName: string;
  provider: 'hut-reservation' | 'bentral';
  url: string;
  roomTypes?: string[];
}

/**
 * Orchestration options
 */
export interface OrchestrationOptions {
  /** Number of huts to scrape concurrently (default: 3) */
  concurrency?: number;

  /** Number of retry attempts for failed huts (default: 3) */
  retries?: number;

  /** Delay between batches in milliseconds (default: 10000) */
  delayBetweenBatches?: number;

  /** Delay between individual huts in same batch in milliseconds (default: 0) */
  delayBetweenHuts?: number;

  /** Save results to database (default: true) */
  saveToDatabase?: boolean;

  /** Save results to file (default: false) */
  saveToFile?: boolean;

  /** Date range to scrape */
  dateRange?: {
    start: Date;
    end: Date;
  };
}

/**
 * Scraping result for a single hut
 */
export interface HutScrapeResult {
  hutId: number;
  hutName: string;
  provider: string;
  success: boolean;
  attempts: number;
  duration: number;
  roomTypes: number;
  totalDates: number;
  error?: string;
  result?: ScrapeResult;
}

/**
 * Progress callback data
 */
export interface OrchestrationProgress {
  currentBatch: number;
  totalBatches: number;
  completed: number;
  total: number;
  successful: number;
  failed: number;
  successRate: number;
  currentHut?: string;
}

/**
 * Final orchestration report
 */
export interface OrchestrationReport {
  summary: {
    total: number;
    successful: number;
    failed: number;
    skipped: number;
    successRate: string;
    duration: string;
    avgTimePerHut: string;
    startTime: Date;
    endTime: Date;
  };
  successful: HutScrapeResult[];
  failed: HutScrapeResult[];
  skipped: HutTarget[];
}

/**
 * Progress callback function
 */
export type ProgressCallback = (progress: OrchestrationProgress) => void;
