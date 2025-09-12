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
        const query = `
            INSERT INTO availability.properties (name, slug, location, booking_system, is_active)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (slug) DO UPDATE SET
                name = EXCLUDED.name,
                booking_system = EXCLUDED.booking_system,
                updated_at = CURRENT_TIMESTAMP
            RETURNING id;
        `;
        
        const locationJson = JSON.stringify({ description: description });
        const result = await this.query(query, [name, slug, locationJson, 'Bentral', true]);
        return result.rows[0].id;
    }

    async ensureRoomType(propertyId, name, bentalId, capacity, description = null) {
        // First check if room type exists
        const findQuery = `
            SELECT id FROM availability.room_types WHERE property_id = $1 AND external_id = $2 LIMIT 1;
        `;
        
        const existingResult = await this.query(findQuery, [propertyId, bentalId]);
        if (existingResult.rows.length > 0) {
            return existingResult.rows[0].id;
        }
        
        const query = `
            INSERT INTO availability.room_types (property_id, external_id, name, capacity, quantity, bed_type, room_category, features, is_active, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            RETURNING id;
        `;
        
        // Determine room category and bed type from name
        const roomCategory = name.includes('Skupna ležišča') ? 'shared' : 'private';
        const bedType = capacity === 1 ? '1 single bed' : capacity === 2 ? '1 double bed' : `${capacity} beds`;
        const features = roomCategory === 'shared' ? ['shared_dormitory'] : ['private_bathroom'];
        
        const result = await this.query(query, [
            propertyId, 
            bentalId, 
            name, 
            capacity, 
            1, // quantity
            bedType,
            roomCategory,
            features,
            true // is_active
        ]);
        return result.rows[0].id;
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
                    // Generate IDs based on current timestamp + incremental offset to ensure uniqueness
                    const baseId = Date.now() * 1000; // Microsecond-level precision
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

                        // Generate unique ID using timestamp + index + random component
                        const uniqueId = baseId + i + Math.floor(Math.random() * 1000);

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