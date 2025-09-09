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
    
    // Check for "X-posteljna" pattern
    const bedPattern = /(\d+)-posteljna/;
    const bedMatch = roomType.match(bedPattern);
    if (bedMatch) {
        return parseInt(bedMatch[1]);
    }
    
    // Check for "s X ležišči" pattern  
    const bedPattern2 = /s (\d+) ležišči/;
    const bedMatch2 = roomType.match(bedPattern2);
    if (bedMatch2) {
        return parseInt(bedMatch2[1]);
    }
    
    // Check for beds in name like "4 beds", "6 beds"
    const bedsPattern = /(\d+) bed/;
    const bedsMatch = roomType.match(bedsPattern);
    if (bedsMatch) {
        return parseInt(bedsMatch[1]);
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
        return 'shared';
    }
    if (name.includes('apartma') || name.includes('suite')) {
        return 'suite';
    }
    return 'private'; // Default for most rooms
}

/**
 * Determine bed type from room name
 */
function determineBedType(roomName) {
    const name = roomName.toLowerCase();
    const capacity = extractRoomCapacity(roomName);
    
    if (name.includes('zakonska')) return 'double_bed';
    if (name.includes('ločeni') || name.includes('twin')) return 'twin_beds';
    if (name.includes('enoposteljna') || capacity === 1) return 'single_bed';
    if (name.includes('skupna') || name.includes('ležišč')) return 'bunk_beds';
    if (capacity === 2) return 'double_bed';
    if (capacity > 2) return `${capacity} beds`;
    
    return null; // Let database handle null
}

/**
 * Generate slug from hut name
 */
function generateSlug(name) {
    return name.toLowerCase()
        .replace(/[čć]/g, 'c')
        .replace(/[šž]/g, 's') 
        .replace(/[đ]/g, 'd')
        .replace(/[ž]/g, 'z')
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

/**
 * Manually populate database with explicit IDs to avoid sequence permission issues
 */
async function manualPopulateHuts() {
    try {
        console.log('🏠 Initializing database connection...');
        await database.initialize();
        
        // Load discovered room types
        const roomTypesPath = path.join(__dirname, '..', 'config', 'all-huts-room-types.json');
        
        if (!fs.existsSync(roomTypesPath)) {
            throw new Error(`Room types file not found: ${roomTypesPath}. Please run discover-all-hut-room-types.js first.`);
        }
        
        const hutRoomTypes = JSON.parse(fs.readFileSync(roomTypesPath, 'utf8'));
        
        console.log('📊 Manually inserting huts with explicit IDs...\n');
        
        const results = {
            huts: [],
            totalRoomTypes: 0,
            errors: []
        };
        
        let propertyId = 2; // Start from ID 2 (Triglavski Dom is ID 1)
        
        for (const [hutName, hutData] of Object.entries(hutRoomTypes)) {
            console.log(`\n🏔️  Processing: ${hutName} (ID: ${propertyId})`);
            
            if (hutData.error) {
                console.log(`   ❌ Skipping due to error: ${hutData.error}`);
                results.errors.push({ hutName, error: hutData.error });
                continue;
            }
            
            // Skip Triglavski Dom as it already exists
            if (hutName === 'Triglavski dom na Kredarici') {
                console.log(`   ✅ Skipping - already exists with ID 1`);
                propertyId++; // Keep ID sequence consistent
                continue;
            }
            
            try {
                const slug = generateSlug(hutName);
                
                // Manual property insertion with explicit ID
                console.log(`   📝 Inserting property with ID ${propertyId} and slug '${slug}'`);
                
                await database.query(
                    `INSERT INTO properties (id, name, slug, booking_system, is_active, created_at, updated_at) 
                     VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
                     ON CONFLICT (id) DO NOTHING`,
                    [propertyId, hutName, slug, 'Bentral', true]
                );
                
                console.log(`   ✅ Property inserted with ID: ${propertyId}`);
                
                // Process room types
                const roomTypesAdded = [];
                for (const room of hutData.roomTypes) {
                    const capacity = extractRoomCapacity(room.name);
                    const category = categorizeRoom(room.name);
                    const bedType = determineBedType(room.name);
                    
                    console.log(`   📝 Adding room: ${room.name}`);
                    console.log(`      - Capacity: ${capacity}, Category: ${category}, Bed Type: ${bedType || 'unspecified'}`);
                    
                    // Manual room type insertion
                    const roomResult = await database.query(
                        `INSERT INTO room_types (property_id, external_id, name, capacity, quantity, bed_type, room_category, features, is_active, created_at, updated_at)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
                         RETURNING id`,
                        [
                            propertyId,
                            room.externalId,
                            room.name,
                            capacity,
                            1, // quantity
                            bedType,
                            category,
                            ['private_bathroom'], // default features
                            true
                        ]
                    );
                    
                    const roomTypeId = roomResult.rows[0].id;
                    
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
                
                propertyId++; // Increment for next hut
                
            } catch (error) {
                console.error(`   ❌ Error processing ${hutName}:`, error.message);
                results.errors.push({ hutName, error: error.message });
                propertyId++; // Still increment to keep sequence
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
        const summaryPath = path.join(__dirname, '..', 'config', 'manual-population-summary.json');
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
    manualPopulateHuts()
        .then(() => {
            console.log('\n✨ Manual population complete!');
            process.exit(0);
        })
        .catch(error => {
            console.error('Fatal error:', error);
            process.exit(1);
        });
}

module.exports = { manualPopulateHuts };