const path = require('path');
const fs = require('fs');

/**
 * Factory for creating provider instances based on configuration
 */
class ProviderFactory {
    constructor() {
        this.providers = new Map();
        this.loadProviders();
    }

    /**
     * Load all available providers from the providers directory
     */
    loadProviders() {
        const providersDir = path.join(__dirname, '..', 'providers');

        // Get all subdirectories in providers folder
        const entries = fs.readdirSync(providersDir, { withFileTypes: true });
        const providerDirs = entries
            .filter(entry => entry.isDirectory())
            .map(entry => entry.name);

        for (const providerName of providerDirs) {
            try {
                // Try to load provider class and config
                const providerPath = path.join(providersDir, providerName);
                const configPath = path.join(providerPath, 'config.json');

                // Check if provider has required files
                const providerFile = this.findProviderFile(providerPath, providerName);
                if (!providerFile || !fs.existsSync(configPath)) {
                    console.warn(`Skipping provider ${providerName}: missing files`);
                    continue;
                }

                // Load config
                const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

                // Register provider
                this.providers.set(providerName, {
                    name: providerName,
                    config,
                    classPath: providerFile
                });

                console.log(`Loaded provider: ${providerName}`);

            } catch (error) {
                console.error(`Failed to load provider ${providerName}:`, error.message);
            }
        }
    }

    /**
     * Find the main provider class file
     */
    findProviderFile(providerPath, providerName) {
        const possibleNames = [
            `${this.capitalize(providerName)}Provider.js`,
            `${providerName}Provider.js`,
            `${providerName}.js`,
            'index.js'
        ];

        for (const filename of possibleNames) {
            const filePath = path.join(providerPath, filename);
            if (fs.existsSync(filePath)) {
                return filePath;
            }
        }

        return null;
    }

    /**
     * Create a provider instance
     * @param {string} providerName - Name of the provider
     * @param {Object} overrideConfig - Optional config overrides
     * @returns {BaseProvider} Provider instance
     */
    async createProvider(providerName, overrideConfig = {}) {
        const providerInfo = this.providers.get(providerName);
        if (!providerInfo) {
            throw new Error(`Provider '${providerName}' not found. Available providers: ${this.getAvailableProviders().join(', ')}`);
        }

        // Merge configs
        const config = {
            ...providerInfo.config,
            ...overrideConfig
        };

        // Load and instantiate provider class
        const ProviderClass = require(providerInfo.classPath);
        const provider = new ProviderClass(config);

        return provider;
    }

    /**
     * Get list of available providers
     * @returns {Array<string>} Provider names
     */
    getAvailableProviders() {
        return Array.from(this.providers.keys());
    }

    /**
     * Get provider capabilities
     * @param {string} providerName - Provider name
     * @returns {Array<string>} Capabilities
     */
    getProviderCapabilities(providerName) {
        const providerInfo = this.providers.get(providerName);
        if (!providerInfo) {
            throw new Error(`Provider '${providerName}' not found`);
        }
        return providerInfo.config.capabilities || ['scrape'];
    }

    /**
     * Get provider configuration
     * @param {string} providerName - Provider name
     * @returns {Object} Provider config
     */
    getProviderConfig(providerName) {
        const providerInfo = this.providers.get(providerName);
        if (!providerInfo) {
            throw new Error(`Provider '${providerName}' not found`);
        }
        return { ...providerInfo.config };
    }

    /**
     * Check if provider supports a capability
     * @param {string} providerName - Provider name
     * @param {string} capability - Capability to check
     * @returns {boolean} True if supported
     */
    supportsCapability(providerName, capability) {
        const capabilities = this.getProviderCapabilities(providerName);
        return capabilities.includes(capability);
    }

    /**
     * Find providers that support a specific capability
     * @param {string} capability - Required capability
     * @returns {Array<string>} Provider names that support the capability
     */
    getProvidersWithCapability(capability) {
        return Array.from(this.providers.entries())
            .filter(([name, info]) => (info.config.capabilities || ['scrape']).includes(capability))
            .map(([name]) => name);
    }

    /**
     * Capitalize first letter
     */
    capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
}

// Export singleton instance
module.exports = new ProviderFactory();