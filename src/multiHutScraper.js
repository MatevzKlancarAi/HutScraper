const MountainHutScraper = require('./MountainHutScraper');
const database = require('./services/database');
const logger = require('./services/logger');

/**
 * Multi-Hut Scraper - Scrapes all huts and their room types
 */
class MultiHutScraper {
    constructor(options = {}) {
        this.options = {
            maxConcurrency: 2, // Number of concurrent browsers
            delayBetweenHuts: 5000, // Delay between huts (ms)
            delayBetweenRooms: 2000, // Delay between room types (ms)
            testMode: true, // Only scrape September 2025 if true
            targetHuts: null, // Array of hut names to scrape (null = all)
            ...options
        };
        
        this.results = {
            startTime: new Date(),
            endTime: null,
            hutsProcessed: 0,
            roomTypesProcessed: 0,
            totalAvailableDates: 0,
            hutResults: {},
            errors: []
        };
    }
    
    /**
     * Get all properties from database
     */
    async getAllProperties() {
        await database.initialize();
        
        const query = `
            SELECT 
                p.id,
                p.name,
                p.slug,
                COUNT(rt.id) as room_types_count
            FROM properties p
            LEFT JOIN room_types rt ON p.id = rt.property_id AND rt.is_active = true
            WHERE p.is_active = true
            GROUP BY p.id, p.name, p.slug
            ORDER BY p.name
        `;
        
        const result = await database.query(query);
        return result.rows;
    }
    
    /**
     * Get room types for a specific property
     */
    async getRoomTypesForProperty(propertyId) {
        const query = `
            SELECT 
                id,
                name,
                external_id,
                capacity,
                bed_type,
                room_category
            FROM room_types
            WHERE property_id = $1 AND is_active = true
            ORDER BY name
        `;
        
        const result = await database.query(query, [propertyId]);
        return result.rows;
    }
    
    /**
     * Get hut configuration from our stored config
     */
    getHutConfig(propertyName) {
        const fs = require('fs');
        const path = require('path');
        
        // Load huts configuration with Bentral IDs and keys
        const hutsConfigPath = path.join(__dirname, '..', 'config', 'huts-bentral-ids.json');
        if (!fs.existsSync(hutsConfigPath)) {
            throw new Error('Huts configuration not found. Run room type discovery first.');
        }
        
        const hutsConfig = JSON.parse(fs.readFileSync(hutsConfigPath, 'utf8'));
        
        // Find the matching hut
        const hut = hutsConfig.huts.find(h => h.name === propertyName);
        if (!hut) {
            throw new Error(`Hut configuration not found for: ${propertyName}`);
        }
        
        return hut;
    }

    /**
     * Create scraper config for a specific hut
     */
    createHutConfig(property, targetMonths) {        
        return {
            target: {
                name: property.name,
                baseUrl: `https://reservations.microgramm.si/hud/${property.slug}/`,
                bookingSystem: 'Bentral'
            },
            bentral: {
                iframeUrl: 'PLACEHOLDER', // Will be updated per room type with correct key
                selectors: {
                    roomSelect: 'select[name="unit[]"]',
                    arrivalInput: 'input[name="formated_arrival"]',
                    calendarSwitch: '.datepicker-switch',
                    calendarDays: '.datepicker-days td',
                    nextButton: '.datepicker-days .next',
                    prevButton: '.datepicker-days .prev'
                },
                availability: {
                    requiredClasses: ['day'],
                    excludedClasses: ['unavail', 'disabled', 'old', 'new'],
                    excludedTitles: ['zasedeno', 'occupied']
                }
            },
            scraper: {
                browser: {
                    headless: true,
                    slowMo: 0,
                    timeout: 30000
                },
                targetMonths: targetMonths,
                output: {
                    saveResults: true,
                    saveScreenshots: false, // Disable screenshots for bulk scraping
                    resultsDir: './results',
                    screenshotsDir: './screenshots'
                }
            }
        };
    }
    
