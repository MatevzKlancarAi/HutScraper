const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const config = require("../config/scraper.config.js");
const database = require("./services/database");
const logger = require("./services/logger");

/**
 * Mountain Hut Reservation Scraper
 *
 * Scrapes availability data from Bentral booking system used by mountain huts
 */
class MountainHutScraper {
  constructor(options = {}) {
    this.config = { ...config, ...options };
    this.browser = null;
    this.page = null;
    this.saveToDatabase = options.saveToDatabase !== false; // Default to true
    this.saveToFile = options.saveToFile !== false; // Default to true
    this.propertyId = null;
    this.roomTypeId = null;
    this.roomTypesMap = {}; // Will hold room types from database
    this.results = {
      scrapingDate: new Date().toISOString(),
      targetSite: this.config.target.name,
      roomType: null,
      months: {},
      summary: {},
    };
  }

  /**
   * Initialize the browser and page
   */
  async initialize() {
    logger.info(`Initializing Mountain Hut Scraper for ${this.config.target.name}`);

    // Initialize database connection if needed
    if (this.saveToDatabase) {
      await database.initialize();
      
      // Ensure property exists in database
      this.propertyId = await database.ensureProperty(
        this.config.target.name,
        this.config.target.baseUrl,
        `${this.config.target.name} mountain hut using ${this.config.target.bookingSystem} booking system`
      );
      
      // Fetch room types from database
      this.roomTypesMap = await database.getRoomTypesMapForProperty(this.propertyId);
      
      logger.logDatabaseOperation('property_initialized', { 
        propertyId: this.propertyId, 
        propertyName: this.config.target.name,
        roomTypesCount: Object.keys(this.roomTypesMap).length,
        roomTypes: Object.keys(this.roomTypesMap)
      });
    } else {
      // Fallback to config-based room types if not using database
      if (this.config.bentral && this.config.bentral.roomTypes) {
        Object.entries(this.config.bentral.roomTypes).forEach(([name, externalId]) => {
          this.roomTypesMap[name] = {
            external_id: externalId,
            capacity: this.extractRoomCapacity(name)
          };
        });
      }
    }

    this.browser = await chromium.launch(this.config.scraper.browser);
    this.page = await this.browser.newPage();

    logger.info("Loading booking system", { url: this.config.bentral.iframeUrl });
    await this.page.goto(this.config.bentral.iframeUrl, {
      waitUntil: "networkidle",
      timeout: this.config.scraper.browser.timeout,
    });
  }

  /**
   * Select a room type for availability checking
   * @param {string} roomType - The room type to select
   */
  async selectRoomType(roomType = "Dvoposteljna soba - zakonska postelja") {
    // Get room info from database or config
    const roomInfo = this.roomTypesMap[roomType];
    if (!roomInfo) {
      const availableRoomTypes = Object.keys(this.roomTypesMap);
      throw new Error(`Room type "${roomType}" not found. Available room types: ${availableRoomTypes.join(', ')}`);
    }

    const roomId = roomInfo.external_id;
    if (!roomId) {
      throw new Error(`Room type "${roomType}" has no external_id for booking system selection`);
    }

    logger.info(`Selecting room type: ${roomType}`, { 
      roomId,
      dbRoomTypeId: roomInfo.id || 'from_config',
      capacity: roomInfo.capacity
    });
    
    await this.page.selectOption(
      this.config.bentral.selectors.roomSelect,
      roomId
    );
    await this.page.waitForTimeout(2000);

    this.results.roomType = roomType;

    // Set room type ID from database or create it
    if (this.saveToDatabase && this.propertyId) {
      if (roomInfo.id) {
        // Room type exists in database, use it
        this.roomTypeId = roomInfo.id;
        logger.logDatabaseOperation('room_type_selected', { 
          roomTypeId: this.roomTypeId, 
          roomType,
          source: 'database'
        });
      } else {
        // Fallback: ensure room type exists
        const capacity = roomInfo.capacity || this.extractRoomCapacity(roomType);
        this.roomTypeId = await database.ensureRoomType(
          this.propertyId,
          roomType,
          roomId,
          capacity,
          `${roomType} at ${this.config.target.name}`
        );
        
        logger.logDatabaseOperation('room_type_ensured', { 
          roomTypeId: this.roomTypeId, 
          roomType,
          capacity,
          source: 'created'
        });
      }
    }
  }

