/**
 * Bentral provider configuration
 * Configuration for the Bentral booking system scraper
 */

import {
  bentralHuts,
  getAllBentralHutNames,
  getBentralHut,
  getBentralStatistics,
} from './bentral-huts.ts';

export { bentralHuts, getAllBentralHutNames, getBentralHut, getBentralStatistics };

export const bentralConfig = {
  /**
   * Bentral iframe URL
   */
  iframeUrl:
    'https://www.bentral.com/service/embed/booking.html?id=5f4451784d415f4e&title=0&width=full&header-bg=edeff4&header-color=363c49&header2-bg=edeff4&header2-color=363c49&table-bg=edeff4&table-color=363c49&btn-bg=12509b&border-width=0&poweredby=0&lang=sl&key=21eb14db6ac1873bf9cbcf78feeddb56',

  /**
   * CSS selectors for scraping
   */
  selectors: {
    roomSelect: 'select[name="unit[]"]',
    arrivalInput: 'input[name="formated_arrival"]',
    calendarSwitch: '.datepicker-switch',
    calendarDays: '.datepicker-days td',
    nextButton: '.datepicker-days .next',
    prevButton: '.datepicker-days .prev',
  },

  /**
   * Availability detection logic
   */
  availability: {
    requiredClasses: ['day'],
    excludedClasses: ['unavail', 'disabled', 'old', 'new'],
    excludedTitles: ['zasedeno', 'occupied'],
  },

  /**
   * Maximum number of months to navigate forward
   */
  maxMonthNavigations: 24,

  /**
   * Delay between month navigations (ms)
   */
  navigationDelay: 500,
} as const;

export type BentralConfig = typeof bentralConfig;
