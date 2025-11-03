import client from 'prom-client';

// Create a Registry to register the metrics
const register = new client.Registry();

// Add default metrics (CPU, memory, etc.)
client.collectDefaultMetrics({
  register,
  prefix: 'ticket_platform_',
});

// Custom metrics for the ticket platform

// HTTP request metrics
export const httpRequestDuration = new client.Histogram({
  name: 'ticket_platform_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10],
});

export const httpRequestTotal = new client.Counter({
  name: 'ticket_platform_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

// Database metrics
export const databaseConnectionsActive = new client.Gauge({
  name: 'ticket_platform_database_connections_active',
  help: 'Number of active database connections',
});

export const databaseQueryDuration = new client.Histogram({
  name: 'ticket_platform_database_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation', 'table'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 3, 5],
});

export const databaseQueryTotal = new client.Counter({
  name: 'ticket_platform_database_queries_total',
  help: 'Total number of database queries',
  labelNames: ['operation', 'table', 'status'],
});

// Business metrics
export const ticketListingsTotal = new client.Counter({
  name: 'ticket_platform_listings_total',
  help: 'Total number of ticket listings created',
  labelNames: ['category', 'status'],
});

export const transactionsTotal = new client.Counter({
  name: 'ticket_platform_transactions_total',
  help: 'Total number of transactions',
  labelNames: ['status', 'payment_method'],
});

export const transactionValue = new client.Histogram({
  name: 'ticket_platform_transaction_value_dollars',
  help: 'Value of transactions in dollars',
  labelNames: ['category'],
  buckets: [10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
});

export const userRegistrations = new client.Counter({
  name: 'ticket_platform_user_registrations_total',
  help: 'Total number of user registrations',
});

export const fraudDetectionEvents = new client.Counter({
  name: 'ticket_platform_fraud_detection_events_total',
  help: 'Total number of fraud detection events',
  labelNames: ['type', 'action'],
});

// Search metrics
export const searchQueries = new client.Counter({
  name: 'ticket_platform_search_queries_total',
  help: 'Total number of search queries',
  labelNames: ['type'],
});

export const searchDuration = new client.Histogram({
  name: 'ticket_platform_search_duration_seconds',
  help: 'Duration of search queries in seconds',
  buckets: [0.1, 0.3, 0.5, 1, 2, 5],
});

// Payment metrics
export const paymentProcessingDuration = new client.Histogram({
  name: 'ticket_platform_payment_processing_duration_seconds',
  help: 'Duration of payment processing in seconds',
  labelNames: ['provider', 'status'],
  buckets: [1, 3, 5, 10, 15, 30, 60],
});

export const paymentErrors = new client.Counter({
  name: 'ticket_platform_payment_errors_total',
  help: 'Total number of payment errors',
  labelNames: ['provider', 'error_type'],
});

// Cache metrics
export const cacheHits = new client.Counter({
  name: 'ticket_platform_cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['cache_type'],
});

export const cacheMisses = new client.Counter({
  name: 'ticket_platform_cache_misses_total',
  help: 'Total number of cache misses',
  labelNames: ['cache_type'],
});

// Email/SMS metrics
export const notificationsSent = new client.Counter({
  name: 'ticket_platform_notifications_sent_total',
  help: 'Total number of notifications sent',
  labelNames: ['type', 'status'],
});

// Register all metrics
register.registerMetric(httpRequestDuration);
register.registerMetric(httpRequestTotal);
register.registerMetric(databaseConnectionsActive);
register.registerMetric(databaseQueryDuration);
register.registerMetric(databaseQueryTotal);
register.registerMetric(ticketListingsTotal);
register.registerMetric(transactionsTotal);
register.registerMetric(transactionValue);
register.registerMetric(userRegistrations);
register.registerMetric(fraudDetectionEvents);
register.registerMetric(searchQueries);
register.registerMetric(searchDuration);
register.registerMetric(paymentProcessingDuration);
register.registerMetric(paymentErrors);
register.registerMetric(cacheHits);
register.registerMetric(cacheMisses);
register.registerMetric(notificationsSent);

export { register };

// Helper functions for common metric operations
export const recordHttpRequest = (method: string, route: string, statusCode: number, duration: number) => {
  httpRequestDuration.observe({ method, route, status_code: statusCode }, duration);
  httpRequestTotal.inc({ method, route, status_code: statusCode });
};

export const recordDatabaseQuery = (operation: string, table: string, duration: number, success: boolean) => {
  databaseQueryDuration.observe({ operation, table }, duration);
  databaseQueryTotal.inc({ operation, table, status: success ? 'success' : 'error' });
};

export const recordTransaction = (status: string, paymentMethod: string, value: number, category: string) => {
  transactionsTotal.inc({ status, payment_method: paymentMethod });
  transactionValue.observe({ category }, value);
};

export const recordFraudEvent = (type: string, action: string) => {
  fraudDetectionEvents.inc({ type, action });
};

export const recordSearch = (type: string, duration: number) => {
  searchQueries.inc({ type });
  searchDuration.observe(duration);
};

export const recordPaymentProcessing = (provider: string, status: string, duration: number) => {
  paymentProcessingDuration.observe({ provider, status }, duration);
};

export const recordPaymentError = (provider: string, errorType: string) => {
  paymentErrors.inc({ provider, error_type: errorType });
};

export const recordCacheOperation = (cacheType: string, hit: boolean) => {
  if (hit) {
    cacheHits.inc({ cache_type: cacheType });
  } else {
    cacheMisses.inc({ cache_type: cacheType });
  }
};

export const recordNotification = (type: string, status: string) => {
  notificationsSent.inc({ type, status });
};