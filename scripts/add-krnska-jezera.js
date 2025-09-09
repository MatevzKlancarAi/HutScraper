const database = require('../src/services/database');
const fs = require('fs');
const path = require('path');

/**
 * Extract room capacity from room name (Slovenian)
 */
function extractRoomCapacity(roomType) {
    // Handle specific patterns for Planinski dom Krnska jezera
    if (roomType.includes('Dvoposteljna')) return 2;
    if (roomType.includes('Štiriposteljna')) return 4;
    if (roomType.includes('sobi za 4 osebe')) return 1; // 1 bed in 4-person room
    if (roomType.includes('sobi za 5 oseb')) return 1; // 1 bed in 5-person room
    if (roomType.includes('za 12 oseb')) return 12;
    if (roomType.includes('za 18 oseb')) return 18;
    if (roomType.includes('za 21 oseb')) return 21;
    
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
    return total || 2; // Default to 2 based on patterns
}

/**
 * Categorize room types
 */
function categorizeRoom(roomName) {
    const name = roomName.toLowerCase();
    
    if (name.includes('skupn') || name.includes('ležišč') || name.includes('ležišče') || 
        name.includes('dormitory') || name.includes('postelja v skupni') || name.includes('postelja v sobi')) {
        return 'shared';
    }
    if (name.includes('apartma') || name.includes('suite')) {
        return 'suite';
    }
    return 'private'; // Default for private rooms
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
 * Add property and room types for Planinski dom Krnska jezera with explicit IDs
 */
async function addKrnskaJezera() {
    try {
        console.log('🏠 Initializing database connection...');
        await database.initialize();
        
        // Load discovered room types
        const roomTypesPath = path.join(__dirname, '..', 'config', 'all-huts-room-types.json');
        
        if (!fs.existsSync(roomTypesPath)) {
            throw new Error(`Room types file not found: ${roomTypesPath}`);
        }
        
        const hutRoomTypes = JSON.parse(fs.readFileSync(roomTypesPath, 'utf8'));
        
        console.log('📊 Adding property and room types for Planinski dom Krnska jezera...\n');
        
        const hutName = 'Planinski dom Krnska jezera';
        const propertyId = 12; // Next property ID
        let roomTypeId = 96; // Start after existing max ID of 95
        
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
        
        // Create property with explicit ID
        console.log('📝 Creating property...');
        const slug = hutName.toLowerCase().replace(/\\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        const locationJson = JSON.stringify({ description: `${hutName} mountain hut using Bentral booking system` });
        
        await database.query(`
            INSERT INTO availability.properties (id, name, slug, location, booking_system, is_active, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `, [propertyId, hutName, slug, locationJson, 'Bentral', true]);
        
        console.log(`   ✅ Property created with ID: ${propertyId}\n`);
        
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
    addKrnskaJezera()
        .then((result) => {
            console.log(`\n✨ Addition complete!`);
            console.log(`   Added property and ${result.totalAdded} room types for ${result.hutName}`);
            console.log(`   Property ID: ${result.propertyId}`);
            console.log(`   Next available room_type ID: ${result.nextId}`);
            process.exit(0);
        })
        .catch(error => {
            console.error('Fatal error:', error);
            process.exit(1);
        });
}

module.exports = { addKrnskaJezera };