  /**
   * Extract room capacity from room type name
   */
  extractRoomCapacity(roomType) {
    // Extract numbers from room type names
    const singleRoom = roomType.includes('Enoposteljna') ? 1 : 0;
    const doubleRoom = roomType.includes('Dvoposteljna') ? 2 : 0;
    const tripleRoom = roomType.includes('Triposteljna') ? 3 : 0;
    const quadRoom = roomType.includes('Štiriposteljna') ? 4 : 0;
    const pentaRoom = roomType.includes('Petposteljna') ? 5 : 0;
    const hexaRoom = roomType.includes('Šestposteljna') ? 6 : 0;
    
    // Special cases for dormitories
    if (roomType.includes('za 7 oseb')) return 7;
    if (roomType.includes('za 8 oseb')) return 8;
    if (roomType.includes('za 10 oseb')) return 10;
    if (roomType.includes('za 12 oseb')) return 12;
    if (roomType.includes('za 18 oseb')) return 18;
    if (roomType.includes('za 30 oseb')) return 30;
    
    return singleRoom + doubleRoom + tripleRoom + quadRoom + pentaRoom + hexaRoom || 1;
  }

  /**
   * Open the calendar picker
   */
  async openCalendar() {
    console.log("📅 Opening calendar...");
    await this.page.click(this.config.bentral.selectors.arrivalInput);
    await this.page.waitForTimeout(2000);
  }

  /**
   * Navigate to a specific month in the calendar
   * @param {string} targetMonth - Month to navigate to (e.g., "September 2025")
   */
  async navigateToMonth(targetMonth) {
    console.log(`🔄 Navigating to ${targetMonth}...`);

    let currentMonth = await this.page.textContent(
      this.config.bentral.selectors.calendarSwitch
    );
    let attempts = 0;
    const maxAttempts = 24; // Max 2 years of navigation

    while (!currentMonth.includes(targetMonth) && attempts < maxAttempts) {
      await this.page.click(this.config.bentral.selectors.nextButton);
      await this.page.waitForTimeout(500);
      currentMonth = await this.page.textContent(
        this.config.bentral.selectors.calendarSwitch
      );
      attempts++;
    }

    if (!currentMonth.includes(targetMonth)) {
      throw new Error(
        `Could not navigate to ${targetMonth} after ${maxAttempts} attempts`
      );
    }

    console.log(`✅ Successfully navigated to ${targetMonth}`);
  }

