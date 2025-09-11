const errorHandler = (logger) => {
    return (error, req, res, next) => {
        // Log the error
        logger.error('Unhandled error:', {
            error: error.message,
            stack: error.stack,
            url: req.originalUrl,
            method: req.method,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            body: req.body,
            query: req.query,
            params: req.params
        });

        // Don't leak error details in production
        const isDevelopment = process.env.NODE_ENV === 'development';
        
        // Default error response
        let statusCode = 500;
        let message = 'Internal Server Error';
        let details = null;

        // Handle specific error types
        if (error.name === 'ValidationError') {
            statusCode = 400;
            message = 'Validation Error';
            details = error.message;
        } else if (error.name === 'CastError') {
            statusCode = 400;
            message = 'Invalid parameter format';
            details = isDevelopment ? error.message : 'Invalid parameter';
        } else if (error.code === '23505') { // PostgreSQL duplicate key error
            statusCode = 409;
            message = 'Duplicate entry';
            details = isDevelopment ? error.detail : 'Resource already exists';
        } else if (error.code === '23503') { // PostgreSQL foreign key constraint error
            statusCode = 400;
            message = 'Reference constraint violation';
            details = isDevelopment ? error.detail : 'Invalid reference';
        } else if (error.name === 'JsonWebTokenError') {
            statusCode = 401;
            message = 'Invalid token';
        } else if (error.name === 'TokenExpiredError') {
            statusCode = 401;
            message = 'Token expired';
        } else if (error.status) {
            // Error already has a status code (likely from express-validator or similar)
            statusCode = error.status;
            message = error.message || message;
        }

        // Build error response
        const errorResponse = {
            error: true,
            message,
            timestamp: new Date().toISOString(),
            path: req.originalUrl,
            method: req.method
        };

        // Add additional details in development
        if (isDevelopment) {
            errorResponse.details = details || error.message;
            errorResponse.stack = error.stack;
        } else if (details) {
            errorResponse.details = details;
        }

        // Add request ID if available
        if (req.id) {
            errorResponse.requestId = req.id;
        }

        // Send error response
        res.status(statusCode).json(errorResponse);
    };
};

module.exports = errorHandler;