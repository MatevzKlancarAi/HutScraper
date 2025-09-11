const express = require('express');
const scheduler = require('../jobs/scheduler');
const database = require('../../services/database');
const router = express.Router();

// Middleware for API key authentication (optional)
const requireAuth = (req, res, next) => {
    const apiKey = process.env.API_KEY;
    
    if (apiKey) {
        const providedKey = req.headers['x-api-key'] || req.query.api_key;
        
        if (!providedKey || providedKey !== apiKey) {
            return res.status(401).json({
                error: 'Authentication required',
                message: 'Valid API key required'
            });
        }
    }
    
    next();
};

// GET /api/v1/scraping/status - Get scraping status
router.get('/status', async (req, res) => {
    try {
        const detailed = req.query.detailed === 'true';
        
        if (detailed) {
            const status = await scheduler.getDetailedStatus();
            res.json(status);
        } else {
            const status = scheduler.getJobStatus();
            res.json(status);
        }
    } catch (error) {
        res.status(500).json({
            error: 'Failed to get scraping status',
            message: error.message
        });
    }
});

// POST /api/v1/scraping/trigger - Manually trigger scraping
router.post('/trigger', requireAuth, async (req, res) => {
    try {
        const {
            testMode = false,
            targetHuts = null,
            maxConcurrency = null,
            delayBetweenHuts = null,
            delayBetweenRooms = null,
            maxRetries = null
        } = req.body;

        // Validate targetHuts if provided
        if (targetHuts && !Array.isArray(targetHuts)) {
            return res.status(400).json({
                error: 'Invalid targetHuts parameter',
                message: 'targetHuts must be an array of hut names'
            });
        }

        const options = {
            testMode,
            targetHuts,
            ...(maxConcurrency && { maxConcurrency: parseInt(maxConcurrency) }),
            ...(delayBetweenHuts && { delayBetweenHuts: parseInt(delayBetweenHuts) }),
            ...(delayBetweenRooms && { delayBetweenRooms: parseInt(delayBetweenRooms) }),
            ...(maxRetries && { maxRetries: parseInt(maxRetries) })
        };

        // Start the scraping job (async)
        const result = await scheduler.triggerManualScrape(options);

        if (result.success) {
            res.json({
                message: 'Scraping job completed successfully',
                result: result.result,
                triggeredAt: new Date().toISOString()
            });
        } else if (result.skipped) {
            res.status(409).json({
                message: 'Scraping job already running',
                skipped: true,
                triggeredAt: new Date().toISOString()
            });
        } else {
            res.status(500).json({
                message: 'Scraping job failed',
                error: result.error || 'Unknown error',
                result: result.result,
                triggeredAt: new Date().toISOString()
            });
        }

    } catch (error) {
        res.status(500).json({
            error: 'Failed to trigger scraping',
            message: error.message
        });
    }
});

// GET /api/v1/scraping/history - Get scraping history/stats
router.get('/history', async (req, res) => {
    try {
        const { 
            property = null, 
            limit = 50, 
            offset = 0 
        } = req.query;

        // Get scraping statistics
        const stats = await database.getScrapingStats(property);
        
        // Get list of all properties for reference
        const propertiesResult = await database.query(`
            SELECT id, name, slug, is_active, created_at
            FROM availability.properties 
            WHERE is_active = true
            ORDER BY name
        `);

        res.json({
            statistics: stats,
            properties: propertiesResult.rows,
            pagination: {
                limit: parseInt(limit),
                offset: parseInt(offset),
                total: stats.length
            }
        });

    } catch (error) {
        res.status(500).json({
            error: 'Failed to get scraping history',
            message: error.message
        });
    }
});

// GET /api/v1/scraping/properties - Get list of all properties and room types
router.get('/properties', async (req, res) => {
    try {
        // Get all properties with their room types
        const query = `
            SELECT 
                p.id,
                p.name,
                p.slug,
                p.location,
                p.booking_system,
                p.is_active,
                p.created_at,
                JSON_AGG(
                    JSON_BUILD_OBJECT(
                        'id', rt.id,
                        'name', rt.name,
                        'external_id', rt.external_id,
                        'capacity', rt.capacity,
                        'quantity', rt.quantity,
                        'bed_type', rt.bed_type,
                        'room_category', rt.room_category,
                        'features', rt.features,
                        'is_active', rt.is_active
                    )
                    ORDER BY rt.name
                ) as room_types
            FROM availability.properties p
            LEFT JOIN availability.room_types rt ON p.id = rt.property_id AND rt.is_active = true
            WHERE p.is_active = true
            GROUP BY p.id, p.name, p.slug, p.location, p.booking_system, p.is_active, p.created_at
            ORDER BY p.name
        `;

        const result = await database.query(query);
        
        res.json({
            properties: result.rows,
            total: result.rows.length
        });

    } catch (error) {
        res.status(500).json({
            error: 'Failed to get properties',
            message: error.message
        });
    }
});

// POST /api/v1/scraping/schedule - Update scheduling configuration (if needed)
router.post('/schedule', requireAuth, async (req, res) => {
    try {
        const { 
            morningSchedule = null,
            eveningSchedule = null,
            enabled = null
        } = req.body;

        // This would require implementing schedule updates in the scheduler
        // For now, return current configuration
        const currentSchedule = {
            morning: process.env.SCRAPE_CRON_MORNING || '0 6 * * *',
            evening: process.env.SCRAPE_CRON_EVENING || '0 18 * * *',
            enabled: process.env.ENABLE_SCHEDULED_SCRAPING === 'true'
        };

        res.json({
            message: 'Schedule configuration (current implementation is read-only)',
            current: currentSchedule,
            note: 'To modify schedule, update environment variables and restart service'
        });

    } catch (error) {
        res.status(500).json({
            error: 'Failed to update schedule',
            message: error.message
        });
    }
});

// GET /api/v1/scraping/logs - Get recent scraping logs (if needed)
router.get('/logs', requireAuth, async (req, res) => {
    try {
        const { 
            level = 'info',
            limit = 100,
            since = null
        } = req.query;

        // This would require log aggregation - for now return basic info
        res.json({
            message: 'Log endpoint not fully implemented',
            suggestion: 'Check server logs or use /status endpoint for current information',
            parameters: { level, limit, since }
        });

    } catch (error) {
        res.status(500).json({
            error: 'Failed to get logs',
            message: error.message
        });
    }
});

module.exports = router;