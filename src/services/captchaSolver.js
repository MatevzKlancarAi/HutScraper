/**
 * Math Captcha Solver Service
 *
 * Solves simple math captchas by trying incremental answers
 * and monitoring error message disappearance
 */

const logger = require("./logger");

class CaptchaSolver {
  constructor(page, config) {
    this.page = page;
    this.config = config;
  }

  /**
   * Parse math expression from text
   * @param {string} expression - Math expression like "2+1+3" or "5-2"
   * @returns {number} Result of the expression
   */
  evaluateExpression(expression) {
    try {
      // Clean the expression - remove spaces and non-math characters
      const cleanExpression = expression
        .replace(/[^\d+\-*/().]/g, '')
        .trim();

      // Safety check - only allow basic math operations
      if (!/^[\d+\-*/().\s]+$/.test(cleanExpression)) {
        throw new Error(`Invalid expression: ${cleanExpression}`);
      }

      // Evaluate the expression safely
      // eslint-disable-next-line no-eval
      const result = eval(cleanExpression);

      if (isNaN(result) || !isFinite(result)) {
        throw new Error(`Invalid result: ${result}`);
      }

      return Math.round(result);
    } catch (error) {
      logger.error("Failed to evaluate math expression", {
        expression,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Extract math expression from captcha image or text
   * @returns {string|null} Math expression or null if not found
   */
  async extractExpression() {
    try {
      // Try to find the captcha image with the specific class we found
      const frame = this.page.frameLocator('iframe[src*="bentral.com"]');

      // Look for the specific captcha image we know exists
      const captchaImg = frame.locator('img.secure-img').first();
      if (await captchaImg.isVisible({ timeout: 2000 })) {
        // Try to get the alt text
        const alt = await captchaImg.getAttribute('alt').catch(() => null);
        if (alt) {
          const mathMatch = alt.match(/(\d+[\s]*[+\-*/][\s]*\d+(?:[\s]*[+\-*/][\s]*\d+)*)/);
          if (mathMatch) {
            logger.info(`Found math expression in image alt: ${mathMatch[1]}`);
            return mathMatch[1];
          }
        }

        // Try to get the title
        const title = await captchaImg.getAttribute('title').catch(() => null);
        if (title) {
          const mathMatch = title.match(/(\d+[\s]*[+\-*/][\s]*\d+(?:[\s]*[+\-*/][\s]*\d+)*)/);
          if (mathMatch) {
            logger.info(`Found math expression in image title: ${mathMatch[1]}`);
            return mathMatch[1];
          }
        }

        // Try to get the src and see if it contains math info
        const src = await captchaImg.getAttribute('src').catch(() => null);
        if (src) {
          logger.debug(`Captcha image src: ${src}`);
        }
      }

      // Look for text content near the captcha section
      const captchaSection = frame.locator('*:has-text("Varnostna koda"), *:has-text("Vpišite rezultat")').first();
      if (await captchaSection.isVisible({ timeout: 2000 })) {
        const sectionText = await captchaSection.textContent();
        if (sectionText) {
          // Look for math expressions in the text
          const mathMatch = sectionText.match(/(\d+[\s]*[+\-*/][\s]*\d+(?:[\s]*[+\-*/][\s]*\d+)*)/);
          if (mathMatch) {
            logger.info(`Found math expression in section text: ${mathMatch[1]}`);
            return mathMatch[1];
          }
        }
      }

      // Try to look for any element containing math-like text
      const allText = await frame.textContent();
      if (allText) {
        const mathMatch = allText.match(/(\d+[\s]*[+\-*/][\s]*\d+(?:[\s]*[+\-*/][\s]*\d+)*)/);
        if (mathMatch) {
          logger.info(`Found math expression in page text: ${mathMatch[1]}`);
          return mathMatch[1];
        }
      }

      logger.warn("Could not extract math expression from captcha");
      return null;
    } catch (error) {
      logger.error("Failed to extract captcha expression", {
        error: error.message
      });
      return null;
    }
  }

  /**
   * Check if captcha error message is present
   * @returns {boolean} True if error message is present
   */
  async hasErrorMessage() {
    try {
      const frame = this.page.frameLocator('iframe[src*="bentral.com"]');

      // Look for the specific error message "Vnesite rezultat seštevka s slike."
      const errorTexts = [
        'Vnesite rezultat seštevka s slike',
        'Vnesite rezultat',
        'seštevka s slike',
        'Napačen rezultat',
        'Wrong result',
        'Invalid captcha'
      ];

      // First check for visible text elements with explicit visibility check
      for (const errorText of errorTexts) {
        try {
          // Use more specific locator to check for exact text match
          const errorLocator = frame.getByText(errorText, { exact: false });
          const count = await errorLocator.count({ timeout: 1000 }).catch(() => 0);

          if (count > 0) {
            // Check if any of these are actually visible
            for (let i = 0; i < count; i++) {
              const element = errorLocator.nth(i);
              const isVisible = await element.isVisible({ timeout: 200 }).catch(() => false);

              if (isVisible) {
                // Double check by getting the text content to make sure it's not empty
                const textContent = await element.textContent({ timeout: 200 }).catch(() => '');
                if (textContent.trim().length > 0) {
                  logger.debug(`Found visible error text: "${errorText}" - content: "${textContent.substring(0, 100)}"`);
                  return true;
                }
              }
            }
          }
        } catch (e) {
          // Continue to next error text
          continue;
        }
      }

      // Fallback - check for elements containing error text using CSS selectors
      const errorSelectors = [
        '.error:visible',
        '.alert-danger:visible',
        '.text-danger:visible',
        '[style*="color: red"]:visible',
        '[style*="color:#red"]:visible',
        '.captcha-error:visible',
        '.validation-error:visible'
      ];

      for (const selector of errorSelectors) {
        try {
          const errorElements = frame.locator(selector.replace(':visible', ''));
          const count = await errorElements.count({ timeout: 500 }).catch(() => 0);

          if (count > 0) {
            for (let i = 0; i < count; i++) {
              const element = errorElements.nth(i);
              const isVisible = await element.isVisible({ timeout: 200 }).catch(() => false);

              if (isVisible) {
                const textContent = await element.textContent({ timeout: 200 }).catch(() => '');
                // Check if the error element contains captcha-related error text
                for (const errorText of errorTexts) {
                  if (textContent.toLowerCase().includes(errorText.toLowerCase())) {
                    logger.debug(`Found visible error element with class containing: "${errorText}"`);
                    return true;
                  }
                }
              }
            }
          }
        } catch (e) {
          continue;
        }
      }

      // Additional check: look for any element that contains error text and is visible
      try {
        const allElements = frame.locator('*');
        const elementCount = await allElements.count({ timeout: 1000 }).catch(() => 0);

        // Limit check to first 50 elements to avoid performance issues
        const checkLimit = Math.min(elementCount, 50);

        for (let i = 0; i < checkLimit; i++) {
          const element = allElements.nth(i);
          const isVisible = await element.isVisible({ timeout: 100 }).catch(() => false);

          if (isVisible) {
            const textContent = await element.textContent({ timeout: 100 }).catch(() => '');

            for (const errorText of errorTexts) {
              if (textContent.toLowerCase().includes(errorText.toLowerCase()) && textContent.trim().length > 0) {
                logger.debug(`Found visible element containing error text: "${errorText}"`);
                return true;
              }
            }
          }
        }
      } catch (e) {
        // Ignore and continue
      }

      logger.debug("No captcha error message found - form appears valid");
      return false;
    } catch (error) {
      logger.debug("Error checking captcha error message", {
        error: error.message
      });
      // On error, assume no error message to avoid false positives
      return false;
    }
  }

  /**
   * Try a specific answer and check if it's correct
   * @param {number} answer - The answer to try
   * @returns {boolean} True if answer is correct (no error message)
   */
  async tryAnswer(answer) {
    try {
      logger.debug(`Trying captcha answer: ${answer}`);

      // Try to find captcha input in iframe first, then main page
      const frame = this.page.frameLocator('iframe[src*="bentral.com"]');
      let captchaInput = null;

      // First try in iframe - use the correct selectors for this specific captcha
      try {
        // Try multiple selectors for the captcha input field
        const captchaSelectors = [
          'input.secure-code',  // Based on class found in analysis
          'input[type="number"].secure-code',  // More specific with type
          'input[type="number"]:near(img.secure-img)',  // Near the captcha image
          'input[name="captcha"]',  // Fallback - standard name
          'input[name="security_code"]',  // Fallback - standard name
          'input[type="text"]:near(img[alt*="captcha"])'  // Fallback - old selector
        ];

        for (const selector of captchaSelectors) {
          try {
            captchaInput = frame.locator(selector).first();
            if (await captchaInput.isVisible({ timeout: 1000 })) {
              logger.debug(`Found captcha input in iframe using selector: ${selector}`);
              break;
            } else {
              captchaInput = null;
            }
          } catch (e) {
            captchaInput = null;
          }
        }
      } catch (e) {
        captchaInput = null;
      }

      // If not found in iframe, try main page
      if (!captchaInput) {
        const mainPageInput = await this.page.$(this.config.selectors.captchaInput);
        if (mainPageInput) {
          logger.debug('Found captcha input in main page');
          captchaInput = mainPageInput;
        }
      }

      if (!captchaInput) {
        throw new Error('Captcha input field not found');
      }

      // Use robust input method for captcha (it's a number input, needs special handling)
      if (typeof captchaInput.fill === 'function') {
        // Playwright locator - use more robust input methods
        await captchaInput.click(); // Focus first
        await captchaInput.fill(''); // Clear
        await this.page.waitForTimeout(50);

        // Use pressSequentially for better input registration
        await captchaInput.pressSequentially(answer.toString(), { delay: 30 });
        await this.page.waitForTimeout(100);

        // Trigger input and change events manually
        await captchaInput.dispatchEvent('input');
        await captchaInput.dispatchEvent('change');
        await captchaInput.dispatchEvent('blur');
      } else {
        // ElementHandle - fallback method
        await captchaInput.click();
        await captchaInput.fill('');
        await this.page.waitForTimeout(50);
        await captchaInput.type(answer.toString(), { delay: 30 });
        await this.page.waitForTimeout(100);
      }

      // Wait for the form to process the input and update error state
      await this.page.waitForTimeout(this.config.booking.captcha.delayBetweenAttempts);

      // Wait additional time for potential DOM updates to complete
      await this.page.waitForTimeout(300);

      // Check if error message is gone
      const hasError = await this.hasErrorMessage();
      const isCorrect = !hasError;

      if (isCorrect) {
        logger.info(`✅ Captcha answer ${answer} appears correct - no error message found`);
      } else {
        logger.debug(`❌ Captcha answer ${answer} incorrect - error message still present`);
      }

      return isCorrect;
    } catch (error) {
      logger.error(`Failed to try captcha answer ${answer}`, {
        error: error.message
      });
      return false;
    }
  }

  /**
   * Solve the captcha by trying different approaches
   * @returns {number|null} Correct answer or null if not found
   */
  async solve() {
    logger.info("Starting captcha solving process");

    try {
      // First approach: Try to extract and calculate the expression
      const expression = await this.extractExpression();
      if (expression) {
        const calculatedAnswer = this.evaluateExpression(expression);
        if (calculatedAnswer !== null) {
          logger.info(`Found math expression: ${expression} = ${calculatedAnswer}`);

          const isCorrect = await this.tryAnswer(calculatedAnswer);
          if (isCorrect) {
            logger.info(`Captcha solved with calculated answer: ${calculatedAnswer}`);
            return calculatedAnswer;
          }
        }
      }

      // Second approach: Brute force from 0 to maxNumber
      logger.info("Trying brute force approach for captcha");
      logger.info(`Will try answers from ${this.config.booking.captcha.startNumber} to ${this.config.booking.captcha.maxNumber}`);

      for (let answer = this.config.booking.captcha.startNumber; answer <= this.config.booking.captcha.maxNumber; answer++) {
        logger.debug(`Trying brute force answer ${answer}/${this.config.booking.captcha.maxNumber}`);

        const isCorrect = await this.tryAnswer(answer);
        if (isCorrect) {
          logger.info(`✅ Captcha solved with brute force answer: ${answer}`);
          // Take a screenshot of the successful state
          await this.debugScreenshot(`captcha-solved-${answer}`);
          return answer;
        }

        // Check if we should continue or if there's been an unexpected error
        try {
          // Quick check to see if the page is still responsive
          const frame = this.page.frameLocator('iframe[src*="bentral.com"]');
          await frame.locator('body').count({ timeout: 1000 });
        } catch (e) {
          logger.warn("Page may have become unresponsive during captcha solving");
          break;
        }

        // Add a delay between attempts for brute force (but shorter than before)
        if (answer < this.config.booking.captcha.maxNumber) {
          await this.page.waitForTimeout(this.config.booking.captcha.delayBetweenAttempts);
        }
      }

      logger.error("Failed to solve captcha with all approaches");
      return null;
    } catch (error) {
      logger.error("Captcha solving failed", {
        error: error.message
      });
      return null;
    }
  }

  /**
   * Take screenshot of captcha for debugging
   * @param {string} name - Screenshot name suffix
   */
  async debugScreenshot(name = "captcha") {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `${name}-${timestamp}.png`;
      const filepath = `${this.config.output.screenshotsDir}/${filename}`;

      await this.page.screenshot({ path: filepath, fullPage: false });
      logger.debug(`Captcha screenshot saved: ${filepath}`);
    } catch (error) {
      logger.debug("Failed to take captcha screenshot", {
        error: error.message
      });
    }
  }
}

module.exports = CaptchaSolver;