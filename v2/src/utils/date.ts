import { addMonths, eachDayOfInterval, endOfMonth, format, parse, startOfMonth } from 'date-fns';

/**
 * Format date as YYYY-MM-DD
 */
export function formatDate(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/**
 * Format date as DD.MM.YYYY (common in EU)
 */
export function formatDateEU(date: Date): string {
  return format(date, 'dd.MM.yyyy');
}

/**
 * Parse date from DD.MM.YYYY format
 */
export function parseDateEU(dateString: string): Date {
  return parse(dateString, 'dd.MM.yyyy', new Date());
}

/**
 * Generate array of months for scraping
 * @param startMonth Starting month (0-based)
 * @param count Number of months to generate
 */
export function generateMonthRange(startMonth: Date, count: number): Date[] {
  const months: Date[] = [];
  for (let i = 0; i < count; i++) {
    months.push(addMonths(startMonth, i));
  }
  return months;
}

/**
 * Generate array of dates for a month
 */
export function getDatesInMonth(month: Date): Date[] {
  return eachDayOfInterval({
    start: startOfMonth(month),
    end: endOfMonth(month),
  });
}

/**
 * Generate array of dates between start and end (inclusive)
 */
export function getDatesBetween(start: Date, end: Date): Date[] {
  return eachDayOfInterval({ start, end });
}

/**
 * Check if date is in the past
 */
export function isPast(date: Date): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date < today;
}

/**
 * Check if date is today
 */
export function isToday(date: Date): boolean {
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
}

/**
 * Get month name (e.g., "January 2025")
 */
export function getMonthName(date: Date): string {
  return format(date, 'MMMM yyyy');
}

/**
 * Get date range string (e.g., "01.06.2025 - 30.06.2025")
 */
export function formatDateRange(start: Date, end: Date): string {
  return `${formatDateEU(start)} - ${formatDateEU(end)}`;
}

/**
 * Create date range for scraping (current month + N months ahead)
 */
export function createScrapingDateRange(monthsAhead: number): { start: Date; end: Date } {
  const start = new Date();
  start.setDate(1); // Start from 1st of current month
  start.setHours(0, 0, 0, 0);

  const end = endOfMonth(addMonths(start, monthsAhead));

  return { start, end };
}

/**
 * Convert date to ISO string (for database storage)
 */
export function toISOString(date: Date): string {
  return date.toISOString();
}

/**
 * Validate date string format (DD.MM.YYYY)
 */
export function isValidDateString(dateString: string): boolean {
  const regex = /^\d{2}\.\d{2}\.\d{4}$/;
  if (!regex.test(dateString)) {
    return false;
  }

  try {
    const date = parseDateEU(dateString);
    return !Number.isNaN(date.getTime());
  } catch {
    return false;
  }
}
