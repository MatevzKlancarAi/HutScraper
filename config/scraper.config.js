/**
 * Mountain Hut Reservation Scraper Configuration
 *
 * Contains all URLs, selectors, and settings for the Bentral booking system scraper
 */

module.exports = {
  // Target website configuration
  target: {
    name: "Triglavski Dom",
    baseUrl: "https://triglavskidom.si/",
    bookingSystem: "Bentral",
  },

  // Bentral booking system configuration
  bentral: {
    // Direct iframe URL for the booking system
    iframeUrl:
      "https://www.bentral.com/service/embed/booking.html?id=5f4451784d415f4e&title=0&width=full&header-bg=edeff4&header-color=363c49&header2-bg=edeff4&header2-color=363c49&table-bg=edeff4&table-color=363c49&btn-bg=12509b&border-width=0&poweredby=0&lang=sl&key=21eb14db6ac1873bf9cbcf78feeddb56",

    // Room types and their IDs
    roomTypes: {
      "Dvoposteljna soba - zakonska postelja": "5f5441324e446b4d",
      "Enoposteljna soba": "5f5451794e7a4d4d",
      "Triposteljna soba": "5f5441324e54414d",
      "Štiriposteljna soba": "5f5441324e54454d",
      "Petposteljna soba": "5f5441354d54554d",
      "Šestposteljna soba": "5f5441324e54494d",
      "Skupna ležišča za 7 oseb (A)": "5f5451794e7a594d",
      "Skupna ležišča za 7 oseb (B)": "5f5441324e7a4d4d",
      "Skupna ležišča za 11 oseb": "5f5441324e7a634d",
      "Skupna ležišča za 12 oseb": "5f5441314e7a674d",
      "Skupna ležišča za 13 oseb": "5f5441324e7a514d",
      "Skupna ležišča za 14 oseb": "5f5441324e7a594d",
      "Skupna ležišča za 16 oseb": "5f5441324f44414d",
      "Skupna ležišča za 20 oseb": "5f5441324e7a674d",
      "Skupna ležišča za 30 oseb": "5f5441324f444d4d",
    },

    // CSS selectors for scraping
    selectors: {
      roomSelect: 'select[name="unit[]"]',
      arrivalInput: 'input[name="formated_arrival"]',
      calendarSwitch: ".datepicker-switch",
      calendarDays: ".datepicker-days td",
      nextButton: ".datepicker-days .next",
      prevButton: ".datepicker-days .prev",
    },

    // Availability logic configuration
    availability: {
      // A date is available if it has ALL of these conditions:
      requiredClasses: ["day"],
      // And NONE of these conditions:
      excludedClasses: ["unavail", "disabled", "old", "new"],
      excludedTitles: ["zasedeno", "occupied"],
    },
  },

  // Scraping behavior configuration
  scraper: {
    // Browser settings
    browser: {
      headless: false, // Set to true for production
      slowMo: 1000, // Delay between actions (ms)
      timeout: 30000, // Default timeout (ms)
    },

    // Months to scrape (relative to current date) - Slovenian month names
    // Starting from September 2025 (current is August 2025)
    targetMonths: [
      "September 2025",
      "Oktober 2025",
      "November 2025",
      "December 2025",
      "Januar 2026",
      "Februar 2026",
      "Marec 2026",
      "April 2026",
      "Maj 2026",
      "Junij 2026",
      "Julij 2026",
      "Avgust 2026"
    ],

    // Output settings
    output: {
      saveResults: true,
      saveScreenshots: true,
      resultsDir: "./results",
      screenshotsDir: "./screenshots",
    },
  },

  // Logging configuration
  logging: {
    level: "info", // 'debug', 'info', 'warn', 'error'
    showTimestamps: true,
    saveToFile: false,
  },
};
