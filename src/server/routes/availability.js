const express = require('express');
const database = require('../../services/database');
const router = express.Router();

// GET /api/v1/availability - Query availability data
router.get('/', async (req, res) => {
    try {
        const {
            property_id = null,
            property_name = null,
            room_type_id = null,
            start_date = null,
            end_date = null,
            limit = 1000,
            offset = 0,
            format = 'detailed' // 'detailed' | 'simple' | 'calendar'
        } = req.query;

        // Validate limit
        const maxLimit = 10000;
        const actualLimit = Math.min(parseInt(limit) || 1000, maxLimit);
        const actualOffset = parseInt(offset) || 0;

        // Build query based on parameters
        let query = `
            SELECT 
                p.id as property_id,
                p.name as property_name,
                p.slug as property_slug,
                rt.id as room_type_id,
                rt.name as room_type_name,
                rt.capacity,
                rt.bed_type,
                rt.room_category,
                ad.date as available_date,
                ad.can_checkin,
                ad.can_checkout,
                ad.scraped_at
            FROM availability.available_dates ad
            JOIN availability.room_types rt ON ad.room_type_id = rt.id
            JOIN availability.properties p ON rt.property_id = p.id
            WHERE 1=1
        `;

        const params = [];
        let paramIndex = 1;

        // Filter by property_id
        if (property_id) {
            query += ` AND p.id = $${paramIndex}`;
            params.push(parseInt(property_id));
            paramIndex++;
        }

        // Filter by property_name
        if (property_name) {
            query += ` AND p.name ILIKE $${paramIndex}`;
            params.push(`%${property_name}%`);
            paramIndex++;
        }

        // Filter by room_type_id
        if (room_type_id) {
            query += ` AND rt.id = $${paramIndex}`;
            params.push(parseInt(room_type_id));
            paramIndex++;
        }

        // Filter by date range
        if (start_date) {
            query += ` AND ad.date >= $${paramIndex}`;
            params.push(start_date);
            paramIndex++;
        }

        if (end_date) {
            query += ` AND ad.date <= $${paramIndex}`;
            params.push(end_date);
            paramIndex++;
        }

        // Add ordering and pagination
        query += ` ORDER BY p.name, rt.name, ad.date`;
        query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(actualLimit, actualOffset);

        const result = await database.query(query, params);

        // Format response based on requested format
        let formattedData;
        if (format === 'simple') {
            formattedData = result.rows.map(row => ({
                property: row.property_name,
                room_type: row.room_type_name,
                date: row.available_date,
                checkin: row.can_checkin,
                checkout: row.can_checkout
            }));
        } else if (format === 'calendar') {
            // Group by property and room type
            formattedData = {};
            result.rows.forEach(row => {
                const propertyKey = row.property_name;
                const roomKey = row.room_type_name;
                
                if (!formattedData[propertyKey]) {
                    formattedData[propertyKey] = {};
                }
                
                if (!formattedData[propertyKey][roomKey]) {
                    formattedData[propertyKey][roomKey] = {
                        capacity: row.capacity,
                        bed_type: row.bed_type,
                        room_category: row.room_category,
                        available_dates: []
                    };
                }
                
                formattedData[propertyKey][roomKey].available_dates.push({
                    date: row.available_date,
                    can_checkin: row.can_checkin,
                    can_checkout: row.can_checkout
                });
            });
        } else {
            // Default detailed format
            formattedData = result.rows;
        }

        res.json({
            data: formattedData,
            pagination: {
                limit: actualLimit,
                offset: actualOffset,
                total: result.rows.length,
                has_more: result.rows.length === actualLimit
            },
            filters: {
                property_id,
                property_name,
                room_type_id,
                start_date,
                end_date
            },
            format
        });

    } catch (error) {
        res.status(500).json({
            error: 'Failed to query availability',
            message: error.message
        });
    }
});

