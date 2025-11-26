import type { Logger } from '@services/logger/index.ts';
import { sleep } from '@utils/sleep.ts';
import { type Browser, type Page, chromium } from 'playwright';
import type { BrowserConfig, BrowserSession, ScreenshotOptions } from './types.ts';

/**
 * BrowserManager
 * Manages Playwright browser instances and pages
 * Provides utilities for common browser operations
 */
export class BrowserManager {
  private browsers = new Map<string, Browser>();
  private sessions = new Map<string, BrowserSession>();
  private config: BrowserConfig;
  private logger: Logger;

  constructor(config: BrowserConfig, logger: Logger) {
    this.config = config;
    this.logger = logger.child({ component: 'BrowserManager' });
  }

  /**
   * Launch a new browser instance
   */
  async launchBrowser(sessionId: string): Promise<Browser> {
    this.logger.info(`Launching browser for session: ${sessionId}`);

    const browser = await chromium.launch({
      headless: this.config.headless,
      slowMo: this.config.slowMo,
      timeout: this.config.timeout,
      ...(this.config.args && { args: this.config.args }),
    });

    this.browsers.set(sessionId, browser);
    this.logger.info(`Browser launched for session: ${sessionId}`);

    return browser;
  }

  /**
   * Create a new browser session (browser + context + page)
   */
  async createSession(sessionId: string): Promise<BrowserSession> {
    const browser = await this.launchBrowser(sessionId);

    this.logger.debug(`Creating browser context for session: ${sessionId}`);
    const context = await browser.newContext({
      ...(this.config.viewport && { viewport: this.config.viewport }),
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    this.logger.debug(`Creating page for session: ${sessionId}`);
    const page = await context.newPage();

    // Set default timeout
    page.setDefaultTimeout(this.config.timeout);

    const session: BrowserSession = {
      browser,
      context,
      page,
      sessionId,
    };

    this.sessions.set(sessionId, session);
    this.logger.info(`Browser session created: ${sessionId}`);

    return session;
  }

  /**
   * Get an existing session
   */
  getSession(sessionId: string): BrowserSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Close a specific session
   */
  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.logger.warn(`Session not found: ${sessionId}`);
      return;
    }

    this.logger.info(`Closing session: ${sessionId}`);

    try {
      await session.page.close();
      await session.context.close();
      await session.browser.close();
    } catch (error) {
      this.logger.error(
        `Error closing session: ${sessionId}`,
        error instanceof Error ? error : new Error(String(error))
      );
    } finally {
      this.sessions.delete(sessionId);
      this.browsers.delete(sessionId);
    }

    this.logger.info(`Session closed: ${sessionId}`);
  }

  /**
   * Close all sessions
   */
  async closeAll(): Promise<void> {
    this.logger.info(`Closing all ${this.sessions.size} sessions`);

    const closePromises = Array.from(this.sessions.keys()).map((sessionId) =>
      this.closeSession(sessionId)
    );

    await Promise.all(closePromises);
    this.logger.info('All sessions closed');
  }

  /**
   * Navigate to a URL
   */
  async goto(
    page: Page,
    url: string,
    options?: { timeout?: number; waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' }
  ): Promise<void> {
    this.logger.debug(`Navigating to: ${url}`);

    try {
      await page.goto(url, {
        timeout: options?.timeout ?? this.config.timeout,
        waitUntil: options?.waitUntil ?? 'load',
      });

      this.logger.debug(`Navigation complete: ${url}`);
    } catch (error) {
      this.logger.error(
        `Navigation failed: ${url}`,
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  /**
   * Wait for a selector to appear
   */
  async waitForSelector(
    page: Page,
    selector: string,
    options?: { timeout?: number; state?: 'attached' | 'detached' | 'visible' | 'hidden' }
  ): Promise<void> {
    this.logger.debug(`Waiting for selector: ${selector}`);

    try {
      await page.waitForSelector(selector, {
        timeout: options?.timeout ?? this.config.timeout,
        state: options?.state ?? 'visible',
      });

      this.logger.debug(`Selector found: ${selector}`);
    } catch (error) {
      this.logger.error(
        `Selector not found: ${selector}`,
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  /**
   * Take a screenshot
   */
  async screenshot(page: Page, options: ScreenshotOptions): Promise<string> {
    this.logger.debug(`Taking screenshot: ${options.path}`);

    try {
      await page.screenshot({
        path: options.path,
        fullPage: options.fullPage ?? false,
        ...(options.quality !== undefined && { quality: options.quality }),
      });

      this.logger.debug(`Screenshot saved: ${options.path}`);
      return options.path;
    } catch (error) {
      this.logger.error(
        'Screenshot failed',
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  /**
   * Click an element
   */
  async click(page: Page, selector: string, options?: { delay?: number }): Promise<void> {
    this.logger.debug(`Clicking: ${selector}`);

    await page.click(selector, {
      delay: options?.delay ?? 0,
    });

    this.logger.debug(`Clicked: ${selector}`);
  }

  /**
   * Type text into an input
   */
  async type(
    page: Page,
    selector: string,
    text: string,
    options?: { delay?: number }
  ): Promise<void> {
    this.logger.debug(`Typing into: ${selector}`);

    await page.fill(selector, text);

    if (options?.delay) {
      await sleep(options.delay);
    }

    this.logger.debug(`Typed into: ${selector}`);
  }

  /**
   * Select an option from a dropdown
   */
  async select(page: Page, selector: string, value: string): Promise<void> {
    this.logger.debug(`Selecting ${value} from: ${selector}`);

    await page.selectOption(selector, value);

    this.logger.debug(`Selected ${value} from: ${selector}`);
  }

  /**
   * Evaluate JavaScript in the page context
   */
  async evaluate<T>(page: Page, pageFunction: () => T): Promise<T> {
    return await page.evaluate(pageFunction);
  }

  /**
   * Wait for a specific amount of time
   */
  async wait(ms: number): Promise<void> {
    this.logger.debug(`Waiting ${ms}ms`);
    await sleep(ms);
  }

  /**
   * Get current page content
   */
  async getContent(page: Page): Promise<string> {
    return await page.content();
  }

  /**
   * Check if an element exists
   */
  async elementExists(page: Page, selector: string): Promise<boolean> {
    try {
      const element = await page.$(selector);
      return element !== null;
    } catch {
      return false;
    }
  }

  /**
   * Get text content of an element
   */
  async getText(page: Page, selector: string): Promise<string | null> {
    try {
      const element = await page.$(selector);
      if (!element) return null;

      return await element.textContent();
    } catch (_error) {
      this.logger.warn(`Failed to get text from ${selector}`);
      return null;
    }
  }

  /**
   * Get all text contents matching a selector
   */
  async getAllText(page: Page, selector: string): Promise<string[]> {
    try {
      const elements = await page.$$(selector);
      const texts = await Promise.all(elements.map((el) => el.textContent()));
      return texts.filter((text): text is string => text !== null);
    } catch (_error) {
      this.logger.warn(`Failed to get all text from ${selector}`);
      return [];
    }
  }

  /**
   * Get attribute value
   */
  async getAttribute(page: Page, selector: string, attribute: string): Promise<string | null> {
    try {
      const element = await page.$(selector);
      if (!element) return null;

      return await element.getAttribute(attribute);
    } catch (_error) {
      this.logger.warn(`Failed to get attribute ${attribute} from ${selector}`);
      return null;
    }
  }

  /**
   * Get number of active sessions
   */
  getActiveSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Get all session IDs
   */
  getSessionIds(): string[] {
    return Array.from(this.sessions.keys());
  }
}
