/**
 * Type definitions for Hut-Reservation.org data
 */

import type { CountryCode } from '@config/providers/hut-reservation.ts';

/**
 * Bed category information
 */
export interface HutBedCategory {
  name: string;
  beds: number;
  reservationMode: 'ROOM' | 'BED';
}

/**
 * Hut information from hut-reservation.org
 */
export interface HutReservationHut {
  id: number;
  name: string;
  warden: string;
  phone: string;
  website: string | null;
  coordinates: string;
  altitude: string;
  totalBeds: string;
  country: CountryCode;
  tenant: string;
  languages: string[];
  maxNights: number;
  categories: HutBedCategory[];
}

/**
 * Hut database metadata
 */
export interface HutReservationMetadata {
  platform: string;
  discoveryDate: string;
  totalHuts: number;
  countries: CountryCode[];
}

/**
 * Complete hut database structure
 */
export interface HutReservationData {
  metadata: HutReservationMetadata;
  byCountry: Record<CountryCode, HutReservationHut[]>;
}
