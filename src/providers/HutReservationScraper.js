const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const logger = require("../services/logger");
const database = require("../services/database");

/**
 * Hut-Reservation.org Scraper
 *
 * Scrapes availability data from hut-reservation.org platform
 * which manages bookings for 666+ mountain huts across AT, CH, DE, IT
 */
class HutReservationScraper {
  constructor(options = {}) {
    this.options = options;
    this.browser = null;
    this.page = null;
    this.saveToDatabase = options.saveToDatabase !== false;
    this.saveToFile = options.saveToFile !== false;
    this.propertyId = null;
    this.roomTypeId = null;
    this.hutData = null;
    this.results = {
      scrapingDate: new Date().toISOString(),
      platform: "hut-reservation.org",
      hutId: null,
      hutName: null,
      country: null,
      categories: [],
      availabilityByCategory: {},
      summary: {},
    };
  }

  /**
   * Initialize the browser and page
   * @param {number} hutId - The hut ID on hut-reservation.org
   */
  async initialize(hutId) {
    logger.info(`Initializing Hut-Reservation.org Scraper for hut ${hutId}`);

    // First fetch hut data from API
    await this.fetchHutData(hutId);

    // Initialize database connection if needed
    if (this.saveToDatabase && this.hutData) {
      await database.initialize();

      // Ensure property exists in database
      this.propertyId = await database.ensureProperty(
        this.hutData.hutName,
        `https://www.hut-reservation.org/reservation/book-hut/${hutId}/wizard`,
        `${this.hutData.hutName} - ${this.hutData.country} mountain hut on hut-reservation.org`
      );

      logger.logDatabaseOperation('property_initialized', {
        propertyId: this.propertyId,
        propertyName: this.hutData.hutName,
        country: this.hutData.country,
        platform: 'hut-reservation.org'
      });

      // Create room types for each bed category
      this.categoryToRoomTypeMap = {};
      if (this.hutData.hutBedCategories) {
        for (const category of this.hutData.hutBedCategories) {
          // Get English label from language data
          const englishLabel = category.hutBedCategoryLanguageData?.find(l => l.language === 'EN')?.label;
          const label = englishLabel || category.hutBedCategoryLanguageData?.[0]?.label || `Category ${category.categoryID}`;

          this.roomTypeId = await database.ensureRoomType(
            this.propertyId,
            label,
            category.totalSleepingPlaces
          );

          // Map category ID to room type ID for later use
          this.categoryToRoomTypeMap[category.categoryID] = {
            roomTypeId: this.roomTypeId,
            name: label,
            capacity: category.totalSleepingPlaces
          };

          logger.info(`Created room type: ${label}`, {
            categoryId: category.categoryID,
            roomTypeId: this.roomTypeId,
            capacity: category.totalSleepingPlaces
          });
        }
      }
    }

    // Launch browser
    this.browser = await chromium.launch({
      headless: this.options.headless !== undefined ? this.options.headless : false,
      slowMo: this.options.slowMo || 500
    });

    this.page = await this.browser.newPage();

    // Navigate to booking wizard
    const url = `https://www.hut-reservation.org/reservation/book-hut/${hutId}/wizard`;
    logger.info("Loading booking wizard", { url });

    await this.page.goto(url, {
      waitUntil: "domcontentloaded", // Changed from networkidle - faster, just need cookies
      timeout: 30000,
    });

    // Just wait for cookies to be set - no need to interact with the page
    // The XSRF-TOKEN cookie is set immediately on page load
    await this.page.waitForTimeout(2000);
  }

  /**
   * Fetch hut data from API
   * @param {number} hutId - The hut ID
   */
  async fetchHutData(hutId) {
    try {
      const axios = require('axios');
      const response = await axios.get(
        `https://www.hut-reservation.org/api/v1/reservation/hutInfo/${hutId}`,
        { timeout: 10000 }
      );

      if (response.data) {
        this.hutData = response.data;
        this.results.hutId = hutId;
        this.results.hutName = this.hutData.hutName;
        this.results.country = this.hutData.tenantCountry;

        logger.info(`Fetched hut data: ${this.hutData.hutName} (${this.hutData.tenantCountry})`, {
          altitude: this.hutData.altitude,
          totalBeds: this.hutData.totalBedsInfo,
          categories: this.hutData.hutBedCategories?.length
        });
      }
    } catch (error) {
      logger.error(`Failed to fetch hut data for ID ${hutId}`, { error: error.message });
      throw new Error(`Could not fetch hut data: ${error.message}`);
    }
  }

