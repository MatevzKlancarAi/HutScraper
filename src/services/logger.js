const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
require('dotenv').config();

const logDir = 'logs';
const logLevel = process.env.LOG_LEVEL || 'info';

const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
        let logMessage = `${timestamp} [${level.toUpperCase()}]: ${message}`;
        
        if (Object.keys(meta).length > 0) {
            logMessage += ' ' + JSON.stringify(meta);
        }
        
        if (stack) {
            logMessage += '\n' + stack;
        }
        
        return logMessage;
    })
);

const dailyRotateFileTransport = new DailyRotateFile({
    filename: path.join(logDir, 'scraper-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '14d',
    format: logFormat
});

const errorRotateFileTransport = new DailyRotateFile({
    filename: path.join(logDir, 'error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    level: 'error',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '30d',
    format: logFormat
});

const consoleTransport = new winston.transports.Console({
    format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: 'HH:mm:ss' }),
        winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
            let logMessage = `${timestamp} ${level}: ${message}`;
            
            if (Object.keys(meta).length > 0) {
                logMessage += ' ' + JSON.stringify(meta, null, 2);
            }
            
            if (stack) {
                logMessage += '\n' + stack;
            }
            
            return logMessage;
        })
    )
});

const logger = winston.createLogger({
    level: logLevel,
    transports: [
        dailyRotateFileTransport,
        errorRotateFileTransport
    ]
});

if (process.env.NODE_ENV !== 'production') {
    logger.add(consoleTransport);
}

class Logger {
    constructor() {
        this.logger = logger;
        this.correlationId = null;
    }

    setCorrelationId(id) {
        this.correlationId = id;
    }

    getCorrelationId() {
        return this.correlationId;
    }

    _formatMessage(message, meta = {}) {
        const correlationMeta = this.correlationId ? { correlationId: this.correlationId } : {};
        return { message, ...correlationMeta, ...meta };
    }

    info(message, meta = {}) {
        this.logger.info(this._formatMessage(message, meta));
    }

    warn(message, meta = {}) {
        this.logger.warn(this._formatMessage(message, meta));
    }

    error(message, meta = {}) {
        this.logger.error(this._formatMessage(message, meta));
    }

    debug(message, meta = {}) {
        this.logger.debug(this._formatMessage(message, meta));
    }

    startScrapingSession(hutName, roomTypes) {
        const sessionId = `scrape_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.setCorrelationId(sessionId);
        
        this.info('Starting scraping session', {
            hutName,
            roomTypes: roomTypes.length,
            sessionId
        });
        
        return sessionId;
    }

    endScrapingSession(sessionId, results) {
        this.info('Completed scraping session', {
            sessionId,
            totalRooms: results.totalRooms || 0,
            successfulRooms: results.successfulRooms || 0,
            failedRooms: results.failedRooms || 0,
            totalDatesScraped: results.totalDatesScraped || 0,
            duration: results.duration || 0
        });
        
        this.setCorrelationId(null);
    }

    logRoomScraping(roomName, status, details = {}) {
        const level = status === 'success' ? 'info' : 'error';
        this.logger[level](`Room scraping ${status}: ${roomName}`, details);
    }

    logDatabaseOperation(operation, details = {}) {
        this.info(`Database operation: ${operation}`, details);
    }

    logSchedulerEvent(event, details = {}) {
        this.info(`Scheduler: ${event}`, details);
    }
}

module.exports = new Logger();