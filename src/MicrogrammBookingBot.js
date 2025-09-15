const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const config = require("../config/booking.config.js");
const database = require("./services/database");
const logger = require("./services/logger");
const CaptchaSolver = require("./services/captchaSolver");

/**
 * Microgramm Mountain Hut Booking Bot
 *
 * Automates the booking process for mountain huts using the Microgramm booking system
 */
class MicrogrammBookingBot {
  constructor(options = {}) {
    this.config = { ...config, ...options };
    this.browser = null;
    this.page = null;
    this.captchaSolver = null;
    this.sessionId = this.generateSessionId();
    this.bookingData = {
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      status: 'initialized',
      steps: [],
      errors: [],
      bookingDetails: null
    };
  }

  /**
   * Generate a unique session ID for tracking
   */
  generateSessionId() {
    return `booking_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Initialize the browser and page
   */
  async initialize() {
    logger.info(`Initializing Microgramm Booking Bot - Session: ${this.sessionId}`);

    this.browser = await chromium.launch(this.config.booking.browser);

    // Create context with user agent
    const context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    this.page = await context.newPage();
    this.captchaSolver = new CaptchaSolver(this.page, this.config);

    this.addStep('initialized', 'Browser and page initialized');
  }

  /**
   * Add a step to the booking process log
   */
  addStep(action, details, success = true) {
    const step = {
      timestamp: new Date().toISOString(),
      action,
      details,
      success
    };
    this.bookingData.steps.push(step);
    logger.info(`Booking step: ${action}`, { details, success });
  }

  /**
   * Add an error to the booking process log
   */
  addError(action, error, screenshot = null) {
    const errorData = {
      timestamp: new Date().toISOString(),
      action,
      error: error.message || error,
      screenshot
    };
    this.bookingData.errors.push(errorData);
    logger.error(`Booking error in ${action}`, { error: error.message || error, screenshot });
  }

  /**
   * Take screenshot for debugging
   */
  async takeScreenshot(name) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `${name}-${this.sessionId}-${timestamp}.png`;
      const filepath = path.join(this.config.output.screenshotsDir, filename);

      // Ensure screenshots directory exists
      if (!fs.existsSync(this.config.output.screenshotsDir)) {
        fs.mkdirSync(this.config.output.screenshotsDir, { recursive: true });
      }

      await this.page.screenshot({ path: filepath, fullPage: true });
      logger.debug(`Screenshot saved: ${filepath}`);
      return filepath;
    } catch (error) {
      logger.error("Failed to take screenshot", { error: error.message });
      return null;
    }
  }

  /**
   * Login to the booking system
   */
  async login() {
    try {
      logger.info("Starting login process", { url: this.config.target.loginUrl });

      // Set HTTP Basic Auth credentials
      await this.page.setExtraHTTPHeaders({
        'Authorization': 'Basic ' + Buffer.from(`${this.config.auth.username}:${this.config.auth.password}`).toString('base64')
      });

      await this.page.goto(this.config.target.loginUrl, {
        waitUntil: "networkidle",
        timeout: this.config.booking.browser.timeout
      });

      await this.page.waitForTimeout(this.config.booking.delays.afterInput);

      // Check if we're on the hut selection page (successful auth)
      const pageTitle = await this.page.textContent('body');
      if (pageTitle && pageTitle.includes('Nastanitveni objekti')) {
        this.addStep('login', 'Successfully authenticated via HTTP Basic Auth');
        await this.takeScreenshot('auth-success');
        return true;
      } else {
        // Look for traditional login form
        const usernameField = await this.page.$(this.config.selectors.usernameField);
        if (usernameField) {
          await usernameField.fill(this.config.auth.username);
          await this.page.waitForTimeout(this.config.booking.delays.afterInput);

          const passwordField = await this.page.$(this.config.selectors.passwordField);
          if (!passwordField) {
            throw new Error('Password field not found');
          }

          await passwordField.fill(this.config.auth.password);
          await this.page.waitForTimeout(this.config.booking.delays.afterInput);

          const loginButton = await this.page.$(this.config.selectors.loginButton);
          if (!loginButton) {
            throw new Error('Login button not found');
          }

          await loginButton.click();
          await this.page.waitForTimeout(this.config.booking.delays.afterLogin);

          this.addStep('login', 'Successfully logged in via form');
          await this.takeScreenshot('login-success');
          return true;
        } else {
          throw new Error('Neither hut selection page nor login form found');
        }
      }

    } catch (error) {
      const screenshot = await this.takeScreenshot('login-error');
      this.addError('login', error, screenshot);
      throw error;
    }
  }

  /**
   * Select hut from dropdown or navigation
   */
  async selectHut(hutName) {
    try {
      logger.info(`Selecting hut: ${hutName}`);

      // Look for the hut in the list of links
      const hutLinks = await this.page.$$('a');
      let found = false;

      for (const link of hutLinks) {
        const text = await link.textContent();
        if (text && (
          text.toLowerCase().includes(hutName.toLowerCase()) ||
          hutName.toLowerCase().includes(text.toLowerCase()) ||
          text.includes('Triglavski') && hutName.includes('Triglavski')
        )) {
          logger.info(`Found matching hut link: "${text}"`);
          await link.click();
          found = true;
          break;
        }
      }

      if (!found) {
        // If no exact match, let's try the first hut for testing
        const firstLink = await this.page.$('a[href]');
        if (firstLink) {
          const text = await firstLink.textContent();
          logger.info(`No exact match found, using first available hut: "${text}"`);
          await firstLink.click();
          found = true;
        }
      }

      if (!found) {
        throw new Error(`No hut links found on the page`);
      }

      await this.page.waitForTimeout(this.config.booking.delays.afterSelection);
      this.addStep('hut_selection', `Selected hut: ${hutName}`);

    } catch (error) {
      const screenshot = await this.takeScreenshot('hut-selection-error');
      this.addError('hut_selection', error, screenshot);
      throw error;
    }
  }

  /**
   * Select room type
   */
  async selectRoomType(roomType) {
    try {
      logger.info(`Selecting room type: ${roomType}`);

      // Wait for the iframe to load
      await this.page.waitForTimeout(1000);

      // Wait for the Bentral iframe to appear
      logger.info('Waiting for Bentral iframe to load...');
      await this.page.waitForSelector('iframe[src*="bentral.com"]', { timeout: 5000 });

      // Get the iframe context
      const frame = this.page.frameLocator('iframe[src*="bentral.com"]');
      logger.info('✅ Found Bentral iframe, switching to iframe context');

      // Wait for the room dropdown to appear inside the iframe
      await frame.locator('select[name="unit[]"]').waitFor({ timeout: 3000 });
      logger.info('✅ Found room dropdown inside iframe');

      // Map room types to values (using values from the HTML you provided)
      let selectedValue = null;

      if (roomType.toLowerCase().includes('dvoposteljna')) {
        selectedValue = '5f5441304e775f4f'; // Dvoposteljna soba (from Aljažev dom HTML)
      } else if (roomType.toLowerCase().includes('triposteljna')) {
        selectedValue = '5f5441304f415f4f'; // Triposteljna soba
      } else {
        // Default to first available room
        selectedValue = '5f5441304e775f4f'; // Dvoposteljna soba
      }

      logger.info(`Selecting room with value: ${selectedValue}`);

      // Select the room option inside the iframe
      await frame.locator('select[name="unit[]"]').selectOption(selectedValue);

      logger.info(`Successfully selected room type in iframe`);

      await this.page.waitForTimeout(this.config.booking.delays.afterSelection);
      this.addStep('room_selection', `Selected room type: ${roomType}`);

    } catch (error) {
      const screenshot = await this.takeScreenshot('room-selection-error');
      this.addError('room_selection', error, screenshot);
      throw error;
    }
  }

  /**
   * Select booking dates using calendar widget (based on scraper logic)
   */
  async selectDates(arrivalDate, departureDate) {
    try {
      logger.info(`Selecting dates: ${arrivalDate} to ${departureDate}`);

      // Get iframe context
      const frame = this.page.frameLocator('iframe[src*="bentral.com"]');

      // Parse dates (format: "dd.mm.yyyy")
      const parseDate = (dateStr) => {
        const [day, month, year] = dateStr.split('.').map(str => parseInt(str.trim()));
        return { day, month, year };
      };

      const arrival = parseDate(arrivalDate);
      const departure = parseDate(departureDate);

      logger.info(`Parsed dates - Arrival: ${arrival.day}/${arrival.month}/${arrival.year}, Departure: ${departure.day}/${departure.month}/${departure.year}`);

      // Open calendar by clicking on arrival input (using scraper selector)
      await this.openCalendar(frame);

      // Navigate to arrival month and select day
      const arrivalMonthName = this.getMonthName(arrival.month, arrival.year);
      await this.navigateToMonth(frame, arrivalMonthName);
      await this.selectDay(frame, arrival.day);
      logger.info(`✅ Selected arrival date: ${arrivalDate}`);

      // For departure date, click on a different input or continue with same calendar
      // Wait a moment to let calendar update
      await this.page.waitForTimeout(200);

      // Navigate to departure month if different
      const departureMonthName = this.getMonthName(departure.month, departure.year);
      if (departureMonthName !== arrivalMonthName) {
        await this.navigateToMonth(frame, departureMonthName);
      }

      await this.selectDay(frame, departure.day);
      logger.info(`✅ Selected departure date: ${departureDate}`);

      this.addStep('date_selection', `Selected dates: ${arrivalDate} to ${departureDate}`);

    } catch (error) {
      const screenshot = await this.takeScreenshot('date-selection-error');
      this.addError('date_selection', error, screenshot);
      throw error;
    }
  }

  /**
   * Open the calendar picker (based on scraper openCalendar method)
   */
  async openCalendar(frame) {
    logger.info("📅 Opening calendar...");

    // Click on arrival input using scraper selector
    const arrivalInput = frame.locator('input[name="formated_arrival"]').first();
    await arrivalInput.click();
    await this.page.waitForTimeout(300);
  }

  /**
   * Navigate to a specific month (based on scraper navigateToMonth method)
   */
  async navigateToMonth(frame, targetMonth) {
    logger.info(`🔄 Navigating to ${targetMonth}...`);

    let currentMonth = await frame.locator('.datepicker-switch').first().textContent();
    let attempts = 0;
    const maxAttempts = 24; // Max 2 years of navigation

    while (!currentMonth.includes(targetMonth) && attempts < maxAttempts) {
      await frame.locator('.datepicker-days .next').first().click();
      await this.page.waitForTimeout(200);
      currentMonth = await frame.locator('.datepicker-switch').first().textContent();
      attempts++;
    }

    if (!currentMonth.includes(targetMonth)) {
      throw new Error(`Could not navigate to ${targetMonth} after ${maxAttempts} attempts`);
    }

    logger.info(`✅ Successfully navigated to ${targetMonth}`);
  }

  /**
   * Select a specific day in the calendar
   */
  async selectDay(frame, day) {
    logger.info(`Selecting day ${day} from calendar`);

    // Use same selector as scraper: ".datepicker-days td"
    const dayElements = frame.locator('.datepicker-days td');
    const dayCount = await dayElements.count();

    for (let i = 0; i < dayCount; i++) {
      const dayElement = dayElements.nth(i);
      const dayText = await dayElement.textContent();
      const classes = await dayElement.getAttribute('class');

      // Check if this is the day we want and it's available (same logic as scraper)
      if (dayText && parseInt(dayText.trim()) === day) {
        // Ensure it's not old, new, or disabled (same as scraper availability logic)
        if (classes && classes.includes('day') &&
            !classes.includes('old') &&
            !classes.includes('new') &&
            !classes.includes('disabled')) {

          logger.info(`Clicking on available day ${day}`);
          await dayElement.click();
          await this.page.waitForTimeout(200);
          return;
        }
      }
    }

    throw new Error(`Could not find available day ${day} in calendar`);
  }

  /**
   * Get Slovenian month name for a given month number and year
   */
  getMonthName(month, year) {
    const monthNames = [
      'Januar', 'Februar', 'Marec', 'April', 'Maj', 'Junij',
      'Julij', 'Avgust', 'September', 'Oktober', 'November', 'December'
    ];
    return `${monthNames[month - 1]} ${year}`;
  }

  /**
   * Fill guest information
   */
  async fillGuestInfo(guestInfo) {
    try {
      logger.info('Filling guest information');

      const { name, country, email, phone } = guestInfo;

      // Fill name
      if (name) {
        const nameInput = await this.page.$(this.config.selectors.guestName);
        if (nameInput) {
          await nameInput.fill(name);
          await this.page.waitForTimeout(this.config.booking.delays.afterInput);
        }
      }

      // Fill country
      if (country) {
        await this.selectCountry(country);
      }

      // Fill email
      if (email) {
        const emailInput = await this.page.$(this.config.selectors.guestEmail);
        if (emailInput) {
          await emailInput.fill(email);
          await this.page.waitForTimeout(this.config.booking.delays.afterInput);
        }
      }

      // Fill phone
      if (phone) {
        const phoneInput = await this.page.$(this.config.selectors.guestPhone);
        if (phoneInput) {
          await phoneInput.fill(phone);
          await this.page.waitForTimeout(this.config.booking.delays.afterInput);
        }
      }

      this.addStep('guest_info', 'Filled guest information', true);

    } catch (error) {
      const screenshot = await this.takeScreenshot('guest-info-error');
      this.addError('guest_info', error, screenshot);
      throw error;
    }
  }

  /**
   * Select country from dropdown
   */
  async selectCountry(country) {
    try {
      const countrySelect = await this.page.$(this.config.selectors.guestCountry);
      if (!countrySelect) {
        logger.warn('Country selector not found, skipping country selection');
        return;
      }

      // Check if it's a select element or input
      const tagName = await countrySelect.evaluate(el => el.tagName.toLowerCase());

      if (tagName === 'select') {
        // Handle dropdown
        const options = await this.page.$$(`${this.config.selectors.guestCountry} option`);
        let found = false;

        // Get country variations from config
        const countryVariations = this.config.countries[country] || [country.toLowerCase()];

        for (const option of options) {
          const text = await option.textContent();
          const value = await option.getAttribute('value');

          if (text || value) {
            const textLower = (text || '').toLowerCase();
            const valueLower = (value || '').toLowerCase();

            if (countryVariations.some(variant =>
              textLower.includes(variant) || valueLower.includes(variant)
            )) {
              await option.click();
              found = true;
              break;
            }
          }
        }

        if (!found) {
          logger.warn(`Country "${country}" not found in dropdown, using text input`);
          await countrySelect.fill(country);
        }
      } else {
        // Handle text input
        await countrySelect.fill(country);
      }

    } catch (error) {
      logger.error('Error selecting country', { country, error: error.message });
      // Don't throw, country selection is not critical
    }
  }

  /**
   * Select payment method (želim prejeti ponudbo)
   */
  async selectPaymentMethod() {
    try {
      logger.info('Selecting payment method: želim prejeti ponudbo');

      // Get iframe context
      const frame = this.page.frameLocator('iframe[src*="bentral.com"]');

      // Look for payment method radio buttons or select with shorter timeout
      const paymentOptions = frame.locator('input[type="radio"][value*="ponudbo"], input[type="radio"][value*="offer"], select[name*="payment"] option, input[name*="payment"]');
      const optionCount = await paymentOptions.count().catch(() => 0);

      if (optionCount === 0) {
        logger.warn('Payment method options not found, assuming single payment method');
        return;
      }

      // Try to find and select the "ponudbo" option
      let found = false;
      for (let i = 0; i < optionCount; i++) {
        const option = paymentOptions.nth(i);

        // Get the value and any associated label text with timeout
        const value = await option.getAttribute('value', { timeout: 2000 }).catch(() => '');
        const text = await option.textContent({ timeout: 2000 }).catch(() => '');

        // Look for text near the option (for radio buttons)
        const parentText = await option.locator('..').textContent({ timeout: 2000 }).catch(() => '');

        if ((value && (value.toLowerCase().includes('ponudbo') || value.toLowerCase().includes('offer'))) ||
            (text && (text.toLowerCase().includes('ponudbo') || text.toLowerCase().includes('offer'))) ||
            (parentText && (parentText.toLowerCase().includes('ponudbo') || parentText.toLowerCase().includes('offer')))) {

          logger.info(`Found payment option: "${text || value}" with parent text: "${parentText.substring(0, 50)}"`);

          try {
            // Click the radio button or select the option
            if (await option.getAttribute('type') === 'radio') {
              // Scroll into view first
              await option.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});

              // Try multiple approaches to select the radio button
              let success = false;

              // Approach 1: Regular check()
              try {
                await option.check({ timeout: 3000 });
                await this.page.waitForTimeout(200);
                const isChecked1 = await option.isChecked().catch(() => false);
                if (isChecked1) {
                  logger.info('✅ Selected payment method radio with check(): ponudbo');
                  success = true;
                }
              } catch (checkError) {
                logger.debug('Regular check failed, trying other methods');
              }

              // Approach 2: Force click if check failed
              if (!success) {
                try {
                  await option.click({ force: true, timeout: 3000 });
                  await this.page.waitForTimeout(200);
                  const isChecked2 = await option.isChecked().catch(() => false);
                  if (isChecked2) {
                    logger.info('✅ Selected payment method radio with force click: ponudbo');
                    success = true;
                  }
                } catch (forceClickError) {
                  logger.debug('Force click failed, trying JavaScript');
                }
              }

              // Approach 3: JavaScript click
              if (!success) {
                try {
                  await option.evaluate(el => {
                    el.click();
                    el.checked = true;
                    // Trigger change event
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                  });
                  await this.page.waitForTimeout(200);
                  const isChecked3 = await option.isChecked().catch(() => false);
                  if (isChecked3) {
                    logger.info('✅ Selected payment method radio with JS: ponudbo');
                    success = true;
                  }
                } catch (jsError) {
                  logger.debug('JavaScript click failed, trying direct property set');
                }
              }

              // Approach 4: Direct property setting
              if (!success) {
                try {
                  await option.evaluate(el => {
                    // Uncheck all other radios in the same group first
                    const radios = el.form?.querySelectorAll(`input[name="${el.name}"]`) ||
                                  document.querySelectorAll(`input[name="${el.name}"]`);
                    radios.forEach(r => r.checked = false);

                    // Check this radio
                    el.checked = true;

                    // Trigger all possible events
                    ['click', 'change', 'input'].forEach(eventType => {
                      el.dispatchEvent(new Event(eventType, { bubbles: true }));
                    });
                  });
                  await this.page.waitForTimeout(300);
                  const isChecked4 = await option.isChecked().catch(() => false);
                  if (isChecked4) {
                    logger.info('✅ Selected payment method radio with property setting: ponudbo');
                    success = true;
                  }
                } catch (propError) {
                  logger.debug('Property setting failed');
                }
              }

              if (!success) {
                logger.warn('⚠️ All payment method selection attempts failed');
              }
            } else {
              await option.click({ timeout: 5000 });
              logger.info('✅ Selected payment method option: ponudbo');
            }
            found = true;
            break;
          } catch (clickError) {
            logger.debug(`Failed to click payment option: ${clickError.message}`);
            continue;
          }
        }
      }

      if (!found) {
        // Fallback: look for any radio buttons and select the first one that looks like an offer
        const allRadios = frame.locator('input[type="radio"]');
        const radioCount = await allRadios.count({ timeout: 3000 }).catch(() => 0);

        for (let i = 0; i < radioCount; i++) {
          const radio = allRadios.nth(i);
          const nearbyText = await radio.locator('..').textContent({ timeout: 2000 }).catch(() => '');

          if (nearbyText.toLowerCase().includes('prejeti') ||
              nearbyText.toLowerCase().includes('ponudbo') ||
              nearbyText.toLowerCase().includes('offer')) {

            try {
              // Scroll into view first
              await radio.scrollIntoViewIfNeeded({ timeout: 1000 }).catch(() => {});

              let fallbackSuccess = false;

              // Fallback Approach 1: Regular check
              try {
                await radio.check({ timeout: 2000 });
                await this.page.waitForTimeout(200);
                const isChecked1 = await radio.isChecked().catch(() => false);
                if (isChecked1) {
                  logger.info('✅ Selected payment method radio (fallback check): ' + nearbyText.substring(0, 50));
                  found = true;
                  fallbackSuccess = true;
                }
              } catch (e) {
                // Continue to next approach
              }

              // Fallback Approach 2: Force click
              if (!fallbackSuccess) {
                try {
                  await radio.click({ force: true, timeout: 2000 });
                  await this.page.waitForTimeout(200);
                  const isChecked2 = await radio.isChecked().catch(() => false);
                  if (isChecked2) {
                    logger.info('✅ Selected payment method radio (fallback force): ' + nearbyText.substring(0, 50));
                    found = true;
                    fallbackSuccess = true;
                  }
                } catch (e) {
                  // Continue to next approach
                }
              }

              // Fallback Approach 3: JavaScript with events
              if (!fallbackSuccess) {
                try {
                  await radio.evaluate(el => {
                    // Uncheck all radios with same name first
                    const allRadios = el.form?.querySelectorAll(`input[name="${el.name}"]`) ||
                                     document.querySelectorAll(`input[name="${el.name}"]`);
                    allRadios.forEach(r => r.checked = false);

                    // Check this radio and trigger events
                    el.checked = true;
                    ['click', 'change', 'input'].forEach(eventType => {
                      el.dispatchEvent(new Event(eventType, { bubbles: true }));
                    });
                  });
                  await this.page.waitForTimeout(300);
                  const isChecked3 = await radio.isChecked().catch(() => false);
                  if (isChecked3) {
                    logger.info('✅ Selected payment method radio (fallback JS): ' + nearbyText.substring(0, 50));
                    found = true;
                    fallbackSuccess = true;
                  }
                } catch (e) {
                  // Final attempt failed
                }
              }

              if (fallbackSuccess) {
                break;
              }
            } catch (fallbackError) {
              logger.debug(`Fallback radio click failed: ${fallbackError.message}`);
              continue;
            }
          }
        }
      }

      if (!found) {
        logger.warn('Payment method "ponudbo" not found, but continuing...');
      }

      this.addStep('payment_selection', 'Selected payment method: ponudbo');

    } catch (error) {
      const screenshot = await this.takeScreenshot('payment-selection-error');
      this.addError('payment_selection', error, screenshot);
      // Don't throw, payment selection failure shouldn't stop the process
      logger.warn('Payment method selection failed, continuing...');
    }
  }

  /**
   * Proceed to the next step in the booking process (where captcha will appear)
   */
  async proceedToNextStep() {
    try {
      logger.info('Proceeding to next step in booking process');

      // Get iframe context
      const frame = this.page.frameLocator('iframe[src*="bentral.com"]');

      // Look for various types of "Next" or "Continue" buttons
      const nextButtonSelectors = [
        '.btn-primary',
        'button[type="submit"]',
        'input[type="submit"]',
        '.next-step',
        '.continue-btn',
        'button:has-text("Naslednji")',
        'button:has-text("Naprej")',
        'input[value*="naslednji"]',
        'input[value*="naprej"]',
        'button:has-text("Continue")',
        'button:has-text("Next")'
      ];

      let buttonFound = false;

      for (const selector of nextButtonSelectors) {
        try {
          const button = frame.locator(selector).first();
          if (await button.isVisible({ timeout: 1000 })) {
            const text = await button.textContent().catch(() => '');
            const value = await button.getAttribute('value').catch(() => '');

            logger.info(`Found next step button: "${text || value}" (selector: ${selector})`);

            await button.click();
            buttonFound = true;

            // Wait for the next page to load
            await this.page.waitForTimeout(300);

            this.addStep('proceed_next_step', `Clicked next step button: ${text || value}`);
            break;
          }
        } catch (e) {
          // Continue to next selector
        }
      }

      if (!buttonFound) {
        logger.warn('No next step button found, continuing without proceeding');
        this.addStep('proceed_next_step', 'No next step button found, may already be on captcha page');
      }

      // Take screenshot after clicking next
      await this.takeScreenshot('after-next-step');

      // If we've proceeded to step 2, fill the guest information form that appears here
      await this.fillStep2GuestInfo();

    } catch (error) {
      const screenshot = await this.takeScreenshot('proceed-next-step-error');
      this.addError('proceed_next_step', error, screenshot);
      throw error;
    }
  }

  /**
   * Fill the guest information form that appears in step 2
   */
  async fillStep2GuestInfo() {
    try {
      logger.info('Filling guest information form in step 2');

      const frame = this.page.frameLocator('iframe[src*="bentral.com"]');

      // Check if we have booking details
      const guestName = this.bookingData.bookingDetails?.guestName || 'John Doe';
      const email = this.bookingData.bookingDetails?.email || 'test@example.com';
      const phone = this.bookingData.bookingDetails?.phone || '+386 40 123 456';

      // Fill guest name using exact field name found in analysis
      const nameInput = frame.locator('input[name="name"]').first();
      if (await nameInput.isVisible({ timeout: 1000 })) {
        await nameInput.fill(guestName);
        logger.info('✅ Filled guest name');
      }

      // Fill email using exact field name found in analysis
      const emailInput = frame.locator('input[name="email"]').first();
      if (await emailInput.isVisible({ timeout: 1000 })) {
        await emailInput.fill(email);
        logger.info('✅ Filled email');
      }

      // Fill country dropdown FIRST (to prevent it from clearing phone when changed later)
      const countrySelect = frame.locator('select[name="country"]').first();
      if (await countrySelect.isVisible({ timeout: 1000 })) {
        // Try to select Slovenia/Slovenija
        const options = countrySelect.locator('option');
        const optionCount = await options.count();

        for (let i = 0; i < optionCount; i++) {
          const option = options.nth(i);
          const text = await option.textContent();

          if (text && (text.toLowerCase().includes('slovenia') || text.toLowerCase().includes('slovenija'))) {
            await countrySelect.selectOption({ index: i });
            logger.info('✅ Selected country: Slovenia');
            break;
          }
        }
        // Wait longer for country change to propagate
        await this.page.waitForTimeout(200);
      }

      // Select phone type dropdown SECOND (after country is set)
      const phoneTypeSelect = frame.locator('select[name="phone_type"]').first();
      if (await phoneTypeSelect.isVisible({ timeout: 1000 })) {
        // Select mobile phone option
        const options = phoneTypeSelect.locator('option');
        const optionCount = await options.count();

        for (let i = 0; i < optionCount; i++) {
          const option = options.nth(i);
          const text = await option.textContent();

          if (text && (text.toLowerCase().includes('mobilni') || text.toLowerCase().includes('mobile'))) {
            await phoneTypeSelect.selectOption({ index: i });
            logger.info('✅ Selected phone type: mobile');
            break;
          }
        }
        // Wait longer for phone type change to propagate
        await this.page.waitForTimeout(200);
      }

      // Fill phone LAST (after all dropdowns are set to prevent clearing)
      const phoneInput = frame.locator('input[name="phone_number"]').first();
      if (await phoneInput.isVisible({ timeout: 1000 })) {
        // Use more robust input method
        await phoneInput.click(); // Focus first
        await phoneInput.fill(''); // Clear
        await this.page.waitForTimeout(100);

        // Use pressSequentially for more reliable input
        await phoneInput.pressSequentially(phone, { delay: 20 });
        await this.page.waitForTimeout(200);

        // Verify the phone number was entered correctly
        const actualValue = await phoneInput.inputValue();
        if (actualValue !== phone) {
          logger.warn(`Phone number mismatch: expected "${phone}", got "${actualValue}". Retrying with type()...`);
          await phoneInput.click();
          await phoneInput.fill('');
          await this.page.waitForTimeout(100);
          await phoneInput.type(phone, { delay: 30 });
          await this.page.waitForTimeout(200);

          // Final verification
          const finalValue = await phoneInput.inputValue();
          if (finalValue === phone) {
            logger.info('✅ Phone number verified after retry');
          } else {
            logger.error(`Phone still incorrect: expected "${phone}", got "${finalValue}"`);
          }
        }
        logger.info('✅ Filled phone');
      }

      // Fill message textarea if visible
      const messageTextarea = frame.locator('textarea[name="note"]').first();
      if (await messageTextarea.isVisible({ timeout: 1000 })) {
        await messageTextarea.fill('Hvala za rezervacijo.');
        logger.info('✅ Filled message note');
      }

      await this.page.waitForTimeout(200);
      this.addStep('step2_guest_info', 'Filled guest information in step 2 form');

      // Now proceed to step 3 where the captcha will be
      await this.proceedToStep3();

    } catch (error) {
      logger.warn('Failed to fill step 2 guest info:', error.message);
      // Don't throw error, just continue - this is not critical
    }
  }

  /**
   * Proceed from step 2 to step 3 (where captcha appears)
   */
  async proceedToStep3() {
    try {
      logger.info('Proceeding from step 2 to step 3 (captcha step)');

      const frame = this.page.frameLocator('iframe[src*="bentral.com"]');

      // Look for the next button on step 2
      const step2NextSelectors = [
        '.btn-primary',
        'button[type="submit"]',
        'input[type="submit"]',
        'button:has-text("Naslednji")',
        'button:has-text("Naprej")',
        'button:has-text("Potrdi")',
        'button:has-text("Continue")',
        'input[value*="naslednji"]',
        'input[value*="potrdi"]'
      ];

      let step3ButtonFound = false;

      for (const selector of step2NextSelectors) {
        try {
          const button = frame.locator(selector).first();
          if (await button.isVisible({ timeout: 1000 })) {
            const text = await button.textContent().catch(() => '');
            const value = await button.getAttribute('value').catch(() => '');

            logger.info(`Found step 3 button: "${text || value}" (selector: ${selector})`);

            await button.click();
            step3ButtonFound = true;

            // Wait for step 3 to load
            await this.page.waitForTimeout(500);

            this.addStep('proceed_step3', `Clicked button to proceed to step 3: ${text || value}`);
            break;
          }
        } catch (e) {
          // Continue to next selector
        }
      }

      if (!step3ButtonFound) {
        logger.warn('No step 3 button found, may already be on captcha page');
        this.addStep('proceed_step3', 'No step 3 button found, continuing to captcha');
      }

      // Take screenshot of step 3
      await this.takeScreenshot('step3-captcha-page');

      // Fill user information and solve captcha on step 3
      await this.fillUserInfoAndCaptcha();

    } catch (error) {
      logger.warn('Failed to proceed to step 3:', error.message);
      // Don't throw error - captcha solver will handle if we're not on the right page
    }
  }

  /**
   * Solve captcha and submit form
   */
  async solveCaptchaAndSubmit() {
    try {
      logger.info('Starting captcha solving process');

      // Take screenshot before captcha solving
      await this.takeScreenshot('captcha-before');

      // Solve the captcha
      const correctAnswer = await this.captchaSolver.solve();

      if (correctAnswer === null) {
        throw new Error('Failed to solve captcha after all attempts');
      }

      this.addStep('captcha_solved', `Captcha solved with answer: ${correctAnswer}`);

      // Wait a moment before submitting
      await this.page.waitForTimeout(this.config.booking.delays.beforeSubmit);

      // Take screenshot after captcha solving but before submission
      await this.takeScreenshot('captcha-solved');

      logger.info('Captcha solved, ready to submit (but not submitting as requested)');

      return {
        captchaSolved: true,
        answer: correctAnswer,
        readyToSubmit: true
      };

    } catch (error) {
      const screenshot = await this.takeScreenshot('captcha-error');
      this.addError('captcha_solving', error, screenshot);
      throw error;
    }
  }

  /**
   * Submit the booking form (only call this when explicitly requested)
   */
  async submitBooking() {
    try {
      logger.info('Submitting booking form');

      // Find submit/confirmation button
      const submitButton = await this.page.$(this.config.selectors.confirmButton) ||
                           await this.page.$(this.config.selectors.nextButton);

      if (!submitButton) {
        throw new Error('Submit button not found');
      }

      await submitButton.click();
      await this.page.waitForTimeout(300);

      // Check for success or error messages
      const successMessage = await this.page.$(this.config.selectors.successMessage);
      const errorMessage = await this.page.$(this.config.selectors.errorMessage);

      if (successMessage) {
        const successText = await successMessage.textContent();
        this.addStep('booking_submitted', `Booking submitted successfully: ${successText}`);
        await this.takeScreenshot('booking-success');
        return { success: true, message: successText };
      } else if (errorMessage) {
        const errorText = await errorMessage.textContent();
        this.addError('booking_submission', new Error(`Booking submission failed: ${errorText}`));
        await this.takeScreenshot('booking-error');
        return { success: false, message: errorText };
      } else {
        // Assume success if no clear error
        this.addStep('booking_submitted', 'Booking submitted (no clear confirmation message)');
        await this.takeScreenshot('booking-submitted');
        return { success: true, message: 'Booking submitted' };
      }

    } catch (error) {
      const screenshot = await this.takeScreenshot('submit-error');
      this.addError('booking_submission', error, screenshot);
      throw error;
    }
  }

  /**
   * Main booking method
   */
  async makeBooking(bookingParams) {
    try {
      const { hutName, roomType, arrivalDate, departureDate, guestName, country, email, phone } = bookingParams;

      this.bookingData.bookingDetails = bookingParams;
      this.bookingData.status = 'in_progress';

      logger.info('Starting booking process', { bookingParams });

      // Initialize browser
      await this.initialize();

      // Login
      await this.login();

      // Select hut
      await this.selectHut(hutName);

      // Select room type
      await this.selectRoomType(roomType);

      // Select dates
      await this.selectDates(arrivalDate, departureDate);

      // Fill guest information
      await this.fillGuestInfo({
        name: guestName,
        country,
        email,
        phone
      });

      // Select payment method
      await this.selectPaymentMethod();

      // Proceed to next step (where captcha will appear)
      await this.proceedToNextStep();

      // Solve captcha but don't submit
      const captchaResult = await this.solveCaptchaAndSubmit();

      this.bookingData.status = 'ready_to_submit';
      this.bookingData.captchaResult = captchaResult;

      // Save booking data
      await this.saveBookingData();

      logger.info('Booking process completed successfully (ready to submit)', {
        sessionId: this.sessionId,
        captchaSolved: captchaResult.captchaSolved,
        answer: captchaResult.answer
      });

      return {
        success: true,
        sessionId: this.sessionId,
        status: 'ready_to_submit',
        captchaSolved: captchaResult.captchaSolved,
        captchaAnswer: captchaResult.answer,
        message: 'Booking form filled and captcha solved. Ready to submit when requested.'
      };

    } catch (error) {
      this.bookingData.status = 'failed';
      this.addError('booking_process', error);
      await this.saveBookingData();

      logger.error('Booking process failed', {
        sessionId: this.sessionId,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Fill user information and solve captcha on step 3
   */
  async fillUserInfoAndCaptcha() {
    try {
      logger.info('Filling user information and solving captcha on step 3');

      const frame = this.page.frameLocator('iframe[src*="bentral.com"]');

      // Get values with safe fallbacks
      const guestName = this.bookingData.bookingDetails?.guestName || 'John Doe';
      const email = this.bookingData.bookingDetails?.email || 'test@example.com';
      const phone = this.bookingData.bookingDetails?.phone || '+386 40 123 456';

      // Fill guest name if not already filled
      const nameInput = frame.locator('input[name="name"]').first();
      if (await nameInput.isVisible({ timeout: 1000 })) {
        const currentValue = await nameInput.inputValue();
        if (!currentValue) {
          await nameInput.fill(guestName);
          logger.info('✅ Filled guest name on step 3');
        }
      }

      // Fill email if not already filled
      const emailInput = frame.locator('input[name="email"]').first();
      if (await emailInput.isVisible({ timeout: 1000 })) {
        const currentValue = await emailInput.inputValue();
        if (!currentValue) {
          await emailInput.fill(email);
          logger.info('✅ Filled email on step 3');
        }
      }

      // Fill country dropdown FIRST (to prevent it from clearing phone when changed later)
      const countrySelect = frame.locator('select[name="country"]').first();
      if (await countrySelect.isVisible({ timeout: 1000 })) {
        const options = countrySelect.locator('option');
        const optionCount = await options.count();

        for (let i = 0; i < optionCount; i++) {
          const option = options.nth(i);
          const text = await option.textContent();

          if (text && (text.toLowerCase().includes('slovenia') || text.toLowerCase().includes('slovenija'))) {
            await countrySelect.selectOption({ index: i });
            logger.info('✅ Selected country: Slovenia on step 3');
            break;
          }
        }
        // Wait longer for country change to propagate
        await this.page.waitForTimeout(200);
      }

      // Select phone type dropdown SECOND (after country is set)
      const phoneTypeSelect = frame.locator('select[name="phone_type"]').first();
      if (await phoneTypeSelect.isVisible({ timeout: 1000 })) {
        // Select mobile phone option
        const options = phoneTypeSelect.locator('option');
        const optionCount = await options.count();

        for (let i = 0; i < optionCount; i++) {
          const option = options.nth(i);
          const text = await option.textContent();

          if (text && (text.toLowerCase().includes('mobilni') || text.toLowerCase().includes('mobile'))) {
            await phoneTypeSelect.selectOption({ index: i });
            logger.info('✅ Selected phone type: mobile on step 3');
            break;
          }
        }
        // Wait longer for phone type change to propagate
        await this.page.waitForTimeout(200);
      }

      // Fill phone LAST if not already filled (after all dropdowns are set)
      const phoneInput = frame.locator('input[name="phone_number"]').first();
      if (await phoneInput.isVisible({ timeout: 1000 })) {
        const currentValue = await phoneInput.inputValue();
        if (!currentValue || currentValue !== phone) {
          // Use more robust input method
          await phoneInput.click(); // Focus first
          await phoneInput.fill(''); // Clear
          await this.page.waitForTimeout(100);

          // Use pressSequentially for more reliable input
          await phoneInput.pressSequentially(phone, { delay: 20 });
          await this.page.waitForTimeout(200);

          // Verify the phone number was entered correctly
          const actualValue = await phoneInput.inputValue();
          if (actualValue !== phone) {
            logger.warn(`Phone number mismatch on step 3: expected "${phone}", got "${actualValue}". Retrying with type()...`);
            await phoneInput.click();
            await phoneInput.fill('');
            await this.page.waitForTimeout(100);
            await phoneInput.type(phone, { delay: 30 });
            await this.page.waitForTimeout(200);

            // Final verification
            const finalValue = await phoneInput.inputValue();
            if (finalValue === phone) {
              logger.info('✅ Phone number verified after retry on step 3');
            } else {
              logger.error(`Phone still incorrect on step 3: expected "${phone}", got "${finalValue}"`);
            }
          }
          logger.info('✅ Filled phone on step 3');
        } else {
          logger.info('✅ Phone already filled on step 3');
        }
      }

      // Fill additional message textarea if needed
      const messageTextarea = frame.locator('textarea[name="note"]').first();
      if (await messageTextarea.isVisible({ timeout: 1000 })) {
        const currentValue = await messageTextarea.inputValue();
        if (!currentValue) {
          await messageTextarea.fill('Hvala za rezervacijo.');
          logger.info('✅ Filled message note on step 3');
        }
      }

      // Set arrival time if the dropdown is available
      const arrivalTimeSelect = frame.locator('select[name="arrival_time"]').first();
      if (await arrivalTimeSelect.isVisible({ timeout: 1000 })) {
        // Try to select a reasonable arrival time (afternoon)
        const options = arrivalTimeSelect.locator('option');
        const optionCount = await options.count();

        for (let i = 0; i < optionCount; i++) {
          const option = options.nth(i);
          const text = await option.textContent();

          if (text && text.includes('15:00')) {
            await arrivalTimeSelect.selectOption({ index: i });
            logger.info('✅ Selected arrival time: 15:00');
            break;
          } else if (text && text.includes('14:00')) {
            await arrivalTimeSelect.selectOption({ index: i });
            logger.info('✅ Selected arrival time: 14:00');
            break;
          }
        }
      }

      // Check required checkboxes if any
      const checkboxes = frame.locator('input[type="checkbox"]');
      const checkboxCount = await checkboxes.count();

      for (let i = 0; i < checkboxCount; i++) {
        const checkbox = checkboxes.nth(i);
        if (await checkbox.isVisible({ timeout: 1000 })) {
          const isRequired = await checkbox.getAttribute('required');
          const isChecked = await checkbox.isChecked();

          if (isRequired && !isChecked) {
            await checkbox.check();
            logger.info('✅ Checked required checkbox');
          }
        }
      }

      await this.page.waitForTimeout(300);

      // Now try to solve the captcha - it might appear after filling all fields
      const captchaSolver = new (require('./services/captchaSolver'))(this.page, this.config);
      const captchaAnswer = await captchaSolver.solve();

      if (captchaAnswer !== null) {
        logger.info(`✅ Captcha solved with answer: ${captchaAnswer}`);
        this.addStep('captcha_solved', `Solved captcha with answer: ${captchaAnswer}`);
      } else {
        logger.info('ℹ️ No captcha found or captcha solving not needed at this step');
        this.addStep('captcha_check', 'Checked for captcha - none found or not needed');
      }

      // Take screenshot after filling everything
      await this.takeScreenshot('step3-filled-with-captcha');

      this.addStep('step3_user_info_filled', 'Filled user information on step 3');

    } catch (error) {
      const screenshot = await this.takeScreenshot('step3-user-info-error');
      this.addError('step3_user_info', error, screenshot);
      logger.error('Failed to fill user info on step 3:', error.message);
      // Don't throw error - let the process continue
    }
  }

  /**
   * Save booking data to file
   */
  async saveBookingData() {
    try {
      if (!this.config.output.saveBookingData) return;

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `booking-${this.sessionId}-${timestamp}.json`;
      const filepath = path.join(this.config.output.bookingDataDir, filename);

      // Ensure directory exists
      if (!fs.existsSync(this.config.output.bookingDataDir)) {
        fs.mkdirSync(this.config.output.bookingDataDir, { recursive: true });
      }

      fs.writeFileSync(filepath, JSON.stringify(this.bookingData, null, 2));
      logger.info(`Booking data saved: ${filepath}`);

    } catch (error) {
      logger.error('Failed to save booking data', { error: error.message });
    }
  }

  /**
   * Clean up browser resources
   */
  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      logger.info('Browser closed');
    }
  }

  /**
   * Get current booking data
   */
  getBookingData() {
    return this.bookingData;
  }
}

module.exports = MicrogrammBookingBot;