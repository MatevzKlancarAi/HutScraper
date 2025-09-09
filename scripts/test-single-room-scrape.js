const MultiHutScraper = require('../src/multiHutScraper');

/**
 * Test scraping a single room type to verify the multi-hut scraper works
 */
async function testSingleRoomScrape() {
    try {
        console.log('🧪 Testing single room type scrape...\n');
        
        const scraper = new MultiHutScraper({
            testMode: true, // Only September 2025
            delayBetweenRooms: 1000
        });
        
        // Get Aljažev dom v Vratih (should be property ID 2)
        const properties = await scraper.getAllProperties();
        const testProperty = properties.find(p => p.name === 'Aljažev dom v Vratih');
        
        if (!testProperty) {
            throw new Error('Test property "Aljažev dom v Vratih" not found');
        }
        
        console.log(`Found test property: ${testProperty.name} (ID: ${testProperty.id})`);
        
        // Get first room type for this property
        const roomTypes = await scraper.getRoomTypesForProperty(testProperty.id);
        const testRoomType = roomTypes[0]; // Just test the first room type
        
        console.log(`Testing room type: ${testRoomType.name}`);
        console.log(`External ID: ${testRoomType.external_id}`);
        console.log(`Capacity: ${testRoomType.capacity}\n`);
        
        // Test scraping this single room type
        const targetMonths = ['September 2025'];
        const result = await scraper.scrapeRoomType(testProperty, testRoomType, targetMonths);
        
        console.log('\n📊 Scraping Result:');
        console.log('Success:', result.success);
        if (result.success) {
            console.log('Total Days:', result.results.totalDays);
            console.log('Available Days:', result.results.totalAvailable);
            console.log('Availability Rate:', result.results.overallAvailabilityRate);
            console.log('Available Dates:', result.results.allFullyAvailableDates);
        } else {
            console.log('Error:', result.error);
        }
        
        return result;
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        throw error;
    }
}

// Run test
if (require.main === module) {
    testSingleRoomScrape()
        .then((result) => {
            console.log(result.success ? '\n✅ Single room scrape test passed!' : '\n❌ Single room scrape test failed!');
            process.exit(result.success ? 0 : 1);
        })
        .catch(error => {
            console.error('Fatal error:', error);
            process.exit(1);
        });
}