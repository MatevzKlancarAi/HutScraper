const database = require('../src/services/database');

async function fixRoomTypesSequence() {
    try {
        console.log('🔧 Fixing room_types sequence...');
        await database.initialize();
        
        // Get the sequence name for room_types.id
        const seqResult = await database.query(`SELECT pg_get_serial_sequence('availability.room_types', 'id')`);
        const sequenceName = seqResult.rows[0].pg_get_serial_sequence;
        
        if (!sequenceName) {
            console.log('⚠️  No sequence found for room_types.id (might be using bigserial or manually managed)');
            return;
        }
        
        console.log(`   Found sequence: ${sequenceName}`);
        
        // Update sequence to current max + 1
        const updateResult = await database.query(`SELECT setval('${sequenceName}', 96)`);
        console.log(`✅ Sequence updated to 96`);
        
        // Verify the sequence value
        const verifyResult = await database.query(`SELECT last_value FROM ${sequenceName}`);
        console.log(`   Current sequence value: ${verifyResult.rows[0].last_value}`);
        
    } catch (error) {
        console.error('❌ Error fixing sequence:', error.message);
        throw error;
    } finally {
        await database.close();
    }
}

if (require.main === module) {
    fixRoomTypesSequence()
        .then(() => {
            console.log('✨ Sequence fix complete!');
            process.exit(0);
        })
        .catch(error => {
            console.error('Fatal error:', error);
            process.exit(1);
        });
}

module.exports = { fixRoomTypesSequence };