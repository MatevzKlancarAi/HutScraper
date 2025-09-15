const express = require('express');
const MicrogrammBookingBot = require('../../MicrogrammBookingBot');
const logger = require('../../services/logger');

const router = express.Router();

// Store active booking sessions
const activeSessions = new Map();

/**
 * Validate booking request parameters
 */
function validateBookingRequest(req, res, next) {
    const { hutName, roomType, arrivalDate, departureDate, guestName, country, email, phone } = req.body;

    const errors = [];

    if (!hutName || typeof hutName !== 'string') {
        errors.push('hutName is required and must be a string');
    }

    if (!roomType || typeof roomType !== 'string') {
        errors.push('roomType is required and must be a string');
    }

    if (!arrivalDate || typeof arrivalDate !== 'string') {
        errors.push('arrivalDate is required and must be a string (YYYY-MM-DD or DD.MM.YYYY)');
    }

    if (!departureDate || typeof departureDate !== 'string') {
        errors.push('departureDate is required and must be a string (YYYY-MM-DD or DD.MM.YYYY)');
    }

    if (!guestName || typeof guestName !== 'string') {
        errors.push('guestName is required and must be a string');
    }

    if (!country || typeof country !== 'string') {
        errors.push('country is required and must be a string');
    }

    if (!email || typeof email !== 'string' || !email.includes('@')) {
        errors.push('email is required and must be a valid email address');
    }

    if (!phone || typeof phone !== 'string') {
        errors.push('phone is required and must be a string');
    }

    if (errors.length > 0) {
        return res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: errors
        });
    }

    next();
}

/**
 * POST /api/v1/booking/create
 * Create a new booking (fills form and solves captcha but doesn't submit)
 */
