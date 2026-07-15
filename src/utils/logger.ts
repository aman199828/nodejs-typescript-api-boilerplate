import winston from 'winston';

/**
 * Structured logger for the application
 * Provides consistent logging with context and levels
 */
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'create-hq-api',
  },
  transports: [
    // Write all logs to console
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
          return `${timestamp} [${level}]: ${message} ${metaStr}`;
        })
      ),
    }),
  ],
});

// Add file transports in production
if (process.env.NODE_ENV === 'production') {
  logger.add(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: winston.format.json(),
    })
  );
  logger.add(
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: winston.format.json(),
    })
  );
}

/**
 * Logger interface with context support
 */
export interface LoggerContext {
  userId?: string | number;
  fileKey?: string;
  fileSize?: number;
  operation?: string;
  duration?: number;
  error?: Error;
  [key: string]: any;
}

/**
 * Enhanced logger with context support
 */
export const createLogger = (context?: LoggerContext) => {
  return {
    info: (message: string, meta?: LoggerContext) => {
      logger.info(message, { ...context, ...meta });
    },
    error: (message: string, meta?: LoggerContext) => {
      logger.error(message, { ...context, ...meta });
    },
    warn: (message: string, meta?: LoggerContext) => {
      logger.warn(message, { ...context, ...meta });
    },
    debug: (message: string, meta?: LoggerContext) => {
      logger.debug(message, { ...context, ...meta });
    },
  };
};

export default logger;