  /**
   * Extract CSRF token from the browser
   */
  async extractAuthTokens() {
    logger.info("Extracting CSRF token from cookies...");

    // Get all cookies
    const cookies = await this.page.context().cookies();

    // Find XSRF-TOKEN cookie (SESSION cookie is not required!)
    const xsrfCookie = cookies.find(c => c.name === 'XSRF-TOKEN');

    if (!xsrfCookie) {
      logger.error("Could not find XSRF-TOKEN cookie", {
        allCookieNames: cookies.map(c => c.name).join(', ')
      });
      throw new Error("Missing XSRF-TOKEN cookie");
    }

    const authTokens = {
      xsrfToken: xsrfCookie.value,
      cookieString: `XSRF-TOKEN=${xsrfCookie.value}`
    };

    logger.info("CSRF token extracted successfully", {
      xsrfToken: authTokens.xsrfToken.substring(0, 8) + '...'
    });

    return authTokens;
  }

  /**
   * Fetch availability data from the API
   * @param {number} hutId - The hut ID
   * @param {Object} authTokens - Authentication tokens (xsrfToken, cookieString)
   * @returns {Object} Raw availability data from API
   */
  async fetchAvailabilityFromAPI(hutId, authTokens) {
    logger.info(`Fetching availability from API for hut ${hutId}...`);

    try {
      const axios = require('axios');
      const response = await axios.get(
        `https://www.hut-reservation.org/api/v1/reservation/getHutAvailability`,
        {
          params: {
            hutId: hutId,
            step: 'WIZARD'
          },
          headers: {
            'accept': 'application/json, text/plain, */*',
            'x-xsrf-token': authTokens.xsrfToken,
            'cookie': authTokens.cookieString,
            'referer': `https://www.hut-reservation.org/reservation/book-hut/${hutId}/wizard`
          },
          timeout: 15000
        }
      );

      logger.info("API response received", {
        status: response.status,
        dataKeys: Object.keys(response.data || {})
      });

      return response.data;
    } catch (error) {
      logger.error(`API request failed for hut ${hutId}`, {
        error: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText
      });
      throw new Error(`Failed to fetch availability from API: ${error.message}`);
    }
  }

  /**
   * Parse availability data from API response
   * Handles multiple bed categories per date
   * @param {Array} apiData - Raw API response (array of date objects)
   * @returns {Object} Structured availability data by category
   */
  parseAvailabilityData(apiData) {
    logger.info("Parsing availability data from API response...");

    if (!apiData || !Array.isArray(apiData)) {
      logger.warn("No API data to parse or invalid format");
      return { byCategory: {}, summary: {} };
    }

    logger.info(`Processing ${apiData.length} days from API...`);

    // Organize data by category
    const dataByCategory = {};
    const allAvailableDates = [];

    // Process each date entry from the API
    apiData.forEach(entry => {
      const dateStr = entry.date.split('T')[0]; // YYYY-MM-DD format
      const isOpen = entry.hutStatus !== 'CLOSED';

      // Process each bed category
      if (entry.freeBedsPerCategory && Object.keys(entry.freeBedsPerCategory).length > 0) {
        Object.entries(entry.freeBedsPerCategory).forEach(([categoryId, availableBeds]) => {
          if (!dataByCategory[categoryId]) {
            dataByCategory[categoryId] = {
              categoryId: parseInt(categoryId),
              roomTypeName: this.categoryToRoomTypeMap?.[categoryId]?.name || `Category ${categoryId}`,
              dates: []
            };
          }

          // Only add if there are available beds
          if (isOpen && availableBeds > 0) {
            dataByCategory[categoryId].dates.push({
              date: dateStr,
              availableBeds: availableBeds,
              hutStatus: entry.hutStatus
            });

            allAvailableDates.push({
              date: entry.dateFormatted,
              category: this.categoryToRoomTypeMap?.[categoryId]?.name || `Category ${categoryId}`,
              beds: availableBeds
            });
          }
        });
      }
    });

    // Calculate summary statistics
    const totalCategories = Object.keys(dataByCategory).length;
    let totalAvailability = 0;

    Object.values(dataByCategory).forEach(category => {
      totalAvailability += category.dates.length;
    });

    const summary = {
      totalDays: apiData.length,
      totalCategories,
      totalAvailabilitySlots: totalAvailability,
      allAvailableDates: allAvailableDates.slice(0, 100) // Limit for logging
    };

    logger.info("Availability data parsed", {
      categories: totalCategories,
      totalDays: apiData.length,
      totalAvailabilitySlots: totalAvailability
    });

    return { byCategory: dataByCategory, summary, rawApiData: apiData };
  }

  /**
   * Convert month number to name
   */
  getMonthName(monthNum) {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return months[monthNum - 1] || 'Unknown';
  }

