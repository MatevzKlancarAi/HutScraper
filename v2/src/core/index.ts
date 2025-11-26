/**
 * Core module exports
 * Provides access to all core abstractions and utilities
 */

// Providers
export { BaseProvider } from './providers/BaseProvider.ts';
export { ProviderRegistry, initializeRegistry, getRegistry } from './providers/ProviderRegistry.ts';

// Scraper
export { BaseScraper } from './scraper/BaseScraper.ts';

// Booking
export { BaseBooker } from './booking/BaseBooker.ts';

// Browser
export { BrowserManager } from './browser/BrowserManager.ts';
export type { BrowserConfig, BrowserSession, ScreenshotOptions } from './browser/types.ts';
