const express = require('express');
const database = require('../../services/database');
const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const startTime = Date.now();
        
        // Check database connectivity
        let dbStatus = 'disconnected';
        let dbLatency = null;
        let dbError = null;
        
        try {
            const dbStart = Date.now();
            await database.query('SELECT NOW()');
            dbLatency = Date.now() - dbStart;
            dbStatus = 'connected';
        } catch (error) {
            dbError = error.message;
        }

        // Get system information
        const memoryUsage = process.memoryUsage();
        const uptime = process.uptime();

        // Calculate response time
        const responseTime = Date.now() - startTime;

        const healthData = {
            status: dbStatus === 'connected' ? 'healthy' : 'unhealthy',
            timestamp: new Date().toISOString(),
            uptime: {
                seconds: Math.floor(uptime),
                human: formatUptime(uptime)
            },
            database: {
                status: dbStatus,
                latency: dbLatency ? `${dbLatency}ms` : null,
                error: dbError,
                connectionPool: database.getHealthStatus()
            },
            memory: {
                rss: formatBytes(memoryUsage.rss),
                heapUsed: formatBytes(memoryUsage.heapUsed),
                heapTotal: formatBytes(memoryUsage.heapTotal),
                external: formatBytes(memoryUsage.external)
            },
            environment: {
                nodeVersion: process.version,
                platform: process.platform,
                arch: process.arch,
                env: process.env.NODE_ENV || 'development'
            },
            responseTime: `${responseTime}ms`
        };

        // Set appropriate HTTP status
        const httpStatus = healthData.status === 'healthy' ? 200 : 503;
        
        res.status(httpStatus).json(healthData);

    } catch (error) {
        res.status(500).json({
            status: 'error',
            timestamp: new Date().toISOString(),
            error: 'Health check failed',
            message: error.message
        });
    }
});

router.get('/ready', async (req, res) => {
    try {
        // Readiness probe - check if service is ready to accept traffic
        await database.query('SELECT 1');
        
        res.status(200).json({
            status: 'ready',
            timestamp: new Date().toISOString(),
            message: 'Service is ready to accept requests'
        });
    } catch (error) {
        res.status(503).json({
            status: 'not_ready',
            timestamp: new Date().toISOString(),
            error: 'Service not ready',
            message: error.message
        });
    }
});

router.get('/live', (req, res) => {
    // Liveness probe - check if service is alive
    res.status(200).json({
        status: 'alive',
        timestamp: new Date().toISOString(),
        message: 'Service is alive',
        pid: process.pid
    });
});

router.get('/metrics', async (req, res) => {
    try {
        // Get basic scraping statistics
        const stats = await database.getScrapingStats();
        
        // Get last scraping runs for all properties
        const properties = await database.query(`
            SELECT DISTINCT p.id, p.name 
            FROM availability.properties p 
            WHERE p.is_active = true
        `);
        
        const lastScrapingRuns = {};
        for (const property of properties.rows) {
            const lastRun = await database.getLastScrapingRun(property.id);
            lastScrapingRuns[property.name] = lastRun;
        }

        res.json({
            timestamp: new Date().toISOString(),
            scraping: {
                totalProperties: properties.rows.length,
                statistics: stats,
                lastRuns: lastScrapingRuns
            },
            database: database.getHealthStatus(),
            system: {
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                cpu: process.cpuUsage()
            }
        });

    } catch (error) {
        res.status(500).json({
            error: 'Failed to get metrics',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatUptime(uptimeSeconds) {
    const days = Math.floor(uptimeSeconds / 86400);
    const hours = Math.floor((uptimeSeconds % 86400) / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = Math.floor(uptimeSeconds % 60);
    
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0) parts.push(`${seconds}s`);
    
    return parts.join(' ') || '0s';
}

module.exports = router;