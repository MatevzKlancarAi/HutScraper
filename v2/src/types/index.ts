/**
 * Core type definitions used throughout the application
 */

/**
 * Date range for scraping/booking
 */
export interface DateRange {
  start: Date;
  end: Date;
}

/**
 * Availability status for a date
 */
export type AvailabilityStatus =
  | 'available'
  | 'unavailable'
  | 'partial_no_start'
  | 'partial_no_end'
  | 'disabled'
  | 'old'
  | 'new';

/**
 * Date availability information
 */
export interface DateAvailability {
  date: Date;
  status: AvailabilityStatus;
  canCheckin: boolean;
  canCheckout: boolean;
  price?: number;
  currency?: string;
}

/**
 * Room type availability
 */
export interface RoomTypeAvailability {
  roomTypeId?: number;
  roomTypeName: string;
  externalId?: string;
  capacity?: number;
  dates: DateAvailability[];
}

/**
 * Scrape request
 */
export interface ScrapeRequest {
  propertyId: number;
  propertyName: string;
  url: string;
  dateRange: DateRange;
  roomTypes?: string[];
  options?: ScrapeOptions;
}

/**
 * Scrape options
 */
export interface ScrapeOptions {
  screenshots?: boolean;
  retries?: number;
  timeout?: number;
  delay?: number;
}

/**
 * Scrape result
 */
export interface ScrapeResult {
  propertyId: number;
  propertyName: string;
  roomTypes: RoomTypeAvailability[];
  metadata: ScrapeMetadata;
}

/**
 * Scrape metadata
 */
export interface ScrapeMetadata {
  scrapedAt: Date;
  duration: number;
  provider: string;
  success: boolean;
  error?: string;
}

/**
 * Booking guest information
 */
export interface BookingGuest {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  country: string;
}

/**
 * Booking request
 */
export interface BookingRequest {
  sessionId: string;
  propertyId: number;
  propertyName: string;
  roomTypeId: number;
  roomTypeName: string;
  dateRange: {
    checkin: Date;
    checkout: Date;
  };
  guest: BookingGuest;
  options?: BookingOptions;
}

/**
 * Booking options
 */
export interface BookingOptions {
  dryRun?: boolean;
  autoSolveCaptcha?: boolean;
  screenshots?: boolean;
  timeout?: number;
}

/**
 * Booking step
 */
export interface BookingStep {
  name: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  timestamp: Date;
  duration?: number;
  error?: string;
  screenshot?: string;
}

/**
 * Booking result
 */
export interface BookingResult {
  sessionId: string;
  status: 'success' | 'failed' | 'pending';
  confirmationNumber?: string;
  error?: string;
  steps: BookingStep[];
  screenshots: string[];
  metadata: BookingMetadata;
}

/**
 * Booking metadata
 */
export interface BookingMetadata {
  startedAt: Date;
  completedAt?: Date;
  duration?: number;
  provider: string;
}

/**
 * Provider capability flags
 */
export interface ProviderCapabilities {
  scraping?: ScraperCapability;
  booking?: BookerCapability;
}

/**
 * Scraper capability details
 */
export interface ScraperCapability {
  supportsDateRange: boolean;
  supportsRoomTypes: boolean;
  maxConcurrency: number;
  rateLimit?: {
    requests: number;
    perSeconds: number;
  };
}

/**
 * Booker capability details
 */
export interface BookerCapability {
  supportsCaptcha: boolean;
  supportsPayment: boolean;
  requiresAuth: boolean;
}

/**
 * Provider metadata
 */
export interface ProviderMetadata {
  id: string;
  name: string;
  version: string;
  type: 'scraper' | 'booker' | 'both';
  capabilities: ProviderCapabilities;
}

/**
 * Provider configuration
 */
export interface ProviderConfig {
  name: string;
  type: 'scraper' | 'booker' | 'both';
  enabled: boolean;
  settings: Record<string, unknown>;
}

/**
 * Browser configuration
 */
export interface BrowserConfig {
  headless: boolean;
  slowMo: number;
  timeout: number;
  args?: string[];
}

/**
 * Result wrapper with success/error handling
 */
export type Result<T, E = Error> = { success: true; data: T } | { success: false; error: E };

/**
 * Create success result
 */
export function success<T>(data: T): Result<T> {
  return { success: true, data };
}

/**
 * Create error result
 */
export function failure<E = Error>(error: E): Result<never, E> {
  return { success: false, error };
}
