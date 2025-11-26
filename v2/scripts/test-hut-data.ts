/**
 * Test script for hut data loading
 * Validates the 666 hut database
 */

import { hutReservationConfig } from '../src/config/providers/hut-reservation.ts';
import {
  getAllHuts,
  getHutById,
  getHutsByCountry,
  getStatistics,
} from '../src/providers/hut-reservation/index.ts';

async function main() {
  console.log('🏔️  Hut Data Validation Test\n');

  try {
    // Test 1: Get statistics
    console.log('📊 Test 1: Loading hut database statistics...');
    const stats = await getStatistics();

    console.log(`  Total Huts: ${stats.total}`);
    console.log(`  Total Beds: ${stats.totalBeds}`);
    console.log(`  Avg Beds/Hut: ${stats.avgBedsPerHut}`);
    console.log('\n  By Country:');
    for (const [country, count] of Object.entries(stats.byCountry)) {
      console.log(`    ${country}: ${count} huts`);
    }
    console.log('\n  By Tenant:');
    const topTenants = Object.entries(stats.byTenant)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);
    for (const [tenant, count] of topTenants) {
      console.log(`    ${tenant}: ${count} huts`);
    }

    if (stats.total !== 666) {
      throw new Error(`Expected 666 huts, got ${stats.total}`);
    }
    console.log('\n✅ Statistics test passed\n');

    // Test 2: Get test huts
    console.log('🔍 Test 2: Validating test huts...');
    for (const [country, hutInfo] of Object.entries(hutReservationConfig.testHuts)) {
      const hut = await getHutById(hutInfo.id);
      if (!hut) {
        throw new Error(`Test hut ${hutInfo.id} (${country}) not found`);
      }
      console.log(`  ✓ ${country}: ${hut.name} (ID: ${hut.id})`);
    }
    console.log('✅ Test huts validation passed\n');

    // Test 3: Get huts by country
    console.log('🌍 Test 3: Validating country queries...');
    for (const country of ['AT', 'CH', 'DE', 'IT'] as const) {
      const huts = await getHutsByCountry(country);
      console.log(`  ${country}: ${huts.length} huts`);
      if (huts.length === 0) {
        throw new Error(`No huts found for ${country}`);
      }
    }
    console.log('✅ Country queries test passed\n');

    // Test 4: Validate hut structure
    console.log('🏗️  Test 4: Validating hut data structure...');
    const allHuts = await getAllHuts();
    const sampleHut = allHuts[0];

    const requiredFields = ['id', 'name', 'country', 'totalBeds', 'categories'];
    for (const field of requiredFields) {
      if (!(field in sampleHut)) {
        throw new Error(`Sample hut missing required field: ${field}`);
      }
    }

    if (!Array.isArray(sampleHut.categories)) {
      throw new Error('Hut categories is not an array');
    }

    console.log(`  ✓ Sample hut: ${sampleHut.name}`);
    console.log(`    ID: ${sampleHut.id}`);
    console.log(`    Country: ${sampleHut.country}`);
    console.log(`    Beds: ${sampleHut.totalBeds}`);
    console.log(`    Categories: ${sampleHut.categories.length}`);
    console.log('✅ Data structure test passed\n');

    console.log('🎉 All tests passed!\n');
    console.log('Summary:');
    console.log(`  • ${stats.total} huts loaded successfully`);
    console.log(`  • ${Object.keys(stats.byCountry).length} countries`);
    console.log(`  • ${Object.keys(stats.byTenant).length} different tenants`);
    console.log(`  • ${stats.totalBeds} total beds across all huts`);

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

main();
