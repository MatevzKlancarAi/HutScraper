/**
 * Math Captcha Solver Service
 *
 * Solves simple math captchas by:
 * 1. Trying to extract and calculate the expression
 * 2. Brute force trying answers 0-20
 * 3. Monitoring error message disappearance
 */

import type { Logger } from '@services/logger/index.ts';
import { sleep } from '@utils/sleep.ts';
import type { Page } from 'playwright';

export interface CaptchaSolverConfig {
  startNumber: number;
  maxNumber: number;
  delayBetweenAttempts: number;
}

/**
 * CaptchaSolver class
 * Solves math-based captchas in Bentral booking system
 */
export class CaptchaSolver {
  private readonly config: CaptchaSolverConfig;
  private readonly logger: Logger;
  private readonly page: Page;

  constructor(page: Page, logger: Logger, config: CaptchaSolverConfig) {
    this.page = page;
    this.logger = logger;
    this.config = config;
  }

  /**
   * Parse and evaluate math expression
   */
  private evaluateExpression(expression: string): number | null {
    try {
      // Clean the expression - remove spaces and non-math characters
      const cleanExpression = expression.replace(/[^\d+\-*/().]/g, '').trim();

      // Safety check - only allow basic math operations
      if (!/^[\d+\-*/().\s]+$/.test(cleanExpression)) {
        this.logger.warn(`Invalid expression: ${cleanExpression}`);
        return null;
      }

      // Evaluate the expression safely
      // biome-ignore lint/security/noGlobalEval: This is safe as we've validated the input
      const result = eval(cleanExpression);

      if (Number.isNaN(result) || !Number.isFinite(result)) {
        this.logger.warn(`Invalid result: ${result}`);
        return null;
      }

      return Math.round(result);
    } catch (error) {
      this.logger.error(
        { expression, error: error instanceof Error ? error.message : String(error) },
        'Failed to evaluate math expression'
      );
      return null;
    }
  }