  /**
   * Extract availability data from the current calendar month
   * @param {string} monthName - Name of the month being scraped
   * @returns {Object} Availability data for the month
   */
  async extractMonthAvailability(monthName) {
    console.log(`🔍 Extracting availability for ${monthName}...`);

    const calendarData = await this.page.evaluate((config) => {
      const cells = document.querySelectorAll(
        config.bentral.selectors.calendarDays
      );
      return Array.from(cells)
        .map((cell) => {
          const day = cell.textContent.trim();
          const classes = cell.className;
          const title = cell.getAttribute("title") || "";

          // Only process actual day numbers that belong to the current month
          // Skip "old" (previous month) and "new" (next month) days
          if (day.match(/^\d{1,2}$/) && !classes.includes("old") && !classes.includes("new")) {
            // Check for special partial availability classes
            const hasUnavailStart = classes.includes("unavail_start");
            const hasUnavailEnd = classes.includes("unavail_end");
            
            // Apply availability logic from config
            const hasRequiredClasses =
              config.bentral.availability.requiredClasses.every((cls) =>
                classes.includes(cls)
              );

            // For excluded classes, we need to handle unavail_start and unavail_end specially
            const hasExcludedClasses =
              config.bentral.availability.excludedClasses.some((cls) => {
                // Skip checking "unavail" if it's part of unavail_start or unavail_end
                if (cls === "unavail" && (hasUnavailStart || hasUnavailEnd)) {
                  return false;
                }
                return classes.includes(cls);
              });

            const hasExcludedTitle =
              config.bentral.availability.excludedTitles.some((excludedTitle) =>
                title.toLowerCase().includes(excludedTitle.toLowerCase())
              );

            // Determine availability status
            let availabilityStatus;
            let canStartReservation = false;
            let canEndReservation = false;
            
            if (hasUnavailStart && hasUnavailEnd) {
              // Both restrictions - can't start or end
              availabilityStatus = "unavailable";
              canStartReservation = false;
              canEndReservation = false;
            } else if (hasUnavailStart) {
              // Can't start but CAN end a reservation on this day
              availabilityStatus = "partial_no_start";
              canStartReservation = false;
              canEndReservation = true;
            } else if (hasUnavailEnd) {
              // Can't end but CAN start a reservation on this day
              availabilityStatus = "partial_no_end";
              canStartReservation = true;
              canEndReservation = false;
            } else if (hasRequiredClasses && !hasExcludedClasses && !hasExcludedTitle) {
              availabilityStatus = "available";
              canStartReservation = true;
              canEndReservation = true;
            } else {
              availabilityStatus = "unavailable";
              canStartReservation = false;
              canEndReservation = false;
            }

            const isPartiallyAvailable = availabilityStatus === "partial_no_start" || availabilityStatus === "partial_no_end";
            const isFullyAvailable = availabilityStatus === "available";
            const isAvailable = isFullyAvailable || isPartiallyAvailable; // Consider partial as available

            return {
              day: parseInt(day),
              classes: classes,
              title: title,
              availabilityStatus: availabilityStatus,
              available: isAvailable,
              fullyAvailable: isFullyAvailable,
              partiallyAvailable: isPartiallyAvailable,
              unavailable: availabilityStatus === "unavailable",
              canStartReservation: canStartReservation,
              canEndReservation: canEndReservation,
            };
          }
          return null;
        })
        .filter((item) => item !== null);
    }, this.config);

    const available = calendarData.filter((d) => d.available);
    const fullyAvailable = calendarData.filter((d) => d.fullyAvailable);
    const partiallyAvailable = calendarData.filter((d) => d.partiallyAvailable);
    const unavailable = calendarData.filter((d) => d.unavailable);
    const canStart = calendarData.filter((d) => d.canStartReservation);
    const canEnd = calendarData.filter((d) => d.canEndReservation);

    const monthData = {
      totalDays: calendarData.length,
      availableDays: available.length,
      fullyAvailableDays: fullyAvailable.length,
      partiallyAvailableDays: partiallyAvailable.length,
      unavailableDays: unavailable.length,
      availabilityRate:
        ((available.length / calendarData.length) * 100).toFixed(1) + "%",
      availableDates: available.map((d) => d.day).sort((a, b) => a - b),
      fullyAvailableDates: fullyAvailable.map((d) => d.day).sort((a, b) => a - b),
      partiallyAvailableDates: partiallyAvailable.map((d) => ({
        day: d.day,
        status: d.availabilityStatus,
        canStart: d.canStartReservation,
        canEnd: d.canEndReservation
      })),
      unavailableDates: unavailable.map((d) => d.day).sort((a, b) => a - b),
      canStartDates: canStart.map((d) => d.day).sort((a, b) => a - b),
      canEndDates: canEnd.map((d) => d.day).sort((a, b) => a - b),
      rawData: calendarData,
    };

    // Log results
    console.log(`📊 ${monthName} Results:`);
    console.log(
      `   Total Available: ${monthData.availableDays}/${monthData.totalDays} days (${monthData.availabilityRate})`
    );
    console.log(
      `   - Fully available: ${monthData.fullyAvailableDays} days`
    );
    console.log(
      `   - Partially available: ${monthData.partiallyAvailableDays} days`
    );

    if (monthData.fullyAvailableDays > 0) {
      console.log(
        `   ✅ Fully available dates: ${monthData.fullyAvailableDates.join(", ")}`
      );
    }
    
    if (monthData.partiallyAvailableDays > 0) {
      const partialInfo = monthData.partiallyAvailableDates.map(p => 
        `${p.day}(${p.canStart ? 'start-only' : 'end-only'})`
      ).join(", ");
      console.log(
        `   ⚠️  Partially available dates: ${partialInfo}`
      );
    }
    
    if (monthData.availableDays === 0) {
      console.log(`   ❌ No available dates`);
    }

    return monthData;
  }

