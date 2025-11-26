/**
 * Abstract base class for all booking providers
 * Defines the standard interface that all providers must implement
 */
class BaseProvider {
    constructor(config) {
        if (this.constructor === BaseProvider) {
            throw new Error('BaseProvider is an abstract class and cannot be instantiated directly');
        }

        this.config = config;
        this.capabilities = ['scrape']; // Default capability
        this.browser = null;
        this.page = null;
    }

    /**
     * Initialize the provider (browser setup, authentication, etc.)
     * @returns {Promise<void>}
     */
    async initialize() {
        throw new Error('initialize() must be implemented by provider subclass');
    }

    /**
     * Scrape availability data for a property
     * @param {Object} property - Property information
     * @param {Object} options - Scraping options (date range, room type, etc.)
     * @returns {Promise<Object>} Standardized availability data
     */
    async scrapeAvailability(property, options = {}) {
        throw new Error('scrapeAvailability() must be implemented by provider subclass');
    }

    /**
     * Book a reservation (if provider supports booking)
     * @param {Object} booking - Booking information
     * @returns {Promise<Object>} Booking confirmation
     */
    async book(booking) {
        if (!this.capabilities.includes('book')) {
            throw new Error(`Provider ${this.constructor.name} does not support booking`);
        }
        throw new Error('book() must be implemented by provider subclass');
    }

    /**
     * Clean up resources (close browser, logout, etc.)
     * @returns {Promise<void>}
     */
    async cleanup() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.page = null;
        }
    }

    /**
     * Validate configuration
     * @returns {boolean} True if config is valid
     */
    validateConfig() {
        if (!this.config) {
            throw new Error('Provider configuration is required');
        }
        return true;
    }

    /**
     * Format results in standardized format
     * @param {Object} rawData - Raw scraping results
     * @returns {Object} Standardized format
     */
    formatResults(rawData) {
        return {
            provider: this.constructor.name.toLowerCase().replace('provider', ''),
            scrapedAt: new Date().toISOString(),
            data: rawData
        };
    }

    /**
     * Get provider capabilities
     * @returns {Array<string>} List of capabilities
     */
    getCapabilities() {
        return [...this.capabilities];
    }

    /**
     * Check if provider supports a specific capability
     * @param {string} capability - Capability to check
     * @returns {boolean} True if supported
     */
    supports(capability) {
        return this.capabilities.includes(capability);
    }

    /**
     * Log provider activity
     * @param {string} level - Log level (info, error, debug)
     * @param {string} message - Log message
     * @param {Object} data - Additional data
     */
    log(level, message, data = {}) {
        const timestamp = new Date().toISOString();
        const providerName = this.constructor.name;
        console.log(`[${timestamp}] [${level.toUpperCase()}] [${providerName}] ${message}`, data);
    }
}

module.exports = BaseProvider;