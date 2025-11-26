import type { Browser, BrowserContext, Page } from 'playwright';

/**
 * Browser configuration options
 */
export interface BrowserConfig {
  headless: boolean;
  slowMo: number;
  timeout: number;
  args?: string[];
  viewport?: {
    width: number;
    height: number;
  };
}

/**
 * Screenshot options
 */
export interface ScreenshotOptions {
  path: string;
  fullPage?: boolean;
  quality?: number;
}

/**
 * Navigation options
 */
export interface NavigationOptions {
  timeout?: number;
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
}

/**
 * Browser session that manages a browser context and page
 */
export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  sessionId: string;
}
