import type { Logger } from '@services/logger/index.ts';
import type { ProviderConfig, ProviderMetadata } from '../../types/index.ts';
import type { BaseBooker } from '../booking/BaseBooker.ts';
import type { BaseScraper } from '../scraper/BaseScraper.ts';
import type { BaseProvider } from './BaseProvider.ts';

/**
 * Provider constructor type
 */
type ProviderConstructor = new (config: ProviderConfig, logger: Logger) => BaseProvider;

/**
 * Registered provider information
 */
interface RegisteredProvider {
  id: string;
  constructor: ProviderConstructor;
  config: ProviderConfig;
  instance?: BaseProvider;
  metadata?: ProviderMetadata;
}

/**
 * ProviderRegistry
 * Manages registration and instantiation of providers
 * Supports lazy loading and singleton instances
 */
export class ProviderRegistry {
  private providers = new Map<string, RegisteredProvider>();
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child({ component: 'ProviderRegistry' });
  }

  /**
   * Register a provider
   */
  register(id: string, providerClass: ProviderConstructor, config: ProviderConfig): void {
    if (this.providers.has(id)) {
      this.logger.warn(`Provider ${id} is already registered, overwriting`);
    }

    this.providers.set(id, {
      id,
      constructor: providerClass,
      config,
    });

    this.logger.info(`Registered provider: ${id}`, {
      type: config.type,
      enabled: config.enabled,
    });
  }

  /**
   * Unregister a provider
   */
  unregister(id: string): boolean {
    const provider = this.providers.get(id);
    if (!provider) {
      return false;
    }

    // Cleanup instance if exists
    if (provider.instance) {
      provider.instance.cleanup().catch((error) => {
        this.logger.error(`Error cleaning up provider ${id}`, error);
      });
    }

    this.providers.delete(id);
    this.logger.info(`Unregistered provider: ${id}`);

    return true;
  }

  /**
   * Get a provider instance (lazy initialization)
   */
  async get(id: string): Promise<BaseProvider> {
    const registered = this.providers.get(id);
    if (!registered) {
      throw new Error(`Provider not found: ${id}`);
    }

    // Return existing instance
    if (registered.instance) {
      return registered.instance;
    }

    // Create new instance
    this.logger.info(`Initializing provider: ${id}`);
    const instance = new registered.constructor(registered.config, this.logger);

    // Initialize the provider
    await instance.initialize();

    // Store metadata
    registered.metadata = instance.metadata;
    registered.instance = instance;

    this.logger.info(`Provider initialized: ${id}`, {
      type: instance.metadata.type,
      version: instance.metadata.version,
    });

    return instance;
  }

  /**
   * Get a scraper provider
   */
  async getScraper(id: string): Promise<BaseScraper> {
    const provider = await this.get(id);

    if (provider.metadata.type !== 'scraper' && provider.metadata.type !== 'both') {
      throw new Error(`Provider ${id} is not a scraper`);
    }

    return provider as BaseScraper;
  }

  /**
   * Get a booker provider
   */
  async getBooker(id: string): Promise<BaseBooker> {
    const provider = await this.get(id);

    if (provider.metadata.type !== 'booker' && provider.metadata.type !== 'both') {
      throw new Error(`Provider ${id} is not a booker`);
    }

    return provider as BaseBooker;
  }

  /**
   * Check if a provider is registered
   */
  has(id: string): boolean {
    return this.providers.has(id);
  }

  /**
   * Check if a provider is initialized
   */
  isInitialized(id: string): boolean {
    const provider = this.providers.get(id);
    return provider?.instance !== undefined;
  }

  /**
   * Get all registered provider IDs
   */
  getAll(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Get all providers of a specific type
   */
  getByType(type: 'scraper' | 'booker' | 'both'): string[] {
    return Array.from(this.providers.values())
      .filter((p) => p.config.type === type || (type !== 'both' && p.config.type === 'both'))
      .map((p) => p.id);
  }

  /**
   * Get all enabled providers
   */
  getEnabled(): string[] {
    return Array.from(this.providers.values())
      .filter((p) => p.config.enabled)
      .map((p) => p.id);
  }

  /**
   * Get metadata for a registered provider
   */
  getMetadata(id: string): ProviderMetadata | undefined {
    return this.providers.get(id)?.metadata;
  }

  /**
   * Get config for a registered provider
   */
  getConfig(id: string): ProviderConfig | undefined {
    return this.providers.get(id)?.config;
  }

  /**
   * Update provider configuration
   */
  updateConfig(id: string, config: Partial<ProviderConfig>): void {
    const provider = this.providers.get(id);
    if (!provider) {
      throw new Error(`Provider not found: ${id}`);
    }

    if (provider.instance) {
      this.logger.warn(
        `Updating config for already initialized provider ${id}. Changes may not take effect until re-initialization.`
      );
    }

    provider.config = { ...provider.config, ...config };
    this.logger.info(`Updated config for provider: ${id}`);
  }

  /**
   * Cleanup a specific provider
   */
  async cleanup(id: string): Promise<void> {
    const provider = this.providers.get(id);
    if (!provider?.instance) {
      return;
    }

    this.logger.info(`Cleaning up provider: ${id}`);

    await provider.instance.cleanup();
    delete provider.instance;

    this.logger.info(`Provider cleaned up: ${id}`);
  }

  /**
   * Cleanup all initialized providers
   */
  async cleanupAll(): Promise<void> {
    this.logger.info('Cleaning up all providers');

    const cleanupPromises = Array.from(this.providers.values())
      .filter((p) => p.instance)
      .map((p) => this.cleanup(p.id));

    await Promise.allSettled(cleanupPromises);

    this.logger.info('All providers cleaned up');
  }

  /**
   * Get registry statistics
   */
  getStats(): {
    total: number;
    initialized: number;
    enabled: number;
    scrapers: number;
    bookers: number;
  } {
    const all = Array.from(this.providers.values());

    return {
      total: all.length,
      initialized: all.filter((p) => p.instance).length,
      enabled: all.filter((p) => p.config.enabled).length,
      scrapers: all.filter((p) => p.config.type === 'scraper' || p.config.type === 'both').length,
      bookers: all.filter((p) => p.config.type === 'booker' || p.config.type === 'both').length,
    };
  }
}

/**
 * Global provider registry instance
 */
export let registry: ProviderRegistry | null = null;

/**
 * Initialize the global registry
 */
export function initializeRegistry(logger: Logger): ProviderRegistry {
  if (registry) {
    logger.warn('Provider registry already initialized');
    return registry;
  }

  registry = new ProviderRegistry(logger);
  logger.info('Provider registry initialized');

  return registry;
}

/**
 * Get the global registry
 */
export function getRegistry(): ProviderRegistry {
  if (!registry) {
    throw new Error('Provider registry not initialized. Call initializeRegistry() first.');
  }

  return registry;
}
