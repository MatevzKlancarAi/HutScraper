import type { Logger } from '@services/logger/index.ts';
import type {
  BookingMetadata,
  BookingRequest,
  BookingResult,
  BookingStep,
  ProviderConfig,
} from '../../types/index.ts';
import { BaseProvider } from '../providers/BaseProvider.ts';

/**
 * Abstract base class for all bookers
 * Extends BaseProvider with booking-specific functionality
 */
export abstract class BaseBooker extends BaseProvider {
  /**
   * Active booking sessions
   * Track sessions by ID for status queries
   */
  protected sessions = new Map<string, BookingSession>();

  constructor(config: ProviderConfig, logger: Logger) {
    super(config, logger);

    // Validate that this is a booker
    if (config.type !== 'booker' && config.type !== 'both') {
      throw new Error(`Invalid provider type for booker: ${config.type}`);
    }
  }

  /**
   * Book a reservation
   * This is the main method that must be implemented by all bookers
   *
   * @param request Booking request with property, dates, and guest info
   * @returns Booking result with confirmation or error
   */
  abstract book(request: BookingRequest): Promise<BookingResult>;

  /**
   * Cancel a booking session
   * Stop an in-progress booking
   *
   * @param sessionId Session ID to cancel
   */
  async cancelSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.cancelled = true;
      this.sessions.delete(sessionId);
      this.log.info(`Session cancelled: ${sessionId}`);
    }
  }

  /**
   * Get booking session status
   * Returns current steps and their status
   *
   * @param sessionId Session ID to query
   * @returns Array of booking steps
   */
  async getSessionStatus(sessionId: string): Promise<BookingStep[]> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    return session.steps;
  }

  /**
   * Create booking metadata
   * Helper method for consistent metadata creation
   */
  protected createMetadata(startTime: Date): BookingMetadata {
    return {
      startedAt: startTime,
      completedAt: new Date(),
      duration: Date.now() - startTime.getTime(),
      provider: this.metadata.id,
    };
  }

  /**
   * Create a booking session
   * Initialize tracking for a new booking
   */
  protected createSession(sessionId: string): BookingSession {
    const session: BookingSession = {
      id: sessionId,
      steps: [],
      screenshots: [],
      startedAt: new Date(),
      cancelled: false,
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  /**
   * Add a step to the booking session
   */
  protected addStep(sessionId: string, step: Omit<BookingStep, 'timestamp'>): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const fullStep: BookingStep = {
      ...step,
      timestamp: new Date(),
    };

    session.steps.push(fullStep);

    this.log.info(`[${sessionId}] Step: ${step.name} - ${step.status}`, {
      step: step.name,
      status: step.status,
      duration: step.duration,
    });
  }

  /**
   * Add screenshot to session
   */
  protected addScreenshot(sessionId: string, path: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.screenshots.push(path);
    }
  }

  /**
   * Check if session is cancelled
   */
  protected isCancelled(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    return session?.cancelled ?? false;
  }

  /**
   * Log booking activity
   */
  protected logBooking(sessionId: string, action: string, data?: Record<string, unknown>): void {
    this.log.info(`[${sessionId}] ${action}`, data);
  }

  /**
   * Log booking error
   */
  protected logBookingError(
    sessionId: string,
    action: string,
    error: Error,
    data?: Record<string, unknown>
  ): void {
    this.log.error(`[${sessionId}] ${action} failed`, error, data);
  }

  /**
   * Take screenshot during booking
   */
  protected async takeBookingScreenshot(
    page: any,
    sessionId: string,
    step: string
  ): Promise<string | undefined> {
    try {
      const timestamp = Date.now();
      const filename = `booking_${sessionId}_${step}_${timestamp}.png`;
      const path = `./screenshots/booking/${filename}`;

      await page.screenshot({ path, fullPage: false });
      this.addScreenshot(sessionId, path);
      this.log.debug(`Screenshot saved: ${path}`);

      return path;
    } catch (error) {
      this.log.warn('Failed to take screenshot', {
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }
}

/**
 * Internal booking session type
 */
interface BookingSession {
  id: string;
  steps: BookingStep[];
  screenshots: string[];
  startedAt: Date;
  cancelled: boolean;
}
