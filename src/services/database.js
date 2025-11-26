const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

class DatabaseService {
    constructor() {
        this.pool = null;
        this.isConnected = false;
    }

    async initialize() {
        if (this.pool) {
            return this.pool;
        }

        this.pool = new Pool({
            host: process.env.DATABASE_HOST || 'localhost',
            port: parseInt(process.env.DATABASE_PORT) || 5432,
            database: process.env.DATABASE_NAME || 'mountain_huts',
            user: process.env.DATABASE_USER || 'postgres',
            password: process.env.DATABASE_PASSWORD,
            max: parseInt(process.env.DATABASE_MAX_CONNECTIONS) || 10,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
        });

        try {
            const client = await this.pool.connect();
            await client.query('SELECT NOW()');
            // Set search_path to include availability schema
            await client.query("SET search_path TO availability, public, \"$user\"");
            client.release();
            this.isConnected = true;
            console.log('Database connected successfully');
            return this.pool;
        } catch (error) {
            console.error('Database connection failed:', error);
            throw error;
        }
    }

    async query(text, params = []) {
        if (!this.pool) {
            throw new Error('Database not initialized. Call initialize() first.');
        }
        
        try {
            // Get client and set search path for this connection
            const client = await this.pool.connect();
            try {
                await client.query("SET search_path TO availability, public, \"$user\"");
                const result = await client.query(text, params);
                return result;
            } finally {
                client.release();
            }
        } catch (error) {
            console.error('Database query error:', error);
            throw error;
        }
    }