// GET /api/v1/availability/properties/:id - Get availability for specific property
router.get('/properties/:id', async (req, res) => {
    try {
        const propertyId = parseInt(req.params.id);
        const {
            room_type_id = null,
            start_date = null,
            end_date = null,
            format = 'grouped'
        } = req.query;

        if (isNaN(propertyId)) {
            return res.status(400).json({
                error: 'Invalid property ID',
                message: 'Property ID must be a number'
            });
        }

        // First check if property exists
        const propertyCheck = await database.query(
            'SELECT id, name, slug FROM availability.properties WHERE id = $1 AND is_active = true',
            [propertyId]
        );

        if (propertyCheck.rows.length === 0) {
            return res.status(404).json({
                error: 'Property not found',
                message: 'Property does not exist or is not active'
            });
        }

        const property = propertyCheck.rows[0];

        // Get availability data
        const availabilityData = await database.getAvailableDates(
            propertyId, 
            room_type_id, 
            start_date, 
            end_date
        );

        // Format based on requested format
        let formattedData;
        if (format === 'grouped') {
            // Group by room type
            const grouped = {};
            availabilityData.forEach(row => {
                const roomType = row.room_type_name;
                if (!grouped[roomType]) {
                    grouped[roomType] = [];
                }
                grouped[roomType].push({
                    date: row.available_date,
                    // Add checkin/checkout info if available
                });
            });
            formattedData = grouped;
        } else {
            formattedData = availabilityData;
        }

        res.json({
            property,
            availability: formattedData,
            total_dates: availabilityData.length,
            date_range: {
                start: start_date,
                end: end_date
            }
        });

    } catch (error) {
        res.status(500).json({
            error: 'Failed to get property availability',
            message: error.message
        });
    }
});

// GET /api/v1/availability/search - Search availability with advanced filters
router.get('/search', async (req, res) => {
    try {
        const {
            checkin_date = null,
            checkout_date = null,
            capacity = null,
            room_category = null, // 'shared' | 'private'
            property_names = null, // comma-separated list
            available_days = 1 // minimum consecutive days available
        } = req.query;

        if (!checkin_date) {
            return res.status(400).json({
                error: 'Missing required parameter',
                message: 'checkin_date is required'
            });
        }

        // Build complex query for availability search
        let query = `
            WITH consecutive_availability AS (
                SELECT 
                    p.id as property_id,
                    p.name as property_name,
                    rt.id as room_type_id,
                    rt.name as room_type_name,
                    rt.capacity,
                    rt.room_category,
                    rt.bed_type,
                    ad.date,
                    ad.can_checkin,
                    ad.can_checkout,
                    LAG(ad.date, 1) OVER (
                        PARTITION BY rt.id 
                        ORDER BY ad.date
                    ) as prev_date
                FROM availability.available_dates ad
                JOIN availability.room_types rt ON ad.room_type_id = rt.id
                JOIN availability.properties p ON rt.property_id = p.id
                WHERE ad.date >= $1
        `;

        const params = [checkin_date];
        let paramIndex = 2;

        // Add checkout date filter
        if (checkout_date) {
            query += ` AND ad.date <= $${paramIndex}`;
            params.push(checkout_date);
            paramIndex++;
        }

        // Add capacity filter
        if (capacity) {
            query += ` AND rt.capacity >= $${paramIndex}`;
            params.push(parseInt(capacity));
            paramIndex++;
        }

        // Add room category filter
        if (room_category && ['shared', 'private'].includes(room_category)) {
            query += ` AND rt.room_category = $${paramIndex}`;
            params.push(room_category);
            paramIndex++;
        }

        // Add property names filter
        if (property_names) {
            const names = property_names.split(',').map(name => name.trim());
            query += ` AND p.name = ANY($${paramIndex})`;
            params.push(names);
            paramIndex++;
        }

        query += `
                AND p.is_active = true 
                AND rt.is_active = true
            )
            SELECT 
                property_id,
                property_name,
                room_type_id,
                room_type_name,
                capacity,
                room_category,
                bed_type,
                COUNT(*) as available_days,
                MIN(date) as first_available_date,
                MAX(date) as last_available_date,
                ARRAY_AGG(date ORDER BY date) as available_dates
            FROM consecutive_availability
            GROUP BY 
                property_id, property_name, 
                room_type_id, room_type_name, 
                capacity, room_category, bed_type
            HAVING COUNT(*) >= $${paramIndex}
            ORDER BY property_name, room_type_name
        `;
        params.push(parseInt(available_days) || 1);

        const result = await database.query(query, params);

        res.json({
            search_criteria: {
                checkin_date,
                checkout_date,
                capacity,
                room_category,
                property_names,
                minimum_available_days: parseInt(available_days) || 1
            },
            results: result.rows,
            total_matches: result.rows.length
        });

    } catch (error) {
        res.status(500).json({
            error: 'Failed to search availability',
            message: error.message
        });
    }
});

