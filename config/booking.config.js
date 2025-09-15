/**
 * Mountain Hut Booking Configuration
 *
 * Configuration for the Microgramm booking system used by mountain huts
 */

module.exports = {
  // Target booking system
  target: {
    name: "Microgramm Booking System",
    baseUrl: "https://reservations.microgramm.si/",
    loginUrl: "https://reservations.microgramm.si/hud/",
    bookingSystem: "Microgramm"
  },

  // Authentication
  auth: {
    // Credentials should be stored in environment variables for security
    username: process.env.MICROGRAMM_USERNAME || "hud",
    password: process.env.MICROGRAMM_PASSWORD || "kozarja14hud"
  },

  // CSS selectors for booking automation
  selectors: {
    // Login form
    loginForm: "form",
    usernameField: 'input[name="username"], input[name="user"], input[type="text"]',
    passwordField: 'input[name="password"], input[type="password"]',
    loginButton: 'input[type="submit"], button[type="submit"]',

    // Hut selection
    hutSelect: 'select[name="hut"], select#hut',
    hutOption: 'option',

    // Room type selection
    roomTypeSelect: 'select[name="room_type"], select#room_type',
    roomTypeOption: 'option',

    // Date selection
    arrivalDate: 'input[name="arrival"], input[name="checkin"]',
    departureDate: 'input[name="departure"], input[name="checkout"]',
    datePickerDay: '.day:not(.old):not(.new)',

    // Guest information form
    guestName: 'input[name="name"], input[name="guest_name"]',
    guestCountry: 'select[name="country"], input[name="country"]',
    guestEmail: 'input[name="email"]',
    guestPhone: 'input[name="phone"], input[name="telefon"]',

    // Payment method
    paymentSelect: 'select[name="payment"]',
    paymentOption: 'option',
    paymentPonudba: 'option[value*="ponudbo"], option:contains("ponudbo")',

    // Captcha
    captchaImage: 'img[alt*="captcha"], img[src*="captcha"], .captcha img',
    captchaInput: 'input[name="captcha"], input[name="security_code"]',
    captchaError: '.error, .alert-danger, [class*="error"]',
    captchaErrorText: 'vnesite rezultat seštevka s slike',

    // Submit buttons
    nextButton: 'input[type="submit"], button[type="submit"], .btn-primary',
    confirmButton: 'input[value*="potrditev"], button:contains("potrditev")',

    // Success/error messages
    successMessage: '.success, .alert-success, [class*="success"]',
    errorMessage: '.error, .alert-danger, [class*="error"]'
  },

  // Booking behavior configuration
  booking: {
    // Browser settings
    browser: {
      headless: false, // Set to true for production
      slowMo: 200, // Delay between actions (ms) - reduced from 1000
      timeout: 15000, // Default timeout (ms) - reduced from 30000
    },

    // Form filling delays
    delays: {
      afterLogin: 500, // reduced from 2000
      afterSelection: 300, // reduced from 1000
      afterInput: 100, // reduced from 500
      captchaAttempt: 100, // reduced from 500
      beforeSubmit: 300 // reduced from 1000
    },

    // Retry settings
    retries: {
      maxLoginAttempts: 3,
      maxCaptchaAttempts: 20, // Numbers 0-20
      maxFormSubmitAttempts: 3
    },

    // Captcha solving
    captcha: {
      maxNumber: 20,
      startNumber: 0,
      delayBetweenAttempts: 100 // reduced from 500
    }
  },

  // Output settings
  output: {
    saveScreenshots: true,
    saveBookingData: true,
    screenshotsDir: "./screenshots/bookings",
    bookingDataDir: "./results/bookings"
  },

  // Country mapping for form selection
  countries: {
    "Slovenia": ["slovenia", "slovenija", "si"],
    "Austria": ["austria", "avstrija", "at"],
    "Italy": ["italy", "italija", "it"],
    "Germany": ["germany", "nemčija", "de"],
    "Croatia": ["croatia", "hrvaška", "hr"],
    "Hungary": ["hungary", "madžarska", "hu"],
    "Czech Republic": ["czech republic", "češka", "cz"],
    "Slovakia": ["slovakia", "slovaška", "sk"],
    "Poland": ["poland", "poljska", "pl"],
    "Switzerland": ["switzerland", "švica", "ch"],
    "France": ["france", "francija", "fr"],
    "United Kingdom": ["uk", "united kingdom", "velika britanija", "gb"],
    "United States": ["usa", "us", "united states", "amerika"],
    "Other": ["other", "drugo", "ostalo"]
  }
};