    async transaction(callback) {
        if (!this.pool) {
            throw new Error('Database not initialized. Call initialize() first.');
        }

        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async ensureProperty(name, url, description = null) {
        // First try to find by name since URL might not be unique constraint in your schema
        const findQuery = `
            SELECT id FROM availability.properties WHERE name = $1 LIMIT 1;
        `;

        const existingResult = await this.query(findQuery, [name]);
        if (existingResult.rows.length > 0) {
            return existingResult.rows[0].id;
        }

        // Create new property with slug derived from name
        const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

        // Use transaction with row-level lock to prevent concurrent ID collisions
        return await this.transaction(async (client) => {
            // Lock the table to prevent concurrent MAX(id) queries
            await client.query('LOCK TABLE availability.properties IN SHARE ROW EXCLUSIVE MODE');

            // Get next available ID (max + 1) to avoid sequence permission issues
            const maxIdQuery = `SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM availability.properties`;
            const maxIdResult = await client.query(maxIdQuery);
            const generatedId = maxIdResult.rows[0].next_id;

            const query = `
                INSERT INTO availability.properties (id, name, slug, location, booking_system, is_active)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (slug) DO UPDATE SET
                    name = EXCLUDED.name,
                    booking_system = EXCLUDED.booking_system,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING id;
            `;

            const locationJson = JSON.stringify({ description: description });
            const result = await client.query(query, [generatedId, name, slug, locationJson, 'hut-reservation.org', true]);
            return result.rows[0].id;
        });
    }

    async ensureRoomType(propertyId, name, capacityOrBentalId, capacity = null, description = null) {
        // Support both signatures:
        // ensureRoomType(propertyId, name, capacity) - for HutReservation
        // ensureRoomType(propertyId, name, bentalId, capacity) - for Bentral (legacy)

        let externalId = null;
        let actualCapacity = null;

        if (capacity === null) {
            // New signature: ensureRoomType(propertyId, name, capacity)
            actualCapacity = capacityOrBentalId;
            externalId = null;
        } else {
            // Legacy signature: ensureRoomType(propertyId, name, bentalId, capacity)
            externalId = capacityOrBentalId;
            actualCapacity = capacity;
        }

        // First check if room type exists
        let findQuery;
        let findParams;

        if (externalId) {
            // Find by external_id (for Bentral)
            findQuery = `
                SELECT id FROM availability.room_types WHERE property_id = $1 AND external_id = $2 LIMIT 1;
            `;
            findParams = [propertyId, externalId];
        } else {
            // Find by property_id and name (for HutReservation)
            findQuery = `
                SELECT id FROM availability.room_types WHERE property_id = $1 AND name = $2 LIMIT 1;
            `;
            findParams = [propertyId, name];
        }

        const existingResult = await this.query(findQuery, findParams);
        if (existingResult.rows.length > 0) {
            return existingResult.rows[0].id;
        }

        // Use transaction with row-level lock to prevent concurrent ID collisions
        return await this.transaction(async (client) => {
            // Lock the table to prevent concurrent MAX(id) queries
            await client.query('LOCK TABLE availability.room_types IN SHARE ROW EXCLUSIVE MODE');

            // Get next available ID (max + 1) to avoid sequence permission issues
            const maxIdQuery = `SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM availability.room_types`;
            const maxIdResult = await client.query(maxIdQuery);
            const generatedId = maxIdResult.rows[0].next_id;

            const query = `
                INSERT INTO availability.room_types (id, property_id, external_id, name, capacity, quantity, bed_type, room_category, features, is_active, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                RETURNING id;
            `;

            // Determine room category and bed type from name
            const roomCategory = name.includes('Skupna ležišča') || name.includes('Dormitory') || name.includes('Matratzenlager') ? 'shared' : 'private';
            const bedType = actualCapacity === 1 ? '1 single bed' : actualCapacity === 2 ? '1 double bed' : `${actualCapacity} beds`;
            const features = roomCategory === 'shared' ? ['shared_dormitory'] : ['private_bathroom'];

            const result = await client.query(query, [
                generatedId,
                propertyId,
                externalId, // Can be null for HutReservation
                name,
                actualCapacity,
                1, // quantity
                bedType,
                roomCategory,
                features,
                true // is_active
            ]);
            return result.rows[0].id;
        });
    }

    async saveAvailability(propertyId, roomTypeId, date, canCheckin = true, canCheckout = true) {
        // Simple wrapper for single date insert
        await this.upsertAvailableDates(roomTypeId, [
            { date, can_checkin: canCheckin, can_checkout: canCheckout }
        ]);
    }

    async upsertAvailableDates(roomTypeId, availableDates, dateRange = null) {
        // Get property_id for this room type
        const propertyQuery = `SELECT property_id FROM availability.room_types WHERE id = $1`;
        const propertyResult = await this.query(propertyQuery, [roomTypeId]);
        
        if (propertyResult.rows.length === 0) {
            throw new Error(`Room type ID ${roomTypeId} not found`);
        }
        
        const propertyId = propertyResult.rows[0].property_id;

        // Execute transaction once - no retries needed with auto-increment IDs
        try {
            return await this.transaction(async (client) => {
                    // Lock the table to prevent concurrent MAX(id) queries
                    await client.query('LOCK TABLE availability.available_dates IN SHARE ROW EXCLUSIVE MODE');

                    // Smart date range deletion
                    if (dateRange && dateRange.minDate && dateRange.maxDate) {
                        // Delete only dates within the scraped range
                        const deleteQuery = `
                            DELETE FROM availability.available_dates
                            WHERE room_type_id = $1
                            AND date BETWEEN $2 AND $3
                        `;
                        await client.query(deleteQuery, [roomTypeId, dateRange.minDate, dateRange.maxDate]);
                        console.log(`   🗑️  Deleted existing dates in range ${dateRange.minDate} to ${dateRange.maxDate}`);
                    } else {
                        // Fallback: Delete all existing dates for this room type (legacy behavior)
                        await client.query('DELETE FROM availability.available_dates WHERE room_type_id = $1', [roomTypeId]);
                        console.log(`   🗑️  Deleted all existing dates for room type ${roomTypeId}`);
                    }

                    if (!availableDates || availableDates.length === 0) {
                        console.log(`   ⚠️  No available dates to insert`);
                        return;
                    }

                    // Use timestamp-based ID generation to avoid sequence permissions and collisions
                    // Generate IDs using max ID + increment to ensure uniqueness
                    const maxIdQuery = `SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM availability.available_dates`;
                    const maxIdResult = await client.query(maxIdQuery);
                    let nextId = maxIdResult.rows[0].next_id;

                    let insertedCount = 0;

                    for (let i = 0; i < availableDates.length; i++) {
                        const dateEntry = availableDates[i];
                        let date, canCheckin, canCheckout;

                        if (typeof dateEntry === 'string') {
                            // Legacy format: just date string
                            date = dateEntry;
                            canCheckin = true;
                            canCheckout = true;
                        } else {
                            // New format: availability object
                            date = dateEntry.date;
                            canCheckin = dateEntry.can_checkin !== false; // Default to true
                            canCheckout = dateEntry.can_checkout !== false; // Default to true
                        }

                        // Use incrementing ID from max
                        const uniqueId = nextId++;


                        // Individual INSERT with manual ID and ON CONFLICT handling
                        const insertQuery = `
                            INSERT INTO availability.available_dates (id, property_id, room_type_id, date, can_checkin, can_checkout, scraped_at)
                            VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
                            ON CONFLICT (property_id, room_type_id, date) DO UPDATE SET
                                can_checkin = EXCLUDED.can_checkin,
                                can_checkout = EXCLUDED.can_checkout,
                                scraped_at = CURRENT_TIMESTAMP;
                        `;
                        
                        await client.query(insertQuery, [uniqueId, propertyId, roomTypeId, date, canCheckin, canCheckout]);
                        insertedCount++;
                    }
                    
                    console.log(`   ✅ Inserted ${insertedCount} available dates`);
                });
                
        } catch (error) {
            console.error('   ❌ Database upsert failed:', error.message);
            throw error;
        }
    }

    async getAvailableDates(propertyId, roomTypeId = null, startDate = null, endDate = null) {
        let query = `
            SELECT p.name as property_name, rt.name as room_type_name, ad.date as available_date
            FROM availability.available_dates ad
            JOIN availability.room_types rt ON ad.room_type_id = rt.id
            JOIN availability.properties p ON rt.property_id = p.id
            WHERE p.id = $1
        `;
        
        const params = [propertyId];
        let paramIndex = 2;

        if (roomTypeId) {
            query += ` AND rt.id = $${paramIndex}`;
            params.push(roomTypeId);
            paramIndex++;
        }

        if (startDate) {
            query += ` AND ad.date >= $${paramIndex}`;
            params.push(startDate);
            paramIndex++;
        }

        if (endDate) {
            query += ` AND ad.date <= $${paramIndex}`;
            params.push(endDate);
            paramIndex++;
        }

        query += ' ORDER BY ad.date ASC';

        const result = await this.query(query, params);
        return result.rows;
    }

    async getLastScrapingRun(propertyId) {
        const query = `
            SELECT MAX(ad.scraped_at) as last_run
            FROM availability.available_dates ad
            JOIN availability.room_types rt ON ad.room_type_id = rt.id
            WHERE rt.property_id = $1
        `;
        
        const result = await this.query(query, [propertyId]);
        return result.rows[0]?.last_run || null;
    }

    async getScrapingStats(propertyId = null) {
        let query = `
            SELECT 
                p.name as property_name,
                rt.name as room_type_name,
                COUNT(ad.date) as available_dates_count,
                MIN(ad.date) as earliest_date,
                MAX(ad.date) as latest_date,
                MAX(ad.scraped_at) as last_updated
            FROM availability.available_dates ad
            JOIN availability.room_types rt ON ad.room_type_id = rt.id
            JOIN availability.properties p ON rt.property_id = p.id
        `;
        
        const params = [];
        if (propertyId) {
            query += ' WHERE p.id = $1';
            params.push(propertyId);
        }
        
        query += ' GROUP BY p.id, p.name, rt.id, rt.name ORDER BY p.name, rt.name';

        const result = await this.query(query, params);
        return result.rows;
    }

    async getPropertyByName(name) {
        const query = `
            SELECT id, name, slug, location, booking_system, is_active, created_at, updated_at 
            FROM availability.properties 
            WHERE name = $1 AND is_active = true
            LIMIT 1;
        `;
        
        const result = await this.query(query, [name]);
        return result.rows.length > 0 ? result.rows[0] : null;
    }

    async getRoomTypesForProperty(propertyId) {
        const query = `
            SELECT id, external_id, name, capacity, quantity, bed_type, room_category, features, is_active
            FROM availability.room_types 
            WHERE property_id = $1 AND is_active = true
            ORDER BY name;
        `;
        
        const result = await this.query(query, [propertyId]);
        return result.rows;
    }

    async getRoomTypesMapForProperty(propertyId) {
        const roomTypes = await this.getRoomTypesForProperty(propertyId);
        const map = {};
        
        roomTypes.forEach(roomType => {
            if (roomType.external_id) {
                map[roomType.name] = {
                    id: roomType.id,
                    external_id: roomType.external_id,
                    capacity: roomType.capacity,
                    bed_type: roomType.bed_type,
                    room_category: roomType.room_category,
                    features: roomType.features
                };
            }
        });
        
        return map;
    }

    async close() {
        if (this.pool) {
            await this.pool.end();
            this.isConnected = false;
            console.log('Database connection closed');
        }
    }

    getHealthStatus() {
        return {
            connected: this.isConnected,
            totalConnections: this.pool?.totalCount || 0,
            idleConnections: this.pool?.idleCount || 0,
            waitingConnections: this.pool?.waitingCount || 0
        };
    }
}

module.exports = new DatabaseService();