// GET /api/v1/availability/summary - Get availability summary statistics
router.get('/summary', async (req, res) => {
    try {
        const {
            start_date = null,
            end_date = null,
            group_by = 'property' // 'property' | 'room_type' | 'date'
        } = req.query;

        let query, params = [];
        
        if (group_by === 'property') {
            query = `
                SELECT 
                    p.name as property_name,
                    COUNT(DISTINCT rt.id) as room_types_count,
                    COUNT(ad.date) as total_available_dates,
                    MIN(ad.date) as earliest_date,
                    MAX(ad.date) as latest_date,
                    MAX(ad.scraped_at) as last_updated
                FROM availability.properties p
                JOIN availability.room_types rt ON p.id = rt.property_id
                LEFT JOIN availability.available_dates ad ON rt.id = ad.room_type_id
                WHERE p.is_active = true AND rt.is_active = true
            `;
        } else if (group_by === 'room_type') {
            query = `
                SELECT 
                    p.name as property_name,
                    rt.name as room_type_name,
                    rt.capacity,
                    rt.room_category,
                    COUNT(ad.date) as available_dates_count,
                    MIN(ad.date) as earliest_date,
                    MAX(ad.date) as latest_date
                FROM availability.room_types rt
                JOIN availability.properties p ON rt.property_id = p.id
                LEFT JOIN availability.available_dates ad ON rt.id = ad.room_type_id
                WHERE p.is_active = true AND rt.is_active = true
            `;
        } else {
            // group_by date
            query = `
                SELECT 
                    ad.date,
                    COUNT(DISTINCT p.id) as properties_available,
                    COUNT(DISTINCT rt.id) as room_types_available,
                    COUNT(*) as total_availability_records
                FROM availability.available_dates ad
                JOIN availability.room_types rt ON ad.room_type_id = rt.id
                JOIN availability.properties p ON rt.property_id = p.id
                WHERE p.is_active = true AND rt.is_active = true
            `;
        }

        // Add date filters if provided
        let paramIndex = 1;
        if (start_date) {
            query += ` AND ad.date >= $${paramIndex}`;
            params.push(start_date);
            paramIndex++;
        }

        if (end_date) {
            query += ` AND ad.date <= $${paramIndex}`;
            params.push(end_date);
            paramIndex++;
        }

        // Add GROUP BY clause
        if (group_by === 'property') {
            query += ` GROUP BY p.id, p.name ORDER BY p.name`;
        } else if (group_by === 'room_type') {
            query += ` GROUP BY p.id, p.name, rt.id, rt.name, rt.capacity, rt.room_category ORDER BY p.name, rt.name`;
        } else {
            query += ` GROUP BY ad.date ORDER BY ad.date`;
        }

        const result = await database.query(query, params);

        res.json({
            summary: result.rows,
            group_by,
            date_range: {
                start_date,
                end_date
            },
            total_records: result.rows.length
        });

    } catch (error) {
        res.status(500).json({
            error: 'Failed to get availability summary',
            message: error.message
        });
    }
});

module.exports = router;