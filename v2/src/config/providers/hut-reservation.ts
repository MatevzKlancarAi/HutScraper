/**
 * Hut-Reservation.org Provider Configuration
 *
 * Configuration for scraping 666+ mountain huts across AT, CH, DE, IT
 */

export const hutReservationConfig = {
  /**
   * Platform configuration
   */
  platform: {
    name: 'hut-reservation.org',
    baseUrl: 'https://www.hut-reservation.org',
    apiBaseUrl: 'https://www.hut-reservation.org/api/v1',
    bookingUrlPattern: 'https://www.hut-reservation.org/reservation/book-hut/{hutId}/wizard',
  },

  /**
   * Sample test huts (one from each country)
   */
  testHuts: {
    AT: {
      id: 648,
      name: 'Sulzenauhütte',
      altitude: '2191 m',
      beds: 102,
    },
    CH: {
      id: 710,
      name: 'Albert-Heim-Hütte SAC',
      country: 'CH',
    },
    DE: {
      id: 114,
      name: 'Alpenrosenhütte im Brixental',
      altitude: '1555 m',
      beds: 60,
    },
    IT: {
      id: 630,
      name: 'Alpe Pozza "Vincenzo Lancia"',
      altitude: '1802 m',
      beds: 25,
    },
  },

  /**
   * Priority huts for initial deployment
   */
  priorityHuts: [
    648, // Sulzenauhütte (AT)
    114, // Alpenrosenhütte im Brixental (DE)
    630, // Alpe Pozza (IT)
    1, // Blüemlisalphütte SAC (CH)
    100, // Gaudeamushütte (AT)
    200, // Straubinger Haus (DE)
    300, // Oberwalder-Hütte (AT)
    400, // Cabane de Valsorey CAS (CH)
    500, // Capanna Dötra (CH)
  ],

  /**
   * CSS selectors for the Angular-based UI
   */
  selectors: {
    // Calendar selectors
    datePickerToggle: 'mat-datepicker-toggle button',
    dateInput: "input[formcontrolname*='date'], input[placeholder*='date']",
    calendar: 'mat-calendar',
    calendarHeader: '.mat-calendar-period-button, .mat-calendar-header button',
    calendarCells: '.mat-calendar-body-cell',
    calendarNextButton: ".mat-calendar-next-button, button[aria-label*='Next']",
    calendarPrevButton: ".mat-calendar-previous-button, button[aria-label*='Previous']",

    // Availability indicators (CSS classes)
    availableClass: 'mat-calendar-body-cell:not(.mat-calendar-body-disabled)',
    unavailableClasses: ['mat-calendar-body-disabled', 'unavailable', 'booked', 'occupied'],

    // Room/bed selection
    roomCategory: "mat-radio-button, input[type='radio'][name*='room']",
    guestCount: "input[type='number'][formcontrolname*='guest']",

    // Navigation
    nextButton: "button:has-text('Next'), button:has-text('Continue'), button:has-text('Weiter')",
    backButton: "button:has-text('Back'), button:has-text('Zurück')",
  },

  /**
   * Default months to scrape
   */
  defaultTargetMonths: [
    'November 2025',
    'December 2025',
    'January 2026',
    'February 2026',
    'March 2026',
    'April 2026',
    'May 2026',
    'June 2026',
    'July 2026',
    'August 2026',
  ],

  /**
   * Country codes mapping
   */
  countries: {
    AT: 'Austria',
    CH: 'Switzerland',
    DE: 'Germany',
    IT: 'Italy',
  } as const,
} as const;

export type CountryCode = keyof typeof hutReservationConfig.countries;
