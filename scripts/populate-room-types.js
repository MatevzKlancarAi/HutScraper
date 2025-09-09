const database = require('../src/services/database');

/**
 * Populate room types for Triglavski Dom from the existing config
 */
async function populateRoomTypes() {
    try {
        console.log('🏠 Initializing database connection...');
        await database.initialize();
        
        // Get or create Triglavski Dom property
        console.log('🏔️  Ensuring Triglavski Dom property exists...');
        const propertyId = await database.ensureProperty(
            'Triglavski Dom',
            'https://triglavskidom.si/',
            'Triglavski Dom mountain hut using Bentral booking system'
        );
        
        console.log(`✅ Property ID: ${propertyId}`);
        
        // Room types from the existing config
        const roomTypes = {
            'Dvoposteljna soba - zakonska postelja': '5f5441324e446b4d',
            'Enoposteljna soba': '5f5451794e7a4d4d', 
            'Triposteljna soba': '5f5441324e54414d',
            'Štiriposteljna soba': '5f5441324e54454d',
            'Petposteljna soba': '5f5441354d54554d',
            'Šestposteljna soba': '5f5441324e54494d',
            'Skupna ležišča za 7 oseb (A)': '5f5451794e7a594d',
            'Skupna ležišča za 7 oseb (B)': '5f5441324e7a4d4d',
            'Skupna ležišča za 8 oseb (A)': '5f5441394e7a514d',
            'Skupna ležišča za 8 oseb (B)': '5f5441394e7a554d',
            'Skupna ležišča za 10 oseb (A)': '5f5441324e7a594d',
            'Skupna ležišča za 10 oseb (B)': '5f5441324e446f4d',
            'Skupna ležišča za 12 oseb (A)': '5f5441324e52414d',
            'Skupna ležišča za 18 oseb': '5f5441324e52454d',
            'Skupna ležišča za 30 oseb': '5f5451794e52554d'
        };
        
        console.log('📝 Adding room types to database...');
        
        for (const [roomName, externalId] of Object.entries(roomTypes)) {
            // Extract capacity from room name
            const capacity = extractRoomCapacity(roomName);
            
            console.log(`   Adding: ${roomName} (capacity: ${capacity}, external_id: ${externalId})`);
            
            const roomTypeId = await database.ensureRoomType(
                propertyId,
                roomName,
                externalId,
                capacity,
                `${roomName} at Triglavski Dom`
            );
            
            console.log(`   ✅ Room type ID: ${roomTypeId}`);
        }
        
        console.log('🎉 All room types populated successfully!');
        
        // Verify the data
        console.log('\n📊 Verification:');
        const roomTypesMap = await database.getRoomTypesMapForProperty(propertyId);
        console.log(`Found ${Object.keys(roomTypesMap).length} room types in database:`);
        
        Object.entries(roomTypesMap).forEach(([name, info]) => {
            console.log(`   - ${name}: external_id=${info.external_id}, capacity=${info.capacity}`);
        });
        
    } catch (error) {
        console.error('❌ Error populating room types:', error);
    } finally {
        await database.close();
    }
}

/**
 * Extract room capacity from room name
 */
function extractRoomCapacity(roomType) {
    // Extract numbers from room type names
    const singleRoom = roomType.includes('Enoposteljna') ? 1 : 0;
    const doubleRoom = roomType.includes('Dvoposteljna') ? 2 : 0;
    const tripleRoom = roomType.includes('Triposteljna') ? 3 : 0;
    const quadRoom = roomType.includes('Štiriposteljna') ? 4 : 0;
    const pentaRoom = roomType.includes('Petposteljna') ? 5 : 0;
    const hexaRoom = roomType.includes('Šestposteljna') ? 6 : 0;
    
    // Special cases for dormitories
    if (roomType.includes('za 7 oseb')) return 7;
    if (roomType.includes('za 8 oseb')) return 8;
    if (roomType.includes('za 10 oseb')) return 10;
    if (roomType.includes('za 12 oseb')) return 12;
    if (roomType.includes('za 18 oseb')) return 18;
    if (roomType.includes('za 30 oseb')) return 30;
    
    return singleRoom + doubleRoom + tripleRoom + quadRoom + pentaRoom + hexaRoom || 1;
}

// Run if called directly
if (require.main === module) {
    populateRoomTypes();
}

module.exports = { populateRoomTypes };