  /**
   * Scrape availability using API approach
   * @param {number} hutId - Hut ID to scrape
   */
  async scrapeAvailability(hutId) {
    logger.info("Starting API-based availability scraping...");

    // Extract authentication tokens from the browser session
    const authTokens = await this.extractAuthTokens();

    // Fetch availability data from API
    const apiData = await this.fetchAvailabilityFromAPI(hutId, authTokens);

    // Parse the API response (organized by category)
    const parsedData = this.parseAvailabilityData(apiData);

    // Update results
    this.results.availabilityByCategory = parsedData.byCategory;
    this.results.summary = parsedData.summary;
    this.results.rawApiData = parsedData.rawApiData;

    // Save to database if enabled
    if (this.saveToDatabase && this.propertyId) {
      await this.saveAvailabilityToDatabase(parsedData.byCategory);
    }

    logger.info("API-based scraping complete", {
      hutName: this.results.hutName,
      categories: parsedData.summary.totalCategories,
      totalDays: parsedData.summary.totalDays,
      totalAvailabilitySlots: parsedData.summary.totalAvailabilitySlots
    });
  }

  /**
   * Save availability data to database for all categories
   * @param {Object} dataByCategory - Availability data organized by category ID
   */
  async saveAvailabilityToDatabase(dataByCategory) {
    logger.info("Saving availability to database...");

    let totalSaved = 0;

    for (const [categoryId, categoryData] of Object.entries(dataByCategory)) {
      const roomTypeInfo = this.categoryToRoomTypeMap[categoryId];

      if (!roomTypeInfo) {
        logger.warn(`No room type mapping for category ${categoryId}, skipping`);
        continue;
      }

      // Batch save all dates for this category
      const availableDates = categoryData.dates.map(dateEntry => ({
        date: dateEntry.date,
        can_checkin: true,
        can_checkout: true
      }));

      if (availableDates.length > 0) {
        await database.upsertAvailableDates(roomTypeInfo.roomTypeId, availableDates);
        totalSaved += availableDates.length;
        logger.info(`Saved ${availableDates.length} dates for ${categoryData.roomTypeName}`);
      }
    }

    logger.info(`Total availability records saved: ${totalSaved}`);
  }

  /**
   * Select a room/bed category if multiple are available
   * @param {number} categoryIndex - Index of the category to select (0-based)
   */
  async selectRoomCategory(categoryIndex = 0) {
    if (!this.hutData || !this.hutData.hutBedCategories) {
      logger.warn("No bed categories available");
      return;
    }

    const categories = this.hutData.hutBedCategories;
    if (categoryIndex >= categories.length) {
      logger.warn(`Category index ${categoryIndex} out of range, using first category`);
      categoryIndex = 0;
    }

    const category = categories[categoryIndex];
    const englishLabel = category.hutBedCategoryLanguageData?.find(l => l.language === 'EN')?.label;
    const label = englishLabel || category.hutBedCategoryLanguageData?.[0]?.label || `Category ${categoryIndex}`;

    this.results.roomType = label;
    this.results.roomCategoryId = category.categoryID;

    logger.info(`Selected room category: ${label}`, {
      beds: category.totalSleepingPlaces,
      categoryId: category.categoryID
    });

    // TODO: Implement actual selection in the UI if needed
    // This might involve clicking on radio buttons or dropdown options
  }

  /**
   * Save results to file
   */
  async saveResults() {
    if (!this.saveToFile) return null;

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `hut-reservation-${this.results.hutId}-${timestamp}.json`;
    const filepath = path.join("./results", filename);

    // Ensure results directory exists
    if (!fs.existsSync("./results")) {
      fs.mkdirSync("./results", { recursive: true });
    }

    fs.writeFileSync(filepath, JSON.stringify(this.results, null, 2));
    logger.info(`Results saved to file: ${filepath}`);

    return filepath;
  }

  /**
   * Take a screenshot of the current state
   */
  async takeScreenshot(name = "hut-reservation") {
    if (!this.page) return;

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `${name}-${this.results.hutId}-${timestamp}.png`;
    const filepath = path.join("./screenshots", filename);

    // Ensure screenshots directory exists
    if (!fs.existsSync("./screenshots")) {
      fs.mkdirSync("./screenshots", { recursive: true });
    }

    await this.page.screenshot({ path: filepath, fullPage: true });
    logger.info(`Screenshot saved: ${filepath}`);

    return filepath;
  }

  /**
   * Clean up browser resources
   */
  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      logger.info("Browser closed");
    }
  }

  /**
   * Main scraping method - runs the complete scraping process
   * @param {number} hutId - Hut ID to scrape
   * @param {Object} options - Scraping options
   * @returns {Object} Scraping results
   */
  async scrape(hutId, options = {}) {
    try {
      // Initialize browser and fetch hut data
      // This also creates all room types in the database
      await this.initialize(hutId);

      // Use API-based scraping (gets all categories at once)
      await this.scrapeAvailability(hutId);

      // Take screenshot for verification
      await this.takeScreenshot();

      // Save results to file
      const filepath = await this.saveResults();

      return {
        success: true,
        results: this.results,
        filepath
      };
    } catch (error) {
      logger.error("Scraping failed:", { error: error.message, hutId });
      await this.takeScreenshot("error");
      throw error;
    } finally {
      await this.cleanup();
    }
  }
}

module.exports = HutReservationScraper;