/**
 * Hut-Reservation.org Hut Data Loader
 *
 * Utilities for loading and querying the 666+ hut database
 */

import type { CountryCode } from '@config/providers/hut-reservation.ts';
import type { HutReservationData, HutReservationHut } from './types.ts';

let hutDataCache: HutReservationData | null = null;

/**
 * Load hut data from JSON file
 * Data is cached after first load
 */
export async function loadHutData(): Promise<HutReservationData> {
  if (hutDataCache) {
    return hutDataCache;
  }

  try {
    const dataPath = new URL('../../../data/hut-reservation-huts.json', import.meta.url);
    const file = Bun.file(dataPath);
    const data = (await file.json()) as HutReservationData;

    hutDataCache = data;
    return data;
  } catch (error) {
    throw new Error(
      `Failed to load hut data: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Get all huts
 */
export async function getAllHuts(): Promise<HutReservationHut[]> {
  const data = await loadHutData();
  return Object.values(data.byCountry).flat();
}

/**
 * Get huts by country
 */
export async function getHutsByCountry(country: CountryCode): Promise<HutReservationHut[]> {
  const data = await loadHutData();
  return data.byCountry[country] || [];
}

/**
 * Get hut by ID
 */
export async function getHutById(hutId: number): Promise<HutReservationHut | undefined> {
  const allHuts = await getAllHuts();
  return allHuts.find((hut) => hut.id === hutId);
}

/**
 * Get hut by name (case-insensitive)
 */
export async function getHutByName(name: string): Promise<HutReservationHut | undefined> {
  const allHuts = await getAllHuts();
  const searchName = name.toLowerCase();
  return allHuts.find((hut) => hut.name.toLowerCase().includes(searchName));
}

/**
 * Get huts by tenant (e.g., 'OEAV', 'SAC', 'DAV')
 */
export async function getHutsByTenant(tenant: string): Promise<HutReservationHut[]> {
  const allHuts = await getAllHuts();
  return allHuts.filter((hut) => hut.tenant === tenant);
}

/**
 * Get database metadata
 */
export async function getMetadata(): Promise<HutReservationData['metadata']> {
  const data = await loadHutData();
  return data.metadata;
}

/**
 * Get statistics about the hut database
 */
export async function getStatistics(): Promise<{
  total: number;
  byCountry: Record<CountryCode, number>;
  byTenant: Record<string, number>;
  totalBeds: number;
  avgBedsPerHut: number;
}> {
  const allHuts = await getAllHuts();

  const byCountry: Record<string, number> = {};
  const byTenant: Record<string, number> = {};
  let totalBeds = 0;

  for (const hut of allHuts) {
    // Count by country
    byCountry[hut.country] = (byCountry[hut.country] || 0) + 1;

    // Count by tenant
    byTenant[hut.tenant] = (byTenant[hut.tenant] || 0) + 1;

    // Sum beds
    const beds = Number.parseInt(hut.totalBeds, 10);
    if (!Number.isNaN(beds)) {
      totalBeds += beds;
    }
  }

  return {
    total: allHuts.length,
    byCountry: byCountry as Record<CountryCode, number>,
    byTenant,
    totalBeds,
    avgBedsPerHut: Math.round(totalBeds / allHuts.length),
  };
}

/**
 * Search huts by various criteria
 */
export async function searchHuts(criteria: {
  country?: CountryCode;
  tenant?: string;
  minBeds?: number;
  maxBeds?: number;
  nameContains?: string;
}): Promise<HutReservationHut[]> {
  let huts = await getAllHuts();

  if (criteria.country) {
    huts = huts.filter((hut) => hut.country === criteria.country);
  }

  if (criteria.tenant) {
    huts = huts.filter((hut) => hut.tenant === criteria.tenant);
  }

  if (criteria.minBeds !== undefined) {
    huts = huts.filter((hut) => {
      const beds = Number.parseInt(hut.totalBeds, 10);
      return !Number.isNaN(beds) && beds >= criteria.minBeds!;
    });
  }

  if (criteria.maxBeds !== undefined) {
    huts = huts.filter((hut) => {
      const beds = Number.parseInt(hut.totalBeds, 10);
      return !Number.isNaN(beds) && beds <= criteria.maxBeds!;
    });
  }

  if (criteria.nameContains) {
    const searchName = criteria.nameContains.toLowerCase();
    huts = huts.filter((hut) => hut.name.toLowerCase().includes(searchName));
  }

  return huts;
}

/**
 * Clear the cache (useful for testing)
 */
export function clearCache(): void {
  hutDataCache = null;
}