router.post('/create', validateBookingRequest, async (req, res) => {
    const bookingBot = new MicrogrammBookingBot();

    try {
        logger.info('Starting new booking request', {
            body: { ...req.body, phone: '***' } // Hide phone in logs
        });

        const result = await bookingBot.makeBooking(req.body);

        // Store the session for potential submission
        activeSessions.set(result.sessionId, {
            bot: bookingBot,
            bookingParams: req.body,
            createdAt: new Date(),
            status: result.status
        });

        // Clean up old sessions (older than 1 hour)
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        for (const [sessionId, session] of activeSessions) {
            if (session.createdAt < oneHourAgo) {
                try {
                    await session.bot.cleanup();
                } catch (e) {
                    logger.warn(`Failed to cleanup old session ${sessionId}:`, e.message);
                }
                activeSessions.delete(sessionId);
            }
        }

        res.json({
            success: true,
            data: result,
            message: 'Booking form filled successfully. Use /submit endpoint to complete the booking.'
        });

    } catch (error) {
        logger.error('Booking creation failed:', error);

        // Clean up the bot
        try {
            await bookingBot.cleanup();
        } catch (cleanupError) {
            logger.warn('Failed to cleanup booking bot:', cleanupError);
        }

        res.status(500).json({
            success: false,
            error: 'Booking creation failed',
            message: error.message,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

/**
 * POST /api/v1/booking/submit/:sessionId
 * Submit a prepared booking (actually clicks the submit button)
 */
router.post('/submit/:sessionId', async (req, res) => {
    const { sessionId } = req.params;

    try {
        logger.info(`Attempting to submit booking for session: ${sessionId}`);

        const session = activeSessions.get(sessionId);
        if (!session) {
            return res.status(404).json({
                success: false,
                error: 'Session not found',
                message: 'Invalid session ID or session has expired'
            });
        }

        if (session.status !== 'ready_to_submit') {
            return res.status(400).json({
                success: false,
                error: 'Session not ready',
                message: `Session status is ${session.status}, expected 'ready_to_submit'`
            });
        }

        // Submit the booking
        const result = await session.bot.submitBooking();

        // Update session status
        session.status = result.success ? 'submitted' : 'failed';

        // Clean up the bot
        setTimeout(async () => {
            try {
                await session.bot.cleanup();
                activeSessions.delete(sessionId);
            } catch (e) {
                logger.warn(`Failed to cleanup session ${sessionId}:`, e.message);
            }
        }, 5000); // Give some time for any follow-up requests

        res.json({
            success: result.success,
            data: {
                sessionId,
                submitted: result.success,
                message: result.message,
                bookingParams: session.bookingParams
            },
            message: result.success ? 'Booking submitted successfully!' : 'Booking submission failed'
        });

    } catch (error) {
        logger.error(`Booking submission failed for session ${sessionId}:`, error);

        res.status(500).json({
            success: false,
            error: 'Booking submission failed',
            message: error.message,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

/**
 * GET /api/v1/booking/status/:sessionId
 * Get booking session status
 */
router.get('/status/:sessionId', async (req, res) => {
    const { sessionId } = req.params;

    try {
        const session = activeSessions.get(sessionId);
        if (!session) {
            return res.status(404).json({
                success: false,
                error: 'Session not found',
                message: 'Invalid session ID or session has expired'
            });
        }

        const bookingData = session.bot.getBookingData();

        res.json({
            success: true,
            data: {
                sessionId,
                status: session.status,
                createdAt: session.createdAt,
                bookingParams: session.bookingParams,
                steps: bookingData.steps,
                errors: bookingData.errors,
                lastActivity: bookingData.steps.length > 0
                    ? bookingData.steps[bookingData.steps.length - 1].timestamp
                    : session.createdAt
            }
        });

    } catch (error) {
        logger.error(`Failed to get booking status for session ${sessionId}:`, error);

        res.status(500).json({
            success: false,
            error: 'Failed to get booking status',
            message: error.message
        });
    }
});

/**
 * GET /api/v1/booking/sessions
 * List all active booking sessions
 */
router.get('/sessions', async (req, res) => {
    try {
        const sessions = Array.from(activeSessions.entries()).map(([sessionId, session]) => ({
            sessionId,
            status: session.status,
            createdAt: session.createdAt,
            hutName: session.bookingParams.hutName,
            roomType: session.bookingParams.roomType,
            guestName: session.bookingParams.guestName
        }));

        res.json({
            success: true,
            data: {
                totalSessions: sessions.length,
                sessions
            }
        });

    } catch (error) {
        logger.error('Failed to list booking sessions:', error);

        res.status(500).json({
            success: false,
            error: 'Failed to list booking sessions',
            message: error.message
        });
    }
});

/**
 * DELETE /api/v1/booking/session/:sessionId
 * Cancel and cleanup a booking session
 */
router.delete('/session/:sessionId', async (req, res) => {
    const { sessionId } = req.params;

    try {
        const session = activeSessions.get(sessionId);
        if (!session) {
            return res.status(404).json({
                success: false,
                error: 'Session not found',
                message: 'Invalid session ID or session has expired'
            });
        }

        // Clean up the bot
        try {
            await session.bot.cleanup();
        } catch (cleanupError) {
            logger.warn(`Failed to cleanup bot for session ${sessionId}:`, cleanupError.message);
        }

        // Remove from active sessions
        activeSessions.delete(sessionId);

        logger.info(`Booking session ${sessionId} cancelled and cleaned up`);

        res.json({
            success: true,
            message: 'Booking session cancelled successfully'
        });

    } catch (error) {
        logger.error(`Failed to cancel booking session ${sessionId}:`, error);

        res.status(500).json({
            success: false,
            error: 'Failed to cancel booking session',
            message: error.message
        });
    }
});

/**
 * POST /api/v1/booking/test-captcha
 * Test captcha solving (development only)
 */
router.post('/test-captcha', async (req, res) => {
    if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({
            success: false,
            error: 'Not available in production'
        });
    }

    const bookingBot = new MicrogrammBookingBot();

    try {
        logger.info('Testing captcha solving capability');

        await bookingBot.initialize();

        // Navigate to the login page to test captcha
        await bookingBot.page.goto(bookingBot.config.target.loginUrl);
        await bookingBot.page.waitForTimeout(2000);

        // Try to solve any captcha that might be present
        const captchaResult = await bookingBot.captchaSolver.solve();

        await bookingBot.takeScreenshot('captcha-test');

        res.json({
            success: true,
            data: {
                captchaSolved: captchaResult !== null,
                answer: captchaResult,
                message: captchaResult !== null
                    ? `Captcha solved with answer: ${captchaResult}`
                    : 'No captcha found or failed to solve'
            }
        });

    } catch (error) {
        logger.error('Captcha test failed:', error);

        res.status(500).json({
            success: false,
            error: 'Captcha test failed',
            message: error.message
        });
    } finally {
        try {
            await bookingBot.cleanup();
        } catch (cleanupError) {
            logger.warn('Failed to cleanup captcha test bot:', cleanupError);
        }
    }
});

// Clean up old sessions periodically
setInterval(() => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    let cleanedCount = 0;

    for (const [sessionId, session] of activeSessions) {
        if (session.createdAt < oneHourAgo) {
            session.bot.cleanup().catch(e =>
                logger.warn(`Failed to cleanup expired session ${sessionId}:`, e.message)
            );
            activeSessions.delete(sessionId);
            cleanedCount++;
        }
    }

    if (cleanedCount > 0) {
        logger.info(`Cleaned up ${cleanedCount} expired booking sessions`);
    }
}, 15 * 60 * 1000); // Check every 15 minutes

module.exports = router;