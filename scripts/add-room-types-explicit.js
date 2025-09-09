const database = require('../src/services/database');
const fs = require('fs');
const path = require('path');

/**
 * Extract room capacity from room name (Slovenian)
 */
function extractRoomCapacity(roomType) {
    const singleRoom = roomType.includes('Enoposteljna') || roomType.includes('1-posteljna') ? 1 : 0;
    const doubleRoom = roomType.includes('Dvoposteljna') || roomType.includes('2-posteljna') || roomType.includes('2 posteljna') ? 2 : 0;
    const tripleRoom = roomType.includes('Triposteljna') || roomType.includes('3-posteljna') || roomType.includes('Troposteljna') ? 3 : 0;
    const quadRoom = roomType.includes('Štiriposteljna') || roomType.includes('4-posteljna') ? 4 : 0;
    const pentaRoom = roomType.includes('Petposteljna') || roomType.includes('5-posteljna') ? 5 : 0;
    const hexaRoom = roomType.includes('Šestposteljna') || roomType.includes('6-posteljna') ? 6 : 0;
    
    // Special cases for dormitories - look for "za X oseb" pattern
    const dormPattern = /za (\d+) oseb/;
    const dormMatch = roomType.match(dormPattern);
    if (dormMatch) {
        return parseInt(dormMatch[1]);
    }
    
    // Check for "s X ležišči" pattern  
    const bedPattern2 = /s (\d+) ležišči/;
    const bedMatch2 = roomType.match(bedPattern2);
    if (bedMatch2) {
        return parseInt(bedMatch2[1]);
    }
    
    // Special handling for bed mentions in names
    if (roomType.includes('štiriposteljni')) return 4;
    if (roomType.includes('5-posteljni')) return 5;
    if (roomType.includes('6-posteljni')) return 6;
    if (roomType.includes('10-posteljni')) return 10;
    
    const total = singleRoom + doubleRoom + tripleRoom + quadRoom + pentaRoom + hexaRoom;
    return total || 1; // Default to 1 if can't determine
}

/**
 * Categorize room types
 */
function categorizeRoom(roomName) {
    const name = roomName.toLowerCase();
    
    if (name.includes('skupna') || name.includes('ležišč') || name.includes('ležišče') || 
        name.includes('dormitory') || name.includes('postelja v skupni')) {
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
    if (name.includes('enoposteljna') || name.includes('1-posteljna') || capacity === 1) return 'single_bed';
    if (name.includes('skupna') || name.includes('ležišč') || name.includes('bunk')) return 'bunk_beds';
    if (capacity === 2) return 'double_bed';
    if (capacity > 2) return `${capacity} beds`;
    
    return null; 
}

/**
 * Add room types with explicit IDs starting from 16
 */
async function addRoomTypesExplicit() {
    try {
        console.log('🏠 Initializing database connection...');
        await database.initialize();
        
        // Load discovered room types
        const roomTypesPath = path.join(__dirname, '..', 'config', 'all-huts-room-types.json');
        
        if (!fs.existsSync(roomTypesPath)) {
            throw new Error(`Room types file not found: ${roomTypesPath}`);
        }
        
        const hutRoomTypes = JSON.parse(fs.readFileSync(roomTypesPath, 'utf8'));
        
        console.log('📊 Adding room types with explicit IDs starting from 16...\n');
        
        // Property name to ID mapping
        const propertyMapping = {
            'Aljažev dom v Vratih': 2,
            'Koča pod Bogatinom': 3,
            'Vodnikov dom': 4,
            'Planinska koča na Uskovnici': 5,
            'Dom Planika pod Triglavom': 6,
            'Koča na Doliču': 7,
            'Koča na Golici': 8,
            'Dom na Komni': 9,
            'Koča pri Triglavskih jezerih': 10,
            'Triglavski dom na Kredarici': 1 // Skip this one
        };
        
        let roomTypeId = 16; // Start after existing 15 room types
        let totalAdded = 0;
        const errors = [];
        
        for (const [hutName, hutData] of Object.entries(hutRoomTypes)) {
            console.log(`\n🏔️  Processing: ${hutName}`);
            
            if (hutData.error) {
                console.log(`   ❌ Skipping due to error: ${hutData.error}`);
                errors.push({ hutName, error: hutData.error });
                continue;
            }
            
            // Skip Triglavski Dom as it already has room types
            if (hutName === 'Triglavski dom na Kredarici') {
                console.log(`   ✅ Skipping - already has room types`);
                continue;
            }
            
            const propertyId = propertyMapping[hutName];
            if (!propertyId) {
                console.log(`   ❌ Property ID not found for ${hutName}`);
                errors.push({ hutName, error: 'Property ID not found' });
                continue;
            }
            
            try {
                let addedForHut = 0;
                
                // Process each room type
                for (const room of hutData.roomTypes) {
                    const capacity = extractRoomCapacity(room.name);
                    const category = categorizeRoom(room.name);
                    const bedType = determineBedType(room.name);
                    
                    console.log(`   📝 Adding room ${roomTypeId}: ${room.name}`);
                    console.log(`      - Capacity: ${capacity}, Category: ${category}, Bed Type: ${bedType || 'unspecified'}`);
                    
                    // Manual INSERT with explicit ID
                    await database.query(
                        `INSERT INTO room_types (id, property_id, external_id, name, capacity, quantity, bed_type, room_category, features, is_active, created_at, updated_at)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())`,
                        [
                            roomTypeId,
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
                    
                    console.log(`      ✅ Room type added with ID: ${roomTypeId}`);
                    
                    roomTypeId++;
                    addedForHut++;
                }
                
                totalAdded += addedForHut;
                console.log(`   🎉 Added ${addedForHut} room types for ${hutName}`);
                
            } catch (error) {
                console.error(`   ❌ Error processing ${hutName}:`, error.message);
                errors.push({ hutName, error: error.message });
            }
        }
        
        // Final summary
        console.log('\n\n📊 Final Summary:');
        console.log('='.repeat(60));
        console.log(`Total room types added: ${totalAdded}`);
        console.log(`Next available room_type ID: ${roomTypeId}`);
        console.log(`Errors encountered: ${errors.length}`);
        
        if (errors.length > 0) {
            console.log('\n❌ Errors:');
            errors.forEach(err => {
                console.log(`   - ${err.hutName}: ${err.error}`);
            });
        }
        
        // Verify final state
        const finalCounts = await database.query('SELECT property_id, COUNT(*) as room_count FROM room_types GROUP BY property_id ORDER BY property_id');
        console.log('\n✅ Final room types per property:');
        finalCounts.rows.forEach(c => console.log(`   Property ${c.property_id}: ${c.room_count} room types`));
        
        return {
            totalAdded,
            nextId: roomTypeId,
            errors
        };
        
    } catch (error) {
        console.error('❌ Fatal error:', error);
        throw error;
    } finally {
        await database.close();
    }
}

// Run if called directly
if (require.main === module) {
    addRoomTypesExplicit()
        .then((result) => {
            console.log(`\n✨ Room types addition complete! Added ${result.totalAdded} room types.`);
            process.exit(0);
        })
        .catch(error => {
            console.error('Fatal error:', error);
            process.exit(1);
        });
}

module.exports = { addRoomTypesExplicit };