const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

async function discoverAllHuts() {
  const baseURL = 'https://www.hut-reservation.org/api/v1';
  const huts = [];
  const maxId = 1000; // We'll scan up to ID 1000
  const concurrency = 10; // Process 10 requests at a time

  console.log('Discovering all huts on hut-reservation.org...\n');

  // Process IDs in batches
  for (let i = 1; i <= maxId; i += concurrency) {
    const batch = [];
    for (let j = i; j < Math.min(i + concurrency, maxId + 1); j++) {
      batch.push(j);
    }

    const promises = batch.map(async (id) => {
      try {
        const response = await axios.get(`${baseURL}/reservation/hutInfo/${id}`, {
          timeout: 5000
        });

        if (response.data && response.data.hutName) {
          const hutData = {
            id,
            name: response.data.hutName,
            warden: response.data.hutWarden,
            phone: response.data.phone,
            website: response.data.hutWebsite,
            coordinates: response.data.coordinates,
            altitude: response.data.altitude,
            totalBeds: response.data.totalBedsInfo,
            country: response.data.tenantCountry,
            tenant: response.data.tenantCode,
            languages: response.data.hutLanguages,
            maxNights: response.data.maxNumberOfNights,
            categories: response.data.hutBedCategories?.map(cat => ({
              name: cat.hutBedCategoryLanguageData?.find(l => l.language === 'EN')?.label ||
                    cat.hutBedCategoryLanguageData?.[0]?.label,
              beds: cat.totalSleepingPlaces,
              reservationMode: cat.reservationMode
            }))
          };

          console.log(`✓ Found: ${hutData.name} (ID: ${id}, ${hutData.country}, ${hutData.totalBeds} beds)`);
          return hutData;
        }
      } catch (error) {
        // Silently skip 404s as they're expected
        if (error.response?.status !== 404) {
          console.log(`✗ Error ID ${id}: ${error.response?.status || error.message}`);
        }
      }
      return null;
    });

    const results = await Promise.all(promises);
    huts.push(...results.filter(h => h !== null));

    // Progress update
    if (i % 100 === 1) {
      console.log(`\nProcessed IDs ${i} to ${Math.min(i + concurrency - 1, maxId)}...`);
    }
  }

  // Sort huts by country and name
  huts.sort((a, b) => {
    if (a.country !== b.country) return a.country.localeCompare(b.country);
    return a.name.localeCompare(b.name);
  });

  // Group by country for summary
  const byCountry = {};
  huts.forEach(hut => {
    if (!byCountry[hut.country]) {
      byCountry[hut.country] = [];
    }
    byCountry[hut.country].push(hut);
  });

  // Print summary
  console.log('\n========================================');
  console.log('DISCOVERY COMPLETE');
  console.log('========================================');
  console.log(`Total huts found: ${huts.length}`);
  console.log('\nHuts by country:');

  Object.entries(byCountry).forEach(([country, countryHuts]) => {
    console.log(`  ${country}: ${countryHuts.length} huts`);
  });

  // Save to file
  const outputDir = path.join(process.cwd(), 'data');
  await fs.mkdir(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, 'hut-reservation-huts.json');
  await fs.writeFile(outputPath, JSON.stringify({
    metadata: {
      platform: 'hut-reservation.org',
      discoveryDate: new Date().toISOString(),
      totalHuts: huts.length,
      countries: Object.keys(byCountry)
    },
    byCountry,
    allHuts: huts
  }, null, 2));

  console.log(`\nData saved to: ${outputPath}`);

  // Print some interesting huts for testing
  console.log('\n========================================');
  console.log('SAMPLE HUTS FOR TESTING');
  console.log('========================================');

  // Get one hut from each country
  Object.entries(byCountry).slice(0, 5).forEach(([country, countryHuts]) => {
    const hut = countryHuts[0];
    console.log(`\n${country}: ${hut.name}`);
    console.log(`  URL: https://www.hut-reservation.org/reservation/book-hut/${hut.id}/wizard`);
    console.log(`  Beds: ${hut.totalBeds}`);
    console.log(`  Altitude: ${hut.altitude}`);
  });

  return huts;
}

discoverAllHuts().catch(console.error);