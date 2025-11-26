import type { Logger } from '@services/logger/index.ts';
import type { ProviderConfig, ProviderMetadata } from '../../types/index.ts';

/**
 * Abstract base class for all providers
 * All scrapers and bookers must extend this class
 */
export abstract class BaseProvider {
  /**
   * Provider metadata (must be implemented by subclass)
   */
  abstract readonly metadata: ProviderMetadata;

  /**
   * Provider logger (child logger with provider context)
   */
  protected readonly logger: Logger;

  /**
   * Constructor
   * @param config Provider configuration
   * @param logger Parent logger
   */
  constructor(
    protected readonly config: ProviderConfig,
    logger: Logger
  ) {
    this.logger = logger.child({
      provider: config.name,
      type: config.type,
    });
  }

  /**
   * Initialize the provider
   * Called once before any operations
   * Use this to set up browser, authenticate, etc.
   */
  abstract initialize(): Promise<void>;

  /**
   * Clean up resources
   * Called when provider is no longer needed
   * Use this to close browser, logout, etc.
   */
  abstract cleanup(): Promise<void>;

  /**
   * Health check
   * Returns true if provider is healthy and ready
   */
  abstract healthCheck(): Promise<boolean>;

  /**
   * Validate configuration
   * Throws error if configuration is invalid
   */
  protected validateConfig(): void {
    if (!this.config.name) {
      throw new Error('Provider name is required');
    }
    if (!this.config.type) {
      throw new Error('Provider type is required');
    }
  }

  /**
   * Check if provider supports a capability
   */
  supports(capability: keyof ProviderMetadata['capabilities']): boolean {
    return !!this.metadata.capabilities[capability];
  }

  /**
   * Get provider ID
   */
  get id(): string {
    return this.metadata.id;
  }

  /**
   * Get provider name
   */
  get name(): string {
    return this.metadata.name;
  }

  /**
   * Get provider version
   */
  get version(): string {
    return this.metadata.version;
  }

  /**
   * Check if provider is enabled
   */
  get enabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Log helper methods
   */
  protected log = {
    debug: (msg: string, data?: Record<string, unknown>) => {
      this.logger.debug(data ?? {}, msg);
    },
    info: (msg: string, data?: Record<string, unknown>) => {
      this.logger.info(data ?? {}, msg);
    },
    warn: (msg: string, data?: Record<string, unknown>) => {
      this.logger.warn(data ?? {}, msg);
    },
    error: (msg: string, error?: Error, data?: Record<string, unknown>) => {
      this.logger.error(
        {
          ...data,
          error: error?.message,
          stack: error?.stack,
        },
        msg
      );
    },
  };
}