  /**
   * Extract math expression from captcha image or text
   */
  private async extractExpression(): Promise<string | null> {
    try {
      const frame = this.page.frameLocator('iframe[src*="bentral.com"]');

      // Try to find the captcha image
      const captchaImg = frame.locator('img.secure-img').first();
      if (await captchaImg.isVisible({ timeout: 2000 }).catch(() => false)) {
        // Try to get the alt text
        const alt = (await captchaImg.getAttribute('alt').catch(() => undefined)) ?? null;
        if (alt) {
          const mathMatch = alt.match(/(\d+[\s]*[+\-*/][\s]*\d+(?:[\s]*[+\-*/][\s]*\d+)*)/);
          if (mathMatch) {
            this.logger.info(`Found math expression in image alt: ${mathMatch[1]}`);
            return mathMatch[1] ?? null;
          }
        }

        // Try to get the title
        const title = (await captchaImg.getAttribute('title').catch(() => undefined)) ?? null;
        if (title) {
          const mathMatch = title.match(/(\d+[\s]*[+\-*/][\s]*\d+(?:[\s]*[+\-*/][\s]*\d+)*)/);
          if (mathMatch) {
            this.logger.info(`Found math expression in image title: ${mathMatch[1]}`);
            return mathMatch[1] ?? null;
          }
        }
      }

      // Look for text content near the captcha section
      const captchaSection = frame
        .locator('*:has-text("Varnostna koda"), *:has-text("Vpišite rezultat")')
        .first();
      if (await captchaSection.isVisible({ timeout: 2000 }).catch(() => false)) {
        const sectionText = (await captchaSection.textContent().catch(() => undefined)) ?? null;
        if (sectionText) {
          const mathMatch = sectionText.match(/(\d+[\s]*[+\-*/][\s]*\d+(?:[\s]*[+\-*/][\s]*\d+)*)/);
          if (mathMatch) {
            this.logger.info(`Found math expression in section text: ${mathMatch[1]}`);
            return mathMatch[1] ?? null;
          }
        }
      }

      // Try to look for any element containing math-like text
      const allText =
        (await frame
          .locator('body')
          .textContent()
          .catch(() => undefined)) ?? null;
      if (allText) {
        const mathMatch = allText.match(/(\d+[\s]*[+\-*/][\s]*\d+(?:[\s]*[+\-*/][\s]*\d+)*)/);
        if (mathMatch) {
          this.logger.info(`Found math expression in page text: ${mathMatch[1]}`);
          return mathMatch[1] ?? null;
        }
      }

      this.logger.warn('Could not extract math expression from captcha');
      return null;
    } catch (error) {
      this.logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to extract captcha expression'
      );
      return null;
    }
  }

  /**
   * Check if captcha error message is present
   */
  private async hasErrorMessage(): Promise<boolean> {
    try {
      const frame = this.page.frameLocator('iframe[src*="bentral.com"]');

      const errorTexts = [
        'Vnesite rezultat seštevka s slike',
        'Vnesite rezultat',
        'seštevka s slike',
        'Napačen rezultat',
        'Wrong result',
        'Invalid captcha',
      ];

      // Check for visible text elements
      for (const errorText of errorTexts) {
        try {
          const errorLocator = frame.getByText(errorText, { exact: false });
          const count = await errorLocator.count().catch(() => 0);

          if (count > 0) {
            for (let i = 0; i < count; i++) {
              const element = errorLocator.nth(i);
              const isVisible = await element.isVisible({ timeout: 200 }).catch(() => false);

              if (isVisible) {
                const textContent = (await element.textContent().catch(() => undefined)) ?? '';
                if (textContent.trim().length > 0) {
                  this.logger.debug(`Found visible error text: "${errorText}"`);
                  return true;
                }
              }
            }
          }
        } catch {
          continue;
        }
      }

      // Fallback - check for error element classes
      const errorSelectors = [
        '.error',
        '.alert-danger',
        '.text-danger',
        '.captcha-error',
        '.validation-error',
      ];

      for (const selector of errorSelectors) {
        try {
          const errorElements = frame.locator(selector);
          const count = await errorElements.count().catch(() => 0);

          if (count > 0) {
            for (let i = 0; i < count; i++) {
              const element = errorElements.nth(i);
              const isVisible = await element.isVisible({ timeout: 200 }).catch(() => false);

              if (isVisible) {
                const textContent = (await element.textContent().catch(() => undefined)) ?? '';
                for (const errorText of errorTexts) {
                  if (textContent.toLowerCase().includes(errorText.toLowerCase())) {
                    this.logger.debug(`Found visible error element: "${selector}"`);
                    return true;
                  }
                }
              }
            }
          }
        } catch {
          continue;
        }
      }

      this.logger.debug('No captcha error message found - form appears valid');
      return false;
    } catch (error) {
      this.logger.debug(
        { error: error instanceof Error ? error.message : String(error) },
        'Error checking captcha error message'
      );
      return false;
    }
  }

  /**
   * Try a specific answer and check if it's correct
   */
  private async tryAnswer(answer: number): Promise<boolean> {
    try {
      this.logger.debug(`Trying captcha answer: ${answer}`);

      const frame = this.page.frameLocator('iframe[src*="bentral.com"]');

      // Try multiple selectors for the captcha input field
      const captchaSelectors = [
        'input.secure-code',
        'input[type="number"].secure-code',
        'input[type="number"]:near(img.secure-img)',
        'input[name="captcha"]',
        'input[name="security_code"]',
      ];

      let captchaInput = null;
      for (const selector of captchaSelectors) {
        try {
          const input = frame.locator(selector).first();
          if (await input.isVisible({ timeout: 1000 }).catch(() => false)) {
            this.logger.debug(`Found captcha input using selector: ${selector}`);
            captchaInput = input;
            break;
          }
        } catch {
          continue;
        }
      }

      if (!captchaInput) {
        throw new Error('Captcha input field not found');
      }

      // Fill the captcha input
      await captchaInput.click(); // Focus first
      await captchaInput.fill(''); // Clear
      await sleep(50);

      // Use pressSequentially for better input registration
      await captchaInput.pressSequentially(answer.toString(), { delay: 30 });
      await sleep(100);

      // Trigger input and change events
      await captchaInput.dispatchEvent('input');
      await captchaInput.dispatchEvent('change');
      await captchaInput.dispatchEvent('blur');

      // Wait for the form to process the input
      await sleep(this.config.delayBetweenAttempts);
      await sleep(300); // Additional time for DOM updates

      // Check if error message is gone
      const hasError = await this.hasErrorMessage();
      const isCorrect = !hasError;

      if (isCorrect) {
        this.logger.info(`✅ Captcha answer ${answer} appears correct`);
      } else {
        this.logger.debug(`❌ Captcha answer ${answer} incorrect`);
      }

      return isCorrect;
    } catch (error) {
      this.logger.error(
        { answer, error: error instanceof Error ? error.message : String(error) },
        `Failed to try captcha answer ${answer}`
      );
      return false;
    }
  }

  /**
   * Solve the captcha by trying different approaches
   */
  async solve(): Promise<number | null> {
    this.logger.info('Starting captcha solving process');

    try {
      // Approach 1: Try to extract and calculate the expression
      const expression = await this.extractExpression();
      if (expression) {
        const calculatedAnswer = this.evaluateExpression(expression);
        if (calculatedAnswer !== null) {
          this.logger.info(`Found math expression: ${expression} = ${calculatedAnswer}`);

          const isCorrect = await this.tryAnswer(calculatedAnswer);
          if (isCorrect) {
            this.logger.info(`Captcha solved with calculated answer: ${calculatedAnswer}`);
            return calculatedAnswer;
          }
        }
      }

      // Approach 2: Brute force from startNumber to maxNumber
      this.logger.info(
        `Trying brute force approach (${this.config.startNumber} to ${this.config.maxNumber})`
      );

      for (let answer = this.config.startNumber; answer <= this.config.maxNumber; answer++) {
        this.logger.debug(`Trying brute force answer ${answer}/${this.config.maxNumber}`);

        const isCorrect = await this.tryAnswer(answer);
        if (isCorrect) {
          this.logger.info(`✅ Captcha solved with brute force answer: ${answer}`);
          return answer;
        }

        // Check if page is still responsive
        try {
          const frame = this.page.frameLocator('iframe[src*="bentral.com"]');
          await frame.locator('body').count();
        } catch {
          this.logger.warn('Page may have become unresponsive during captcha solving');
          break;
        }

        // Delay between attempts
        if (answer < this.config.maxNumber) {
          await sleep(this.config.delayBetweenAttempts);
        }
      }

      this.logger.error('Failed to solve captcha with all approaches');
      return null;
    } catch (error) {
      this.logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Captcha solving failed'
      );
      return null;
    }
  }
}