  /**
   * Scrape availability for all configured months
   */
  async scrapeAvailability() {
    await this.openCalendar();

    for (const month of this.config.scraper.targetMonths) {
      await this.navigateToMonth(month);
      const monthData = await this.extractMonthAvailability(month);
      this.results.months[month] = monthData;
    }

    // Calculate summary
    const totalDays = Object.values(this.results.months).reduce(
      (sum, month) => sum + month.totalDays,
      0
    );
    const totalAvailable = Object.values(this.results.months).reduce(
      (sum, month) => sum + month.availableDays,
      0
    );
    const totalFullyAvailable = Object.values(this.results.months).reduce(
      (sum, month) => sum + month.fullyAvailableDays,
      0
    );
    const totalPartiallyAvailable = Object.values(this.results.months).reduce(
      (sum, month) => sum + month.partiallyAvailableDays,
      0
    );

    const allFullyAvailableDates = Object.entries(this.results.months).flatMap(
      ([month, data]) =>
        data.fullyAvailableDates.map((day) => `${month.split(" ")[0]} ${day}`)
    );
    
    const allPartiallyAvailableDates = Object.entries(this.results.months).flatMap(
      ([month, data]) =>
        data.partiallyAvailableDates.map((p) => ({
          date: `${month.split(" ")[0]} ${p.day}`,
          canStart: p.canStart,
          canEnd: p.canEnd
        }))
    );

    this.results.summary = {
      totalDays,
      totalAvailable,
      totalFullyAvailable,
      totalPartiallyAvailable,
      totalUnavailable: totalDays - totalAvailable,
      overallAvailabilityRate:
        ((totalAvailable / totalDays) * 100).toFixed(1) + "%",
      allFullyAvailableDates,
      allPartiallyAvailableDates,
    };

    // Log final summary
    logger.info("Scraping results summary", {
      roomType: this.results.roomType,
      totalDays,
      totalAvailable,
      totalFullyAvailable,
      totalPartiallyAvailable,
      availabilityRate: this.results.summary.overallAvailabilityRate,
      fullyAvailableDates: allFullyAvailableDates,
      partiallyAvailableDates: allPartiallyAvailableDates.map(p => ({
        date: p.date,
        type: p.canStart ? 'start-only' : 'end-only'
      }))
    });
  }

  /**
   * Save results to file and/or database
   */
  async saveResults() {
    const results = { filePath: null, databaseSaved: false };

    // Save to file
    if (this.saveToFile && this.config.scraper.output.saveResults) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `availability-${timestamp}.json`;
      const filepath = path.join(this.config.scraper.output.resultsDir, filename);

      // Ensure results directory exists
      if (!fs.existsSync(this.config.scraper.output.resultsDir)) {
        fs.mkdirSync(this.config.scraper.output.resultsDir, { recursive: true });
      }

      fs.writeFileSync(filepath, JSON.stringify(this.results, null, 2));
      logger.info(`Results saved to file: ${filepath}`);
      results.filePath = filepath;
    }

    // Save to database
    if (this.saveToDatabase && this.roomTypeId) {
      try {
        const availableDates = this.extractAvailableDatesForDatabase();
        const dateRange = this.getScrapedDateRange();
        
        await database.upsertAvailableDates(this.roomTypeId, availableDates, dateRange);
        
        logger.logDatabaseOperation('availability_saved', {
          roomTypeId: this.roomTypeId,
          roomType: this.results.roomType,
          datesCount: availableDates.length,
          totalDays: this.results.summary.totalDays,
          availabilityRate: this.results.summary.overallAvailabilityRate,
          dateRange: dateRange
        });
        
        results.databaseSaved = true;
      } catch (error) {
        logger.error('Failed to save results to database', { 
          error: error.message,
          roomTypeId: this.roomTypeId,
          roomType: this.results.roomType
        });
        throw error;
      }
    }

