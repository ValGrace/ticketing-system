import winston from 'winston';
import { ElasticsearchTransport } from 'winston-elasticsearch';

// Define log levels
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define colors for each log level
const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

winston.addColors(logColors);

// Create custom format for structured logging
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf((info) => {
    const { timestamp, level, message, ...meta } = info;
    return JSON.stringify({
      timestamp,
      level,
      message,
      service: 'ticket-resell-platform',
      environment: process.env['NODE_ENV'] || 'development',
      ...meta,
    });
  })
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.printf((info) => {
    const { timestamp, level, message, ...meta } = info;
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
    return `${timestamp} [${level}]: ${message} ${metaStr}`;
  })
);

// Create transports array
const transports: winston.transport[] = [
  // Console transport for development
  new winston.transports.Console({
    format: process.env['NODE_ENV'] === 'production' ? logFormat : consoleFormat,
  }),
  
  // File transport for errors
  new winston.transports.File({
    filename: 'logs/error.log',
    level: 'error',
    format: logFormat,
  }),
  
  // File transport for all logs
  new winston.transports.File({
    filename: 'logs/combined.log',
    format: logFormat,
  }),
];

// Add Elasticsearch transport for production
if (process.env['NODE_ENV'] === 'production' && process.env['ELASTICSEARCH_URL']) {
  const clientOpts: any = {
    node: process.env['ELASTICSEARCH_URL'],
  };

  if (process.env['ELASTICSEARCH_AUTH']) {
    clientOpts.auth = {
      username: process.env['ELASTICSEARCH_USERNAME'] || '',
      password: process.env['ELASTICSEARCH_PASSWORD'] || '',
    };
  }

  transports.push(
    new ElasticsearchTransport({
      level: 'info',
      clientOpts,
      index: 'ticket-platform-logs',
      indexTemplate: {
        name: 'ticket-platform-logs-template',
        pattern: 'ticket-platform-logs-*',
        settings: {
          number_of_shards: 1,
          number_of_replicas: 0,
        },
        mappings: {
          properties: {
            '@timestamp': { type: 'date' },
            level: { type: 'keyword' },
            message: { type: 'text' },
            service: { type: 'keyword' },
            environment: { type: 'keyword' },
            userId: { type: 'keyword' },
            requestId: { type: 'keyword' },
            method: { type: 'keyword' },
            url: { type: 'keyword' },
            statusCode: { type: 'integer' },
            responseTime: { type: 'integer' },
            userAgent: { type: 'text' },
            ip: { type: 'ip' },
          },
        },
      },
    })
  );
}

// Create logger instance
const logger = winston.createLogger({
  level: process.env['LOG_LEVEL'] || 'info',
  levels: logLevels,
  format: logFormat,
  transports,
  exitOnError: false,
});

// Create child logger with correlation ID
export const createChildLogger = (correlationId: string, userId?: string) => {
  return logger.child({
    correlationId,
    userId,
  });
};

// Export default logger
export default logger;

// Helper functions for structured logging
export const logError = (message: string, error: Error, meta?: any) => {
  logger.error(message, {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
    ...meta,
  });
};

export const logRequest = (req: any, res: any, responseTime: number) => {
  logger.http('HTTP Request', {
    method: req.method,
    url: req.originalUrl,
    statusCode: res.statusCode,
    responseTime,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    userId: req.user?.id,
    correlationId: req.correlationId,
  });
};

export const logTransaction = (transactionId: string, action: string, meta?: any) => {
  logger.info('Transaction Event', {
    transactionId,
    action,
    ...meta,
  });
};

export const logSecurityEvent = (event: string, userId?: string, meta?: any) => {
  logger.warn('Security Event', {
    event,
    userId,
    timestamp: new Date().toISOString(),
    ...meta,
  });
};