    /**
     * Get target months based on test mode
     */
    getTargetMonths() {
        if (this.options.testMode) {
            return ['September 2025']; // Just one month for testing
        } else {
            return [
                'September 2025', 'Oktober 2025', 'November 2025', 'December 2025',
                'Januar 2026', 'Februar 2026', 'Marec 2026', 'April 2026',
                'Maj 2026', 'Junij 2026', 'Julij 2026', 'Avgust 2026'
            ];
        }
    }
    
    /**
     * Scrape a single room type for a hut
     */
    async scrapeRoomType(property, roomType, targetMonths) {
        const hutConfig = this.createHutConfig(property, targetMonths);
        
        // Get the hut's Bentral configuration (ID and key)
        const hutBentralConfig = this.getHutConfig(property.name);
        
        // Build the correct Bentral iframe URL using the hut's main Bentral ID and key
        // We'll select the specific room using the room selector dropdown
        const bentralUrl = `https://www.bentral.com/service/embed/booking.html?id=${hutBentralConfig.bentralId}&title=0&width=full&header-bg=edeff4&header-color=363c49&header2-bg=edeff4&header2-color=363c49&table-bg=edeff4&table-color=363c49&btn-bg=12509b&border-width=0&poweredby=0&lang=sl&key=${hutBentralConfig.key}`;
        
        hutConfig.bentral.iframeUrl = bentralUrl;
        
        logger.info(`Scraping room type`, {
            hut: property.name,
            roomType: roomType.name,
            externalId: roomType.external_id,
            capacity: roomType.capacity,
            bentralUrl: bentralUrl
        });
        
        const scraper = new MountainHutScraper({
            ...hutConfig,
            saveToDatabase: true,
            saveToFile: false // Don't save individual JSON files
        });
        
        try {
            const results = await scraper.scrape(roomType.name);
            
            logger.info(`Successfully scraped room type`, {
                hut: property.name,
                roomType: roomType.name,
                totalDays: results.summary.totalDays,
                availableDays: results.summary.totalAvailable,
                availabilityRate: results.summary.overallAvailabilityRate
            });
            
            return {
                success: true,
                roomType: roomType.name,
                results: results.summary,
                error: null
            };
            
        } catch (error) {
            logger.error(`Failed to scrape room type`, {
                hut: property.name,
                roomType: roomType.name,
                error: error.message
            });
            
            return {
                success: false,
                roomType: roomType.name,
                results: null,
                error: error.message
            };
        }
    }
    
    /**
     * Scrape all room types for a single hut using optimized browser reuse
     */
    async scrapeHut(property, targetMonths) {
        logger.info(`Starting hut scraping`, { hut: property.name });
        
        const roomTypes = await this.getRoomTypesForProperty(property.id);
        
        if (roomTypes.length === 0) {
            logger.warn(`No room types found for hut`, { hut: property.name });
            return {
                success: false,
                roomResults: [],
                error: 'No room types found'
            };
        }
        
        logger.info(`Found room types for hut`, { 
            hut: property.name, 
            roomTypesCount: roomTypes.length 
        });
        
        // Use optimized scraper that reuses browser for all rooms in this hut
        return await this.scrapeHutOptimized(property, roomTypes, targetMonths);
    }
    
