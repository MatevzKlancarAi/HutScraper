const database = require('../src/services/database');
const fs = require('fs');
const path = require('path');

/**
 * Extract room capacity from room name (Slovenian)
 */
function extractRoomCapacity(roomType) {
    // Handle specific patterns for Prešernova koča
    if (roomType.includes('4 posteljna')) return 4;
    if (roomType.includes('6 posteljna')) return 6;
    if (roomType.includes('10 oseb')) return 10;
    
    // Standard patterns
    const singleRoom = roomType.includes('Enoposteljna') || roomType.includes('1-posteljna') ? 1 : 0;
    const doubleRoom = roomType.includes('Dvoposteljna') || roomType.includes('2-posteljna') ? 2 : 0;
    const tripleRoom = roomType.includes('Triposteljna') || roomType.includes('3-posteljna') ? 3 : 0;
    const quadRoom = roomType.includes('Štiriposteljna') || roomType.includes('4-posteljna') ? 4 : 0;
    const pentaRoom = roomType.includes('Petposteljna') || roomType.includes('5-posteljna') ? 5 : 0;
    const hexaRoom = roomType.includes('Šestposteljna') || roomType.includes('6-posteljna') ? 6 : 0;
    
    // Special cases for dormitories - look for "za X oseb" pattern
    const dormPattern = /za (\d+) oseb/;
    const dormMatch = roomType.match(dormPattern);
    if (dormMatch) {
        return parseInt(dormMatch[1]);
    }
    
    const total = singleRoom + doubleRoom + tripleRoom + quadRoom + pentaRoom + hexaRoom;
    return total || 4; // Default to 4 for these rooms based on the pattern
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
    if (name.includes('zasebna') || name.includes('private')) {
        return 'private';
    }
    return 'private'; // Default for Prešernova koča rooms
}

/**
 * Determine bed type from room name
 */
function determineBedType(roomName) {
    const name = roomName.toLowerCase();
    const capacity = extractRoomCapacity(roomName);
    
    if (name.includes('zakonska')) return 'double_bed';
    if (name.includes('ločeni') || name.includes('twin')) return 'twin_beds';
    if (capacity === 1) return 'single_bed';
    if (capacity === 2) return 'double_bed';
    if (capacity > 2) return `${capacity} beds`;
    
    return `${capacity} beds`; 
}

/**
 * Add room types for Prešernova koča na Stolu with explicit IDs
 */
async function addPresernovaRoomTypes() {
    try {
        console.log('🏠 Initializing database connection...');
        await database.initialize();
        
        // Load discovered room types
        const roomTypesPath = path.join(__dirname, '..', 'config', 'all-huts-room-types.json');
        
        if (!fs.existsSync(roomTypesPath)) {
            throw new Error(`Room types file not found: ${roomTypesPath}`);
        }
        
        const hutRoomTypes = JSON.parse(fs.readFileSync(roomTypesPath, 'utf8'));
        
        console.log('📊 Adding room types for Prešernova koča na Stolu...\n');
        
        const hutName = 'Prešernova koča na Stolu';
        const propertyId = 11; // We know this from earlier query
        let roomTypeId = 90; // Start after existing max ID of 89
        
        const hutData = hutRoomTypes[hutName];
        if (!hutData) {
            throw new Error(`Room types not found for ${hutName}`);
        }
        
        if (hutData.error) {
            throw new Error(`Room types discovery failed: ${hutData.error}`);
        }
        
        console.log(`🏔️  Processing: ${hutName}`);
        console.log(`    Property ID: ${propertyId}`);
        console.log(`    Starting room type ID: ${roomTypeId}`);
        console.log(`    Room types to add: ${hutData.roomTypes.length}\n`);
        
        let totalAdded = 0;
        
        // Process each room type
        for (const room of hutData.roomTypes) {
            const capacity = extractRoomCapacity(room.name);
            const category = categorizeRoom(room.name);
            const bedType = determineBedType(room.name);
            
            console.log(`   📝 Adding room ${roomTypeId}: ${room.name}`);
            console.log(`      - External ID: ${room.externalId}`);
            console.log(`      - Capacity: ${capacity}, Category: ${category}, Bed Type: ${bedType}`);
            
            // Manual INSERT with explicit ID into availability schema
            await database.query(
                `INSERT INTO availability.room_types (id, property_id, external_id, name, capacity, quantity, bed_type, room_category, features, is_active, created_at, updated_at)
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
            
            console.log(`      ✅ Room type added with ID: ${roomTypeId}\n`);
            
            roomTypeId++;
            totalAdded++;
        }
        
        console.log(`🎉 Successfully added ${totalAdded} room types for ${hutName}`);
        
        // Verify the insertion
        const verifyResult = await database.query(
            'SELECT COUNT(*) as count FROM availability.room_types WHERE property_id = $1', 
            [propertyId]
        );
        
        console.log(`✅ Verification: Property ${propertyId} now has ${verifyResult.rows[0].count} room types`);
        
        return {
            totalAdded,
            nextId: roomTypeId,
            propertyId,
            hutName
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
    addPresernovaRoomTypes()
        .then((result) => {
            console.log(`\n✨ Room types addition complete!`);
            console.log(`   Added ${result.totalAdded} room types for ${result.hutName}`);
            console.log(`   Next available room_type ID: ${result.nextId}`);
            process.exit(0);
        })
        .catch(error => {
            console.error('Fatal error:', error);
            process.exit(1);
        });
}

module.exports = { addPresernovaRoomTypes };