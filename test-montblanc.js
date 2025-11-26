const ProviderFactory = require('./src/core/ProviderFactory');

/**
 * Test script for Mont Blanc provider
 * Tests the basic functionality of scraping availability dates
 */
async function testMontBlancProvider() {
    console.log('🏔️  Testing Mont Blanc Provider');
    console.log('================================');

    try {
        // Create Mont Blanc provider instance
        console.log('📦 Creating Mont Blanc provider...');
        const provider = await ProviderFactory.createProvider('montblanc');

        console.log('✅ Provider created successfully');
        console.log('🔧 Capabilities:', provider.getCapabilities());

        // Initialize the provider
        console.log('🚀 Initializing provider...');
        await provider.initialize();
        console.log('✅ Provider initialized');

        // Test with Chalet Les Méandres (the one from the screenshot)
        const testHut = {
            id: '39948',
            name: 'Chalet Les Méandres (ex Tupilak)',
            url: '/uk/il4-refuge_i39948-chalet-les-meandres-ex-tupilak.aspx'
        };

        console.log(`🏠 Testing availability scraping for: ${testHut.name}`);
        console.log('🔍 Using API to get availability data...');

        // Test the API-based availability scraping
        const options = {
            months: 1 // Just test 1 month for now
        };

        const results = await provider.scrapeAvailability(testHut, options);

        console.log('✅ Scraping completed!');
        console.log('📊 Results summary:');
        console.log(`   - Hut: ${results.data.hutName}`);
        console.log(`   - Availability records: ${results.data.availability.length}`);
        console.log(`   - Scraped at: ${results.scrapedAt}`);

        // Show first few availability records
        if (results.data.availability.length > 0) {
            console.log('📅 Sample availability data:');
            results.data.availability.slice(0, 5).forEach(record => {
                const status = record.available ? '✅ Available' : '❌ Not Available';
                console.log(`   ${record.date}: ${status}`);
            });

            if (results.data.availability.length > 5) {
                console.log(`   ... and ${results.data.availability.length - 5} more records`);
            }
        }

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
    } finally {
        // Clean up
        try {
            if (provider) {
                console.log('🧹 Cleaning up...');
                await provider.cleanup();
                console.log('✅ Cleanup completed');
            }
        } catch (cleanupError) {
            console.error('⚠️  Cleanup error:', cleanupError.message);
        }
    }

    console.log('🏁 Test completed');
}

// Run the test
if (require.main === module) {
    testMontBlancProvider().catch(console.error);
}

module.exports = testMontBlancProvider;