    /**
     * Main scraping method - scrape all huts
     */
    async scrapeAllHuts() {
        try {
            logger.info('Starting multi-hut scraping', {
                testMode: this.options.testMode,
                maxConcurrency: this.options.maxConcurrency,
                targetHuts: this.options.targetHuts
            });
            
            // Get all properties from database
            const allProperties = await this.getAllProperties();
            
            // Filter properties if targetHuts specified
            let properties = allProperties;
            if (this.options.targetHuts && Array.isArray(this.options.targetHuts)) {
                properties = allProperties.filter(p => 
                    this.options.targetHuts.includes(p.name) ||
                    this.options.targetHuts.includes(p.slug)
                );
            }
            
            if (properties.length === 0) {
                throw new Error('No properties found to scrape');
            }
            
            logger.info(`Found properties to scrape`, { 
                totalProperties: properties.length,
                properties: properties.map(p => p.name)
            });
            
            const targetMonths = this.getTargetMonths();
            
            // Process huts with controlled concurrency
            const concurrency = Math.min(this.options.maxConcurrency, properties.length);
            logger.info(`Processing huts with concurrency: ${concurrency}`);
            
            const processHut = async (property, index) => {
                logger.info(`Processing hut ${index + 1}/${properties.length}`, { 
                    hut: property.name 
                });
                
                const hutResult = await this.scrapeHut(property, targetMonths);
                
                this.results.hutResults[property.name] = hutResult;
                this.hutsProcessed++;
                
                return hutResult;
            };
            
            // Process huts in batches of maxConcurrency
            for (let i = 0; i < properties.length; i += concurrency) {
                const batch = properties.slice(i, i + concurrency);
                const batchPromises = batch.map((property, batchIndex) => 
                    processHut(property, i + batchIndex)
                );
                
                await Promise.all(batchPromises);
                
                // Small delay between batches
                if (i + concurrency < properties.length) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
            
            this.results.endTime = new Date();
            
            // Final summary
            const successfulHuts = Object.values(this.results.hutResults).filter(r => r.success).length;
            const totalDuration = Math.round((this.results.endTime - this.results.startTime) / 1000 / 60);
            
            logger.info('Multi-hut scraping completed', {
                hutsProcessed: this.hutsProcessed,
                successfulHuts: successfulHuts,
                roomTypesProcessed: this.roomTypesProcessed,
                totalAvailableDates: this.totalAvailableDates,
                errorCount: this.results.errors.length,
                durationMinutes: totalDuration
            });
            
            return this.results;
            
        } catch (error) {
            logger.error('Multi-hut scraping failed', { error: error.message });
            this.results.endTime = new Date();
            throw error;
        } finally {
            await database.close();
        }
    }
    
    /**
     * Optimized scraping with parallel processing of room types within a hut
     */
    async scrapeHutOptimized(property, roomTypes, targetMonths) {
        const roomResults = [];
        
        // Process up to 2 room types in parallel within the same hut
        const roomConcurrency = 2;
        
        for (let i = 0; i < roomTypes.length; i += roomConcurrency) {
            const batch = roomTypes.slice(i, i + roomConcurrency);
            
            const batchPromises = batch.map(async (roomType) => {
                try {
                    const result = await this.scrapeRoomType(property, roomType, targetMonths);
                    
                    this.roomTypesProcessed++;
                    
                    if (result.success) {
                        this.totalAvailableDates += result.results.totalAvailable || 0;
                    } else {
                        this.results.errors.push({
                            hut: property.name,
                            roomType: roomType.name,
                            error: result.error
                        });
                    }
                    
                    return result;
                } catch (error) {
                    logger.error(`Failed to scrape room type`, {
                        hut: property.name,
                        roomType: roomType.name,
                        error: error.message
                    });
                    
                    this.roomTypesProcessed++;
                    this.results.errors.push({
                        hut: property.name,
                        roomType: roomType.name,
                        error: error.message
                    });
                    
                    return {
                        success: false,
                        roomType: roomType.name,
                        results: null,
                        error: error.message
                    };
                }
            });
            
            const batchResults = await Promise.all(batchPromises);
            roomResults.push(...batchResults);
            
            // Small delay between batches
            if (i + roomConcurrency < roomTypes.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        const successCount = roomResults.filter(r => r.success).length;
        logger.info(`Completed hut scraping`, {
            hut: property.name,
            successCount,
            totalRoomTypes: roomTypes.length,
            successRate: `${Math.round((successCount / roomTypes.length) * 100)}%`
        });
        
        return {
            success: successCount > 0,
            roomResults: roomResults,
            error: successCount === 0 ? 'All room types failed' : null
        };
    }
    
    /**
     * Get current results
     */
    getResults() {
        return this.results;
    }
}

module.exports = MultiHutScraper;