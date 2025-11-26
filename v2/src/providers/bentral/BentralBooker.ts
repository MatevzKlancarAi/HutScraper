/**
 * Bentral Booking Provider
 * Automates booking for mountain huts using the Bentral/Microgramm booking system
 *
 * Implements 4-step booking flow:
 * 1. Login (HTTP Basic Auth or form-based)
 * 2. Select hut
 * 3. Select room type and dates (in Bentral iframe)
 * 4. Fill guest information and solve captcha
 */

import { scraperConfig } from '@config/scraper.ts';
import { BaseBooker } from '@core/booking/BaseBooker.ts';
import { BrowserManager } from '@core/browser/BrowserManager.ts';
import { CaptchaSolver } from '@services/captcha/index.ts';
import type { CaptchaSolverConfig } from '@services/captcha/index.ts';
import type { Logger } from '@services/logger/index.ts';
import { sleep } from '@utils/sleep.ts';
import type { FrameLocator, Page } from 'playwright';
import type {
  BookingRequest,
  BookingResult,
  ProviderConfig,
  ProviderMetadata,
} from '../../types/index.ts';

/**
 * Bentral booker configuration
 */
export interface BentralBookerConfig {
  loginUrl: string;
  auth?: {
    username: string;
    password: string;
  };
  captcha?: CaptchaSolverConfig;
  delays?: {
    afterInput?: number;
    afterLogin?: number;
    afterRoomSelection?: number;
    beforeSubmit?: number;
  };
}

/**
 * BentralBooker class
 * Handles automated booking for Bentral-based mountain hut systems
 */
export class BentralBooker extends BaseBooker {
  metadata: ProviderMetadata = {
    id: 'bentral-booker',
    name: 'Bentral Booking Provider',
    version: '2.0.0',
    type: 'booker',
    capabilities: {
      booking: {
        supportsCaptcha: true,
        supportsPayment: false,
        requiresAuth: true,
      },
    },
  };

  private bookerConfig: BentralBookerConfig;
  private browserManager: BrowserManager;
  private sessionId: string;
  private captchaSolver: CaptchaSolver | null = null;

  constructor(providerConfig: ProviderConfig, logger: Logger, config: BentralBookerConfig) {
    super(providerConfig, logger);

    this.bookerConfig = {
      delays: {
        afterInput: 100,
        afterLogin: 500,
        afterRoomSelection: 300,
        beforeSubmit: 1000,
      },
      captcha: {
        startNumber: 0,
        maxNumber: 20,
        delayBetweenAttempts: 500,
      },
      ...config,
    };

    this.sessionId = `bentral-booking-${Date.now()}`;
    this.browserManager = new BrowserManager(scraperConfig.browser, logger);
  }