    return results;
  }

  /**
   * Extract available dates in database format with availability flags
   */
  extractAvailableDatesForDatabase() {
    const availableDates = [];
    
    Object.entries(this.results.months).forEach(([monthKey, monthData]) => {
      const [monthName, year] = monthKey.split(' ');
      const monthNumber = this.getMonthNumber(monthName);
      
      // Add fully available dates
      monthData.fullyAvailableDates.forEach(day => {
        const date = `${year}-${monthNumber.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        availableDates.push({
          date,
          can_checkin: true,
          can_checkout: true
        });
      });
      
      // Add partially available dates with proper flags
      monthData.partiallyAvailableDates.forEach(partial => {
        const date = `${year}-${monthNumber.toString().padStart(2, '0')}-${partial.day.toString().padStart(2, '0')}`;
        availableDates.push({
          date,
          can_checkin: partial.canStart,
          can_checkout: partial.canEnd
        });
      });
    });
    
    // Sort by date
    return availableDates.sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Extract date range from scraped months for database operations
   */
  getScrapedDateRange() {
    if (!this.results.months || Object.keys(this.results.months).length === 0) {
      return null;
    }

    let minDate = null;
    let maxDate = null;

    Object.entries(this.results.months).forEach(([monthKey, monthData]) => {
      const [monthName, year] = monthKey.split(' ');
      const monthNumber = this.getMonthNumber(monthName);
      
      // First day of the month
      const firstDay = `${year}-${monthNumber.toString().padStart(2, '0')}-01`;
      
      // Last day of the month
      const lastDayOfMonth = new Date(year, monthNumber, 0).getDate();
      const lastDay = `${year}-${monthNumber.toString().padStart(2, '0')}-${lastDayOfMonth.toString().padStart(2, '0')}`;
      
      if (!minDate || firstDay < minDate) {
        minDate = firstDay;
      }
      
      if (!maxDate || lastDay > maxDate) {
        maxDate = lastDay;
      }
    });

    return minDate && maxDate ? { minDate, maxDate } : null;
  }

  /**
   * Convert month name (Slovenian) to number
   */
  getMonthNumber(monthName) {
    const months = {
      'januar': 1, 'februar': 2, 'marec': 3, 'april': 4,
      'maj': 5, 'junij': 6, 'julij': 7, 'avgust': 8,
      'september': 9, 'oktober': 10, 'november': 11, 'december': 12
    };
    
    return months[monthName.toLowerCase()] || 1;
  }

  /**
   * Take a screenshot of the current state
   */
  async takeScreenshot(name = "scraping-result") {
    if (!this.config.scraper.output.saveScreenshots || !this.page) return;

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `${name}-${timestamp}.png`;
    const filepath = path.join(
      this.config.scraper.output.screenshotsDir,
      filename
    );

    // Ensure screenshots directory exists
    if (!fs.existsSync(this.config.scraper.output.screenshotsDir)) {
      fs.mkdirSync(this.config.scraper.output.screenshotsDir, {
        recursive: true,
      });
    }

    await this.page.screenshot({ path: filepath, fullPage: true });
    console.log(`📸 Screenshot saved: ${filepath}`);

    return filepath;
  }

  /**
   * Clean up browser resources
   */
  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      console.log("🧹 Browser closed");
    }
  }

  /**
   * Main scraping method - runs the complete scraping process
   * @param {string} roomType - Room type to scrape
   * @returns {Object} Scraping results
   */
  async scrape(roomType = "Dvoposteljna soba - zakonska postelja") {
    try {
      await this.initialize();
      await this.selectRoomType(roomType);
      await this.scrapeAvailability();
      await this.takeScreenshot();
      await this.saveResults();

      return this.results;
    } catch (error) {
      console.error("❌ Scraping failed:", error.message);
      await this.takeScreenshot("error");
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Get available room types for this property
   * @returns {Array} Array of room type names
   */
  getAvailableRoomTypes() {
    return Object.keys(this.roomTypesMap);
  }

  /**
   * Get room type information
   * @param {string} roomType - Room type name
   * @returns {Object} Room type info
   */
  getRoomTypeInfo(roomType) {
    return this.roomTypesMap[roomType] || null;
  }

  /**
   * Get current results without running scraper
   * @returns {Object} Current results
   */
  getResults() {
    return this.results;
  }
}

module.exports = MountainHutScraper;
