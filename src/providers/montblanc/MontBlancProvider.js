const BaseProvider = require('../BaseProvider');
const https = require('https');

/**
 * Mont Blanc Tour Provider - gets availability from REST API
 * Uses the etape-rest.for-system.com API endpoint for availability data
 */
class MontBlancProvider extends BaseProvider {
    constructor(config) {
        super(config);
        this.capabilities = ['scrape'];
        this.apiBaseUrl = 'https://etape-rest.for-system.com/index.aspx';
    }

    /**
     * Initialize the provider (no browser needed for API)
     */
    async initialize() {
        this.validateConfig();
        this.log('info', 'Initializing Mont Blanc API provider');
        this.log('info', 'Mont Blanc provider initialized successfully - using direct API');
    }

    /**
     * Scrape availability for a specific hut using the API
     * @param {Object} property - Property with id/hutId and name
     * @param {Object} options - Options with months to check
     * @returns {Promise<Object>} Availability data
     */
    async scrapeAvailability(property, options = {}) {
        const hutId = property.id || property.hutId;
        const name = property.name;
        const { months = 2 } = options; // Default to checking 2 months ahead

        this.log('info', `Scraping availability for ${name} (${hutId}) using API`);

        try {
            const availabilityData = [];
            const currentDate = new Date();

            // Get availability for the specified number of months
            for (let monthOffset = 0; monthOffset < months; monthOffset++) {
                const startDate = new Date(currentDate);
                startDate.setMonth(currentDate.getMonth() + monthOffset);
                startDate.setDate(1); // Start from first day of month

                this.log('debug', `Fetching availability starting from ${startDate.toISOString().split('T')[0]}`);

                const monthAvailability = await this.fetchAvailabilityFromAPI(hutId, startDate);
                availabilityData.push(...monthAvailability);

                // Small delay between API calls to be respectful
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            this.log('info', `Found ${availabilityData.length} availability records for ${name}`);

            return this.formatResults({
                hutId,
                hutName: name,
                availability: availabilityData,
                apiUsed: this.apiBaseUrl
            });

        } catch (error) {
            this.log('error', `Error scraping ${name}:`, error.message);
            throw error;
        }
    }

    /**
     * Fetch availability data from the API
     * @param {string} hutId - Hut ID
     * @param {Date} startDate - Starting date for availability check
     * @returns {Promise<Array>} Array of availability records
     */
    async fetchAvailabilityFromAPI(hutId, startDate) {
        // Use current date as the API seems to return data relative to today
        const today = new Date();
        const dateStr = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;

        // Build the API URL
        const url = `${this.apiBaseUrl}?ref=json-planning-refuge&q=${hutId},${dateStr}`;

        this.log('debug', `Fetching from API: ${url}`);

        try {
            const response = await this.makeAPIRequest(url);
            this.log('debug', `API Response: ${response.substring(0, 200)}...`); // Log first 200 chars
            return this.parseAPIResponse(response, null); // Let parseAPIResponse use the datemini from response

        } catch (error) {
            this.log('error', `API request failed:`, error.message);
            return [];
        }
    }

    /**
     * Make an HTTP request to the API
     * @param {string} url - API URL
     * @returns {Promise<string>} Response text
     */
    async makeAPIRequest(url) {
        return new Promise((resolve, reject) => {
            https.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                    'Accept': '*/*',
                    'Referer': 'https://www.montourdumontblanc.com/'
                }
            }, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    resolve(data);
                });

            }).on('error', (err) => {
                reject(err);
            });
        });
    }

    /**
     * Parse the JSONP API response
     * @param {string} response - JSONP response string
     * @param {Date} baseDate - Base date for calculating actual dates
     * @returns {Array} Parsed availability records
     */
    parseAPIResponse(response, baseDate) {
        try {
            // Extract JSON from response - it might be pure JSON or JSONP
            let jsonData;

            // First try to find JSON array in JSONP response
            const jsonMatch = response.match(/\[.*\]/);
            if (jsonMatch) {
                jsonData = JSON.parse(jsonMatch[0]);
            } else {
                // Try parsing as pure JSON
                jsonData = JSON.parse(response);
            }
            if (!jsonData || jsonData.length === 0) {
                return [];
            }

            const refugeData = jsonData[0];
            const planning = refugeData.planning || [];

            // Use the datemini from the API response as the base date
            const apiBaseDate = new Date(refugeData.datemini);
            this.log('debug', `Using API base date: ${refugeData.datemini}`);

            const availability = [];

            planning.forEach(record => {
                // Calculate actual date from API base date and day offset
                const actualDate = new Date(apiBaseDate);
                actualDate.setDate(apiBaseDate.getDate() + record.d);

                const dateStr = actualDate.toISOString().split('T')[0];
                const today = new Date();
                today.setHours(0, 0, 0, 0); // Reset time to beginning of day

                // Skip dates in the past (but include today)
                if (actualDate < today) {
                    this.log('debug', `Skipping past date: ${dateStr} (offset: ${record.d})`);
                    return;
                }

                this.log('debug', `Adding availability for ${dateStr}: ${record.s} spots, flag: ${record.f}`);

                availability.push({
                    date: dateStr,
                    available: record.f === 0 && record.s > 0, // f=0 means open, s>0 means spots available
                    canCheckin: record.f === 0 && record.s > 0,
                    canCheckout: record.f === 0 && record.s > 0,
                    spotsAvailable: record.s,
                    isOpen: record.f === 0,
                    debug: {
                        spots: record.s,
                        flag: record.f,
                        dayOffset: record.d
                    }
                });
            });

            this.log('debug', `Parsed ${availability.length} availability records from API`);
            return availability;

        } catch (error) {
            this.log('error', `Error parsing API response:`, error.message);
            return [];
        }
    }


    /**
     * Get list of all huts from configuration
     * @returns {Array} List of hut configurations
     */
    getHuts() {
        return this.config.huts || [];
    }

    /**
     * Validate Mont Blanc specific configuration
     */
    validateConfig() {
        super.validateConfig();

        const required = ['selectors', 'huts'];
        for (const field of required) {
            if (!this.config[field]) {
                throw new Error(`Mont Blanc provider configuration missing required field: ${field}`);
            }
        }

        if (!Array.isArray(this.config.huts) || this.config.huts.length === 0) {
            throw new Error('Mont Blanc provider configuration must include at least one hut');
        }
    }
}

module.exports = MontBlancProvider;