  /**
   * Initialize the booker
   * Sets up browser, page, and captcha solver
   */
  async initialize(): Promise<void> {
    this.log.info('Initializing Bentral booker');
    await this.browserManager.createSession(this.sessionId);

    const session = this.browserManager.getSession(this.sessionId);
    if (!session) {
      throw new Error('Failed to create browser session');
    }

    // Initialize captcha solver
    this.captchaSolver = new CaptchaSolver(
      session.page,
      this.logger,
      this.bookerConfig.captcha || {
        startNumber: 0,
        maxNumber: 20,
        delayBetweenAttempts: 500,
      }
    );

    this.log.info('Bentral booker initialized');
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.log.info('Cleaning up Bentral booker');
    this.captchaSolver = null;
    await this.browserManager.closeSession(this.sessionId);
    this.log.info('Bentral booker cleaned up');
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const session = this.browserManager.getSession(this.sessionId);
      return session !== undefined && session.page !== null;
    } catch {
      return false;
    }
  }

  /**
   * Book a reservation
   * Main booking flow implementation
   */
  async book(request: BookingRequest): Promise<BookingResult> {
    const startTime = new Date();
    const bookingSessionId = request.sessionId;

    try {
      this.logBooking(bookingSessionId, `Starting booking process for ${request.propertyName}`);

      // Create booking session
      const session = this.createSession(bookingSessionId);

      // Get browser session
      const browserSession = this.browserManager.getSession(this.sessionId);
      if (!browserSession) {
        throw new Error('Browser session not initialized. Call initialize() first.');
      }

      const page = browserSession.page;

      // Step 1: Login
      this.addStep(bookingSessionId, {
        name: 'login',
        status: 'in_progress',
      });

      await this.login(bookingSessionId, page);

      this.addStep(bookingSessionId, {
        name: 'login',
        status: 'completed',
        duration: Date.now() - startTime.getTime(),
      });

      // Step 2: Select hut
      this.addStep(bookingSessionId, {
        name: 'select_hut',
        status: 'in_progress',
      });

      await this.selectHut(bookingSessionId, page, request.propertyName);

      this.addStep(bookingSessionId, {
        name: 'select_hut',
        status: 'completed',
        duration: Date.now() - startTime.getTime(),
      });

      // Step 3: Select room type and dates
      this.addStep(bookingSessionId, {
        name: 'select_room_and_dates',
        status: 'in_progress',
      });

      await this.selectRoomType(bookingSessionId, page, request.roomTypeName);
      await this.selectDates(bookingSessionId, page, {
        start: request.dateRange.checkin,
        end: request.dateRange.checkout,
      });

      this.addStep(bookingSessionId, {
        name: 'select_room_and_dates',
        status: 'completed',
        duration: Date.now() - startTime.getTime(),
      });

      // Step 4: Proceed to booking form
      this.addStep(bookingSessionId, {
        name: 'proceed_to_form',
        status: 'in_progress',
      });

      await this.proceedToNextStep(bookingSessionId, page);

      this.addStep(bookingSessionId, {
        name: 'proceed_to_form',
        status: 'completed',
        duration: Date.now() - startTime.getTime(),
      });

      // Step 5: Fill guest information
      this.addStep(bookingSessionId, {
        name: 'fill_guest_info',
        status: 'in_progress',
      });

      await this.fillGuestInfo(bookingSessionId, page, request.guest);

      this.addStep(bookingSessionId, {
        name: 'fill_guest_info',
        status: 'completed',
        duration: Date.now() - startTime.getTime(),
      });

      // Step 6: Solve captcha
      this.addStep(bookingSessionId, {
        name: 'solve_captcha',
        status: 'in_progress',
      });

      await this.solveCaptcha(bookingSessionId, page);

      this.addStep(bookingSessionId, {
        name: 'solve_captcha',
        status: 'completed',
        duration: Date.now() - startTime.getTime(),
      });

      // Check if dry-run mode
      if (request.options?.dryRun) {
        this.logBooking(bookingSessionId, 'Dry-run mode: Stopping before submission');

        const result: BookingResult = {
          sessionId: bookingSessionId,
          status: 'pending',
          steps: session.steps,
          screenshots: session.screenshots,
          metadata: this.createMetadata(startTime),
        };

        return result;
      }

      // Step 7: Submit booking
      this.addStep(bookingSessionId, {
        name: 'submit_booking',
        status: 'in_progress',
      });

      const confirmationNumber = await this.submitBooking(bookingSessionId, page);

      this.addStep(bookingSessionId, {
        name: 'submit_booking',
        status: 'completed',
        duration: Date.now() - startTime.getTime(),
      });

      // Success
      const result: BookingResult = {
        sessionId: bookingSessionId,
        status: 'success',
        ...(confirmationNumber && { confirmationNumber }),
        steps: session.steps,
        screenshots: session.screenshots,
        metadata: this.createMetadata(startTime),
      };

      this.logBooking(
        bookingSessionId,
        `Booking completed successfully${confirmationNumber ? ` with confirmation ${confirmationNumber}` : ''}`
      );

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logBookingError(bookingSessionId, 'Booking failed', error as Error);

      const session = this.sessions.get(bookingSessionId);

      const result: BookingResult = {
        sessionId: bookingSessionId,
        status: 'failed',
        error: errorMessage,
        steps: session?.steps || [],
        screenshots: session?.screenshots || [],
        metadata: this.createMetadata(startTime),
      };

      return result;
    }
  }

  /**
   * Login to the booking system
   * Supports both HTTP Basic Auth and form-based authentication
   */
  private async login(sessionId: string, page: Page): Promise<void> {
    try {
      this.logBooking(sessionId, `Starting login to ${this.bookerConfig.loginUrl}`);

      // Set HTTP Basic Auth if credentials are provided
      if (this.bookerConfig.auth) {
        const authHeader =
          'Basic ' +
          Buffer.from(
            `${this.bookerConfig.auth.username}:${this.bookerConfig.auth.password}`
          ).toString('base64');

        await page.setExtraHTTPHeaders({
          Authorization: authHeader,
        });
      }

      // Navigate to login URL
      await page.goto(this.bookerConfig.loginUrl, {
        waitUntil: 'networkidle',
        timeout: 30000,
      });

      await sleep(this.bookerConfig.delays?.afterInput || 100);

      // Check if we're already authenticated (hut selection page)
      const bodyText = await page.textContent('body');
      if (bodyText?.includes('Nastanitveni objekti')) {
        this.logBooking(sessionId, 'Authenticated via HTTP Basic Auth');
        await this.takeBookingScreenshot(page, sessionId, 'auth_success');
        return;
      }

      // Look for traditional login form
      const usernameField = page.locator('input[name="username"], input[type="text"]').first();

      if (
        (await usernameField.isVisible({ timeout: 2000 }).catch(() => false)) &&
        this.bookerConfig.auth
      ) {
        await usernameField.fill(this.bookerConfig.auth.username);
        await sleep(this.bookerConfig.delays?.afterInput || 100);

        const passwordField = page
          .locator('input[name="password"], input[type="password"]')
          .first();
        await passwordField.fill(this.bookerConfig.auth.password);
        await sleep(this.bookerConfig.delays?.afterInput || 100);

        const loginButton = page.locator('button[type="submit"], input[type="submit"]').first();
        await loginButton.click();

        await sleep(this.bookerConfig.delays?.afterLogin || 500);

        this.logBooking(sessionId, 'Logged in via form');
        await this.takeBookingScreenshot(page, sessionId, 'login_success');
        return;
      }

      throw new Error('Neither HTTP Basic Auth nor login form succeeded');
    } catch (error) {
      await this.takeBookingScreenshot(page, sessionId, 'login_error');
      throw error;
    }
  }

  /**
   * Select hut from the list
   */
  private async selectHut(sessionId: string, page: Page, hutName: string): Promise<void> {
    try {
      this.logBooking(sessionId, `Selecting hut: ${hutName}`);

      // Find all links on the page
      const links = page.locator('a');
      const count = await links.count();

      let found = false;

      for (let i = 0; i < count; i++) {
        const link = links.nth(i);
        const text = (await link.textContent()) || '';

        // Check if link text matches hut name (case-insensitive partial match)
        if (
          text.toLowerCase().includes(hutName.toLowerCase()) ||
          hutName.toLowerCase().includes(text.toLowerCase())
        ) {
          this.logBooking(sessionId, `Found matching hut link: ${text}`);
          await link.click();
          found = true;
          break;
        }
      }

      if (!found) {
        // Fallback: click first available hut link
        const firstLink = links.first();
        if (await firstLink.isVisible({ timeout: 1000 }).catch(() => false)) {
          const text = await firstLink.textContent();
          this.logBooking(sessionId, `No exact match, using first hut: ${text}`);
          await firstLink.click();
          found = true;
        }
      }

      if (!found) {
        throw new Error(`Hut "${hutName}" not found`);
      }

      await sleep(100);
      await this.takeBookingScreenshot(page, sessionId, 'hut_selected');
    } catch (error) {
      await this.takeBookingScreenshot(page, sessionId, 'hut_selection_error');
      throw error;
    }
  }

  /**
   * Select room type in Bentral iframe
   */
  private async selectRoomType(sessionId: string, page: Page, roomTypeName: string): Promise<void> {
    try {
      this.logBooking(sessionId, `Selecting room type: ${roomTypeName}`);

      // Wait for Bentral iframe to load
      await sleep(300);
      await page.waitForSelector('iframe[src*="bentral.com"]', { timeout: 6000 });

      // Get iframe context
      const frame = page.frameLocator('iframe[src*="bentral.com"]');
      this.logBooking(sessionId, 'Found Bentral iframe');

      // Wait for room dropdown
      const roomSelect = frame.locator('select[name="unit[]"]').first();
      await roomSelect.waitFor({ state: 'visible', timeout: 6000 });
      await sleep(200);

      // Get the room value (external ID) for the selected room type
      const roomOptions = roomSelect.locator('option');
      const optionCount = await roomOptions.count();

      let selectedValue: string | null = null;

      for (let i = 0; i < optionCount; i++) {
        const option = roomOptions.nth(i);
        const text = (await option.textContent()) || '';

        if (text.toLowerCase().includes(roomTypeName.toLowerCase())) {
          selectedValue = (await option.getAttribute('value')) || null;
          break;
        }
      }

      if (!selectedValue) {
        // Default to first option if no match
        selectedValue = (await roomOptions.first().getAttribute('value')) || null;
        this.logBooking(sessionId, 'No matching room type, using first option');
      }

      if (!selectedValue) {
        throw new Error('No room type options found');
      }

      // Select the room
      await roomSelect.selectOption(selectedValue);
      await sleep(500);

      // Verify selection
      const selectedValueVerify = await roomSelect.inputValue();
      if (selectedValueVerify !== selectedValue) {
        // Retry once
        await sleep(1000);
        await roomSelect.selectOption(selectedValue);
        await sleep(500);

        const retryValue = await roomSelect.inputValue();
        if (retryValue !== selectedValue) {
          throw new Error('Room selection failed after retry');
        }
      }

      this.logBooking(sessionId, `Room type selected: ${selectedValue}`);
      await this.takeBookingScreenshot(page, sessionId, 'room_selected');
    } catch (error) {
      await this.takeBookingScreenshot(page, sessionId, 'room_selection_error');
      throw error;
    }
  }

  /**
   * Select booking dates using calendar
   */
  private async selectDates(
    sessionId: string,
    page: Page,
    dateRange: { start: Date; end: Date }
  ): Promise<void> {
    try {
      this.logBooking(
        sessionId,
        `Selecting dates: ${dateRange.start.toISOString().split('T')[0]} to ${dateRange.end.toISOString().split('T')[0]}`
      );

      const frame = page.frameLocator('iframe[src*="bentral.com"]');

      // Open calendar
      await this.openCalendar(frame);

      // Select check-in date
      await this.navigateToMonth(
        frame,
        this.getMonthName(dateRange.start.getMonth() + 1, dateRange.start.getFullYear())
      );
      await this.selectDay(frame, dateRange.start.getDate());
      await sleep(200);

      // Select check-out date
      const checkoutMonthName = this.getMonthName(
        dateRange.end.getMonth() + 1,
        dateRange.end.getFullYear()
      );
      const checkinMonthName = this.getMonthName(
        dateRange.start.getMonth() + 1,
        dateRange.start.getFullYear()
      );

      if (checkoutMonthName !== checkinMonthName) {
        await this.navigateToMonth(frame, checkoutMonthName);
      }

      await this.selectDay(frame, dateRange.end.getDate());

      this.logBooking(sessionId, 'Dates selected');
      await this.takeBookingScreenshot(page, sessionId, 'dates_selected');
    } catch (error) {
      await this.takeBookingScreenshot(page, sessionId, 'date_selection_error');
      throw error;
    }
  }

  /**
   * Open calendar picker
   */
  private async openCalendar(frame: FrameLocator): Promise<void> {
    const arrivalInput = frame.locator('input[name="formated_arrival"]').first();
    await arrivalInput.click();
    await sleep(300);
  }

  /**
   * Navigate to specific month in calendar
   */
  private async navigateToMonth(frame: FrameLocator, targetMonth: string): Promise<void> {
    let currentMonth = await frame.locator('.datepicker-switch').first().textContent();
    let attempts = 0;
    const maxAttempts = 24;

    while (currentMonth && !currentMonth.includes(targetMonth) && attempts < maxAttempts) {
      await frame.locator('.datepicker-days .next').first().click();
      await sleep(200);
      currentMonth = await frame.locator('.datepicker-switch').first().textContent();
      attempts++;
    }

    if (!currentMonth?.includes(targetMonth)) {
      throw new Error(`Could not navigate to ${targetMonth} after ${maxAttempts} attempts`);
    }
  }

  /**
   * Select a day in the calendar
   */
  private async selectDay(frame: FrameLocator, day: number): Promise<void> {
    const dayElements = frame.locator('.datepicker-days td');
    const dayCount = await dayElements.count();

    for (let i = 0; i < dayCount; i++) {
      const dayElement = dayElements.nth(i);
      const dayText = await dayElement.textContent();
      const classes = (await dayElement.getAttribute('class')) || '';

      if (dayText && Number.parseInt(dayText.trim()) === day) {
        // Check if day is available (same logic as scraper)
        if (
          classes.includes('day') &&
          !classes.includes('old') &&
          !classes.includes('new') &&
          !classes.includes('disabled')
        ) {
          await dayElement.click();
          await sleep(200);
          return;
        }
      }
    }

    throw new Error(`Could not find available day ${day} in calendar`);
  }

  /**
   * Get Slovenian month name
   */
  private getMonthName(month: number, year: number): string {
    const monthNames = [
      'Januar',
      'Februar',
      'Marec',
      'April',
      'Maj',
      'Junij',
      'Julij',
      'Avgust',
      'September',
      'Oktober',
      'November',
      'December',
    ];
    return `${monthNames[month - 1]} ${year}`;
  }

  /**
   * Proceed to next step (booking form)
   */
  private async proceedToNextStep(sessionId: string, page: Page): Promise<void> {
    try {
      this.logBooking(sessionId, 'Proceeding to next step');

      const frame = page.frameLocator('iframe[src*="bentral.com"]');

      // Look for next/continue button
      const nextButtonSelectors = [
        '.btn-primary',
        'button[type="submit"]',
        'input[type="submit"]',
        'button:has-text("Naslednji")',
        'button:has-text("Naprej")',
        'button:has-text("Continue")',
      ];

      let buttonFound = false;

      for (const selector of nextButtonSelectors) {
        try {
          const button = frame.locator(selector).first();
          if (await button.isVisible({ timeout: 1000 })) {
            await button.click();
            buttonFound = true;
            await sleep(300);
            this.logBooking(sessionId, `Clicked next step button: ${selector}`);
            break;
          }
        } catch {
          continue;
        }
      }

      if (!buttonFound) {
        this.logBooking(sessionId, 'No next button found, may already be on form page');
      }

      await this.takeBookingScreenshot(page, sessionId, 'after_next_step');

      // Fill the form that appears after proceeding
      await this.fillStepForm(sessionId, frame);
    } catch (error) {
      await this.takeBookingScreenshot(page, sessionId, 'proceed_next_error');
      throw error;
    }
  }

  /**
   * Fill guest information form
   */
  private async fillGuestInfo(
    sessionId: string,
    page: Page,
    guest: BookingRequest['guest']
  ): Promise<void> {
    try {
      this.logBooking(sessionId, 'Filling guest information');

      const frame = page.frameLocator('iframe[src*="bentral.com"]');

      // This will be called multiple times as we navigate through steps
      // We'll fill any visible fields at each step
      await this.fillStepForm(sessionId, frame, guest);

      this.logBooking(sessionId, 'Guest information filled');
    } catch (error) {
      this.logBookingError(sessionId, 'Failed to fill guest info', error as Error);
      // Don't throw - continue anyway
    }
  }

  /**
   * Fill form fields that appear in current step
   */
  private async fillStepForm(
    sessionId: string,
    frame: FrameLocator,
    guest?: BookingRequest['guest']
  ): Promise<void> {
    const guestName = guest ? `${guest.firstName} ${guest.lastName}` : 'John Doe';
    const email = guest?.email || 'test@example.com';
    const phone = guest?.phone || '+386 40 123 456';
    const country = guest?.country || 'Slovenia';

    // Name field
    const nameInput = frame.locator('input[name="name"]').first();
    if (await nameInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      const currentValue = await nameInput.inputValue();
      if (!currentValue) {
        await nameInput.fill(guestName);
        this.logBooking(sessionId, 'Filled name field');
      }
    }

    // Email field
    const emailInput = frame.locator('input[name="email"]').first();
    if (await emailInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      const currentValue = await emailInput.inputValue();
      if (!currentValue) {
        await emailInput.fill(email);
        this.logBooking(sessionId, 'Filled email field');
      }
    }

    // Country dropdown (fill first to prevent clearing phone)
    const countrySelect = frame.locator('select[name="country"]').first();
    if (await countrySelect.isVisible({ timeout: 1000 }).catch(() => false)) {
      const options = countrySelect.locator('option');
      const optionCount = await options.count();

      for (let i = 0; i < optionCount; i++) {
        const option = options.nth(i);
        const text = (await option.textContent()) || '';

        if (
          text.toLowerCase().includes(country.toLowerCase()) ||
          text.toLowerCase().includes('slovenia') ||
          text.toLowerCase().includes('slovenija')
        ) {
          await countrySelect.selectOption({ index: i });
          this.logBooking(sessionId, `Selected country: ${text}`);
          break;
        }
      }
      await sleep(200);
    }

    // Phone type dropdown
    const phoneTypeSelect = frame.locator('select[name="phone_type"]').first();
    if (await phoneTypeSelect.isVisible({ timeout: 1000 }).catch(() => false)) {
      const options = phoneTypeSelect.locator('option');
      const optionCount = await options.count();

      for (let i = 0; i < optionCount; i++) {
        const option = options.nth(i);
        const text = (await option.textContent()) || '';

        if (text.toLowerCase().includes('mobilni') || text.toLowerCase().includes('mobile')) {
          await phoneTypeSelect.selectOption({ index: i });
          this.logBooking(sessionId, 'Selected phone type: mobile');
          break;
        }
      }
      await sleep(200);
    }

    // Phone number (fill last to prevent clearing)
    const phoneInput = frame.locator('input[name="phone_number"]').first();
    if (await phoneInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      const currentValue = await phoneInput.inputValue();
      if (!currentValue || currentValue !== phone) {
        await phoneInput.click();
        await phoneInput.fill('');
        await sleep(100);
        await phoneInput.pressSequentially(phone, { delay: 20 });
        await sleep(200);

        const actualValue = await phoneInput.inputValue();
        if (actualValue !== phone) {
          // Retry with type
          await phoneInput.click();
          await phoneInput.fill('');
          await sleep(100);
          await phoneInput.type(phone, { delay: 30 });
          await sleep(200);
        }

        this.logBooking(sessionId, 'Filled phone field');
      }
    }

    // Message/note textarea
    const messageTextarea = frame.locator('textarea[name="note"]').first();
    if (await messageTextarea.isVisible({ timeout: 1000 }).catch(() => false)) {
      const currentValue = await messageTextarea.inputValue();
      if (!currentValue) {
        await messageTextarea.fill('Hvala za rezervacijo.');
        this.logBooking(sessionId, 'Filled message note');
      }
    }

    // Arrival time if available
    const arrivalTimeSelect = frame.locator('select[name="arrival_time"]').first();
    if (await arrivalTimeSelect.isVisible({ timeout: 1000 }).catch(() => false)) {
      const options = arrivalTimeSelect.locator('option');
      const optionCount = await options.count();

      for (let i = 0; i < optionCount; i++) {
        const option = options.nth(i);
        const text = (await option.textContent()) || '';

        if (text.includes('15:00') || text.includes('14:00')) {
          await arrivalTimeSelect.selectOption({ index: i });
          this.logBooking(sessionId, `Selected arrival time: ${text}`);
          break;
        }
      }
    }

    // Payment method selection (ponudbo/inquiry)
    await this.selectPaymentMethod(sessionId, frame);

    // Check required checkboxes
    const checkboxes = frame.locator('input[type="checkbox"]');
    const checkboxCount = await checkboxes.count();

    for (let i = 0; i < checkboxCount; i++) {
      const checkbox = checkboxes.nth(i);
      if (await checkbox.isVisible({ timeout: 1000 }).catch(() => false)) {
        const isRequired = await checkbox.getAttribute('required');
        const isChecked = await checkbox.isChecked();

        if (isRequired && !isChecked) {
          await checkbox.check();
          this.logBooking(sessionId, 'Checked required checkbox');
        }
      }
    }

    await sleep(300);
  }

  /**
   * Select payment method (ponudbo/inquiry)
   */
  private async selectPaymentMethod(sessionId: string, frame: FrameLocator): Promise<void> {
    try {
      const allRadios = frame.locator('input[type="radio"]');
      const radioCount = await allRadios.count().catch(() => 0);

      if (radioCount === 0) {
        this.logBooking(sessionId, 'No payment method radio buttons found');
        return;
      }

      for (let i = 0; i < radioCount; i++) {
        const radio = allRadios.nth(i);
        const value = (await radio.getAttribute('value').catch(() => '')) || '';
        const parentText =
          (await radio
            .locator('..')
            .textContent()
            .catch(() => '')) || '';

        // Look for "ponudbo", "inquiry", "drugo" (offer/other)
        const textToCheck = `${value} ${parentText}`.toLowerCase();

        if (
          textToCheck.includes('ponudbo') ||
          textToCheck.includes('inquiry') ||
          textToCheck.includes('drugo') ||
          textToCheck.includes('offer')
        ) {
          try {
            await radio.scrollIntoViewIfNeeded({ timeout: 1000 }).catch(() => {});

            // Try multiple selection approaches
            let success = false;

            // Approach 1: Standard check
            try {
              await radio.check({ timeout: 2000 });
              await sleep(200);
              if (await radio.isChecked().catch(() => false)) {
                success = true;
              }
            } catch {
              // Continue to next approach
            }

            // Approach 2: Force click
            if (!success) {
              try {
                await radio.click({ force: true, timeout: 2000 });
                await sleep(200);
                if (await radio.isChecked().catch(() => false)) {
                  success = true;
                }
              } catch {
                // Continue to next approach
              }
            }

            // Approach 3: JavaScript
            if (!success) {
              try {
                await radio.evaluate((el: HTMLInputElement) => {
                  const radios =
                    el.form?.querySelectorAll<HTMLInputElement>(`input[name="${el.name}"]`) ||
                    document.querySelectorAll<HTMLInputElement>(`input[name="${el.name}"]`);
                  Array.from(radios).forEach((r) => {
                    r.checked = false;
                  });
                  el.checked = true;
                  for (const eventType of ['click', 'change', 'input']) {
                    el.dispatchEvent(new Event(eventType, { bubbles: true }));
                  }
                });
                await sleep(300);
                if (await radio.isChecked().catch(() => false)) {
                  success = true;
                }
              } catch {
                // Final approach failed
              }
            }

            if (success) {
              this.logBooking(sessionId, 'Selected payment method: ponudbo');
              return;
            }
          } catch {
            continue;
          }
        }
      }

      this.logBooking(sessionId, 'Payment method selection completed or not required');
    } catch (error) {
      this.logBooking(sessionId, 'Payment method selection not critical, continuing');
    }
  }

  /**
   * Solve captcha
   */
  private async solveCaptcha(sessionId: string, page: Page): Promise<number | null> {
    if (!this.captchaSolver) throw new Error('Captcha solver not initialized');

    try {
      this.logBooking(sessionId, 'Starting captcha solving');

      await this.takeBookingScreenshot(page, sessionId, 'captcha_before');

      const answer = await this.captchaSolver.solve();

      if (answer === null) {
        throw new Error('Failed to solve captcha');
      }

      this.logBooking(sessionId, `Captcha solved with answer: ${answer}`);

      await sleep(this.bookerConfig.delays?.beforeSubmit || 1000);
      await this.takeBookingScreenshot(page, sessionId, 'captcha_solved');

      return answer;
    } catch (error) {
      await this.takeBookingScreenshot(page, sessionId, 'captcha_error');
      throw error;
    }
  }

  /**
   * Submit the booking form
   */
  private async submitBooking(sessionId: string, page: Page): Promise<string | undefined> {
    try {
      this.logBooking(sessionId, 'Submitting booking');

      const frame = page.frameLocator('iframe[src*="bentral.com"]');

      // Find submit button
      const submitButton = frame
        .locator(
          'button[type="submit"], input[type="submit"], button:has-text("Potrdi"), button:has-text("Submit")'
        )
        .first();

      await submitButton.click();
      await sleep(300);

      // Check for success or error messages
      const successSelectors = [
        '.success',
        '.alert-success',
        '*:has-text("Uspešno")',
        '*:has-text("Success")',
      ];

      const errorSelectors = [
        '.error',
        '.alert-danger',
        '*:has-text("Napaka")',
        '*:has-text("Error")',
      ];

      let confirmationNumber: string | undefined;

      for (const selector of successSelectors) {
        const successElement = frame.locator(selector).first();
        if (await successElement.isVisible({ timeout: 2000 }).catch(() => false)) {
          const successText = (await successElement.textContent()) || '';
          this.logBooking(sessionId, `Booking submitted successfully: ${successText}`);

          // Try to extract confirmation number
          const confirmationMatch = successText.match(/\d{6,}/);
          if (confirmationMatch) {
            confirmationNumber = confirmationMatch[0];
          }

          await this.takeBookingScreenshot(page, sessionId, 'booking_success');
          return confirmationNumber;
        }
      }

      for (const selector of errorSelectors) {
        const errorElement = frame.locator(selector).first();
        if (await errorElement.isVisible({ timeout: 2000 }).catch(() => false)) {
          const errorText = (await errorElement.textContent()) || '';
          await this.takeBookingScreenshot(page, sessionId, 'booking_error');
          throw new Error(`Booking submission failed: ${errorText}`);
        }
      }

      // Assume success if no clear error
      this.logBooking(sessionId, 'Booking submitted (no confirmation message)');
      await this.takeBookingScreenshot(page, sessionId, 'booking_submitted');

      return confirmationNumber;
    } catch (error) {
      await this.takeBookingScreenshot(page, sessionId, 'submit_error');
      throw error;
    }
  }
}
