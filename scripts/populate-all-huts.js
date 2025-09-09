const database = require('../src/services/database');
const fs = require('fs');
const path = require('path');

/**
 * Extract room capacity from room name (Slovenian)
 */
function extractRoomCapacity(roomType) {
    // Extract numbers from room type names
    const singleRoom = roomType.includes('Enoposteljna') ? 1 : 0;
    const doubleRoom = roomType.includes('Dvoposteljna') ? 2 : 0;
    const tripleRoom = roomType.includes('Triposteljna') ? 3 : 0;
    const quadRoom = roomType.includes('Štiriposteljna') ? 4 : 0;
    const pentaRoom = roomType.includes('Petposteljna') ? 5 : 0;
    const hexaRoom = roomType.includes('Šestposteljna') ? 6 : 0;
    
    // Special cases for dormitories - look for "za X oseb" pattern
    const dormPattern = /za (\d+) oseb/;
    const dormMatch = roomType.match(dormPattern);
    if (dormMatch) {
        return parseInt(dormMatch[1]);
    }
    
    // Apartment/suite patterns
    if (roomType.includes('apartma') || roomType.includes('suite')) {
        // Try to extract number from context
        if (roomType.includes('4')) return 4;
        if (roomType.includes('6')) return 6;
        if (roomType.includes('8')) return 8;
        return 4; // Default for apartments
    }
    
    const total = singleRoom + doubleRoom + tripleRoom + quadRoom + pentaRoom + hexaRoom;
    return total || 1; // Default to 1 if can't determine
}

/**
 * Categorize room types
 */
function categorizeRoom(roomName) {
    const name = roomName.toLowerCase();
    
    if (name.includes('skupna') || name.includes('ležišč') || name.includes('dormitory')) {
        return 'dormitory';
    }
    if (name.includes('apartma') || name.includes('suite')) {
        return 'apartment';
    }
    if (name.includes('soba') || name.includes('room')) {
        return 'room';
    }
    if (name.includes('studio')) {
        return 'studio';
    }
    
    return 'room'; // Default
}

/**
 * Determine bed type from room name
 */
function determineBedType(roomName) {
    const name = roomName.toLowerCase();
    
    if (name.includes('zakonska')) return 'double_bed';
    if (name.includes('ločeni') || name.includes('twin')) return 'twin_beds';
    if (name.includes('enoposteljna')) return 'single_bed';
    if (name.includes('skupna') || name.includes('ležišč')) return 'bunk_beds';
    
    return null; // Let database handle null
}

/**
 * Populate database with all huts and their room types
 */
async function populateAllHuts() {
    try {
        console.log('🏠 Initializing database connection...');
        await database.initialize();
        
        // Load discovered room types
        const roomTypesPath = path.join(__dirname, '..', 'config', 'all-huts-room-types.json');
        
        if (!fs.existsSync(roomTypesPath)) {
            throw new Error(`Room types file not found: ${roomTypesPath}. Please run discover-all-hut-room-types.js first.`);
        }
        
        const hutRoomTypes = JSON.parse(fs.readFileSync(roomTypesPath, 'utf8'));
        
        console.log('📊 Processing huts and room types...\n');
        
        const results = {
            huts: [],
            totalRoomTypes: 0,
            errors: []
        };
        
        for (const [hutName, hutData] of Object.entries(hutRoomTypes)) {
            console.log(`\n🏔️  Processing: ${hutName}`);
            
            if (hutData.error) {
                console.log(`   ❌ Skipping due to error: ${hutData.error}`);
                results.errors.push({ hutName, error: hutData.error });
                continue;
            }
            
            try {
                // Create property entry
                const propertyId = await database.ensureProperty(
                    hutName,
                    `https://reservations.microgramm.si/hud/${hutData.hutSlug}/`,
                    `${hutName} mountain hut using Bentral booking system`
                );
                
                console.log(`   ✅ Property ID: ${propertyId}`);
                
                // Process room types
                const roomTypesAdded = [];
                for (const room of hutData.roomTypes) {
                    const capacity = extractRoomCapacity(room.name);
                    const category = categorizeRoom(room.name);
                    const bedType = determineBedType(room.name);
                    
                    console.log(`   📝 Adding room: ${room.name}`);
                    console.log(`      - Capacity: ${capacity}, Category: ${category}, Bed Type: ${bedType || 'unspecified'}`);
                    
                    const roomTypeId = await database.ensureRoomType(
                        propertyId,
                        room.name,
                        room.externalId,
                        capacity,
                        `${room.name} at ${hutName}`,
                        1, // quantity - default to 1 room of this type
                        bedType,
                        category
                    );
                    
                    roomTypesAdded.push({
                        id: roomTypeId,
                        name: room.name,
                        externalId: room.externalId,
                        capacity: capacity
                    });
                    
                    console.log(`      ✅ Room type ID: ${roomTypeId}`);
                }
                
                results.huts.push({
                    name: hutName,
                    propertyId: propertyId,
                    roomTypesCount: roomTypesAdded.length,
                    roomTypes: roomTypesAdded
                });
                
                results.totalRoomTypes += roomTypesAdded.length;
                
                console.log(`   🎉 Added ${roomTypesAdded.length} room types for ${hutName}`);
                
            } catch (error) {
                console.error(`   ❌ Error processing ${hutName}:`, error.message);
                results.errors.push({ hutName, error: error.message });
            }
        }
        
        // Summary
        console.log('\n\n📊 Final Summary:');
        console.log('='.repeat(60));
        console.log(`Successfully processed huts: ${results.huts.length}`);
        console.log(`Total room types added: ${results.totalRoomTypes}`);
        console.log(`Errors encountered: ${results.errors.length}`);
        
        if (results.errors.length > 0) {
            console.log('\n❌ Errors:');
            results.errors.forEach(err => {
                console.log(`   - ${err.hutName}: ${err.error}`);
            });
        }
        
        console.log('\n✅ Huts successfully added:');
        results.huts.forEach(hut => {
            console.log(`   - ${hut.name}: ${hut.roomTypesCount} room types (Property ID: ${hut.propertyId})`);
        });
        
        // Save results summary
        const summaryPath = path.join(__dirname, '..', 'config', 'population-summary.json');
        fs.writeFileSync(summaryPath, JSON.stringify(results, null, 2));
        console.log(`\n💾 Summary saved to: ${summaryPath}`);
        
        return results;
        
    } catch (error) {
        console.error('❌ Fatal error:', error);
        throw error;
    } finally {
        await database.close();
    }
}

// Run if called directly
if (require.main === module) {
    populateAllHuts()
        .then(() => {
            console.log('\n✨ Population complete!');
            process.exit(0);
        })
        .catch(error => {
            console.error('Fatal error:', error);
            process.exit(1);
        });
}

module.exports = { populateAllHuts, extractRoomCapacity, categorizeRoom, determineBedType };