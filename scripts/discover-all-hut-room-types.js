const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Load the huts configuration we scraped earlier
const hutsConfig = require('../config/huts-bentral-ids.json');

/**
 * Discover room types for all huts using Playwright
 */
async function discoverAllHutRoomTypes() {
    const browser = await chromium.launch({ 
        headless: true,
        slowMo: 500 
    });
    
    const results = {};
    
    try {
        console.log('🔍 Discovering room types for all huts...\n');
        
        for (const hut of hutsConfig.huts) {
            console.log(`\n📍 Processing: ${hut.name}`);
            // Use the hut's specific key and ID to build the URL
            const bentralUrl = `https://www.bentral.com/service/embed/booking.html?id=${hut.bentralId}&title=0&width=full&header-bg=edeff4&header-color=363c49&header2-bg=edeff4&header2-color=363c49&table-bg=edeff4&table-color=363c49&btn-bg=12509b&border-width=0&poweredby=0&lang=sl&key=${hut.key}`;
            
            console.log(`   URL: ${bentralUrl}`);
            
            const page = await browser.newPage();
            
            try {
                // Navigate to the Bentral iframe URL
                await page.goto(bentralUrl, {
                    waitUntil: 'networkidle',
                    timeout: 30000
                });
                
                // Wait for the room select dropdown to be available with more time and retries
                try {
                    await page.waitForSelector('select[name="unit[]"]', { timeout: 20000 });
                } catch (error) {
                    // Try waiting for the page to be more stable
                    console.log(`      Retrying selector for ${hut.name}...`);
                    await page.waitForTimeout(5000);
                    await page.waitForSelector('select[name="unit[]"]', { timeout: 15000 });
                }
                
                // Extract room types from the dropdown
                const roomTypes = await page.evaluate(() => {
                    const select = document.querySelector('select[name="unit[]"]');
                    const options = Array.from(select.options);
                    
                    // Skip the first option if it's "Select room" or empty
                    const rooms = options
                        .filter(opt => opt.value && opt.value !== '')
                        .map(opt => ({
                            name: opt.text.trim(),
                            externalId: opt.value
                        }));
                    
                    return rooms;
                });
                
                console.log(`   ✅ Found ${roomTypes.length} room types:`);
                roomTypes.forEach(room => {
                    console.log(`      - ${room.name} (${room.externalId})`);
                });
                
                results[hut.name] = {
                    hutSlug: hut.urlSlug,
                    bentralId: hut.bentralId,
                    roomTypes: roomTypes
                };
                
            } catch (error) {
                console.error(`   ❌ Error processing ${hut.name}:`, error.message);
                results[hut.name] = {
                    hutSlug: hut.urlSlug,
                    bentralId: hut.bentralId,
                    error: error.message,
                    roomTypes: []
                };
            } finally {
                await page.close();
            }
            
            // Delay between huts to be nice to the server
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
        
    } finally {
        await browser.close();
    }
    
    // Save results to file
    const outputPath = path.join(__dirname, '..', 'config', 'all-huts-room-types.json');
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    
    console.log('\n\n📊 Summary:');
    console.log('='.repeat(50));
    
    let totalRoomTypes = 0;
    Object.entries(results).forEach(([hutName, data]) => {
        if (data.error) {
            console.log(`❌ ${hutName}: ERROR - ${data.error}`);
        } else {
            console.log(`✅ ${hutName}: ${data.roomTypes.length} room types`);
            totalRoomTypes += data.roomTypes.length;
        }
    });
    
    console.log('='.repeat(50));
    console.log(`Total room types discovered: ${totalRoomTypes}`);
    console.log(`\n💾 Results saved to: ${outputPath}`);
    
    return results;
}

// Run if called directly
if (require.main === module) {
    discoverAllHutRoomTypes()
        .then(() => {
            console.log('\n✨ Discovery complete!');
            process.exit(0);
        })
        .catch(error => {
            console.error('Fatal error:', error);
            process.exit(1);
        });
}

module.exports = { discoverAllHutRoomTypes };