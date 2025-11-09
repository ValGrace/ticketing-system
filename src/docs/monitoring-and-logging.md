# Monitoring and Logging Guide

## Overview

The ticket resell platform implements comprehensive monitoring and logging to ensure system reliability, performance tracking, and rapid issue detection. This document describes the monitoring infrastructure, available metrics, logging strategy, and alerting mechanisms.

## Architecture

### Components

1. **Application Performance Monitoring (APM)**
   - Prometheus metrics collection
   - Custom business metrics
   - HTTP request tracking
   - Database query monitoring

2. **Structured Logging**
   - Winston logger with multiple transports
   - Elasticsearch integration for log aggregation
   - Correlation ID tracking across requests
   - Contextual logging with metadata

3. **Health Checks**
   - Liveness and readiness probes
   - Service-specific health endpoints
   - External service monitoring
   - System resource tracking

4. **Alerting**
   - Rule-based alerting system
   - Multi-channel notifications (Email, SMS, Slack, PagerDuty)
   - Cooldown periods to prevent alert fatigue
   - Severity-based escalation

## Metrics

### HTTP Metrics

```
ticket_platform_http_request_duration_seconds - Histogram of HTTP request durations
ticket_platform_http_requests_total - Counter of total HTTP requests
```

Labels: `method`, `route`, `status_code`

### Database Metrics

```
ticket_platform_database_connections_active - Active database connections
ticket_platform_database_query_duration_seconds - Database query duration histogram
ticket_platform_database_queries_total - Total database queries counter
```

Labels: `operation`, `table`, `status`

### Business Metrics

```
ticket_platform_listings_total - Total ticket listings created
ticket_platform_transactions_total - Total transactions
ticket_platform_transaction_value_dollars - Transaction value histogram
ticket_platform_user_registrations_total - User registration counter
ticket_platform_fraud_detection_events_total - Fraud detection events
```

### Search Metrics

```
ticket_platform_search_queries_total - Total search queries
ticket_platform_search_duration_seconds - Search query duration
```

### Payment Metrics

```
ticket_platform_payment_processing_duration_seconds - Payment processing time
ticket_platform_payment_errors_total - Payment error counter
```

### Cache Metrics

```
ticket_platform_cache_hits_total - Cache hit counter
ticket_platform_cache_misses_total - Cache miss counter
```

### Notification Metrics

```
ticket_platform_notifications_sent_total - Notifications sent counter
```

## Health Check Endpoints

### Liveness Probe
```
GET /health/live
```

Returns 200 if the application is running. Used by orchestrators to determine if the container should be restarted.

Response:
```json
{
  "status": "alive",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 3600,
  "pid": 12345
}
```

### Readiness Probe
```
GET /health/ready
```

Returns 200 if the application is ready to serve traffic. Checks critical services (database, Redis).

Response:
```json
{
  "status": "ready",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "services": {
    "database": "healthy",
    "redis": "healthy"
  }
}
```

### System Health
```
GET /health
```

Comprehensive health check of all services.

Response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "services": [
    {
      "service": "database",
      "status": "healthy",
      "responseTime": 15,
      "details": {
        "totalConnections": 20,
        "idleConnections": 18,
        "waitingConnections": 0
      }
    }
  ],
  "uptime": 3600,
  "version": "1.0.0"
}
```

### Service-Specific Health Checks
```
GET /health/database
GET /health/redis
GET /health/elasticsearch
```

### Metrics Endpoint
```
GET /metrics
```

Prometheus-compatible metrics endpoint.

### System Information
```
GET /health/info
```

Returns application and system information.

## Logging

### Log Levels

- **error**: Error events that might still allow the application to continue running
- **warn**: Warning events that indicate potential issues
- **info**: Informational messages that highlight application progress
- **http**: HTTP request/response logging
- **debug**: Detailed information for debugging

### Log Format

All logs are structured in JSON format:

```json
{
  "timestamp": "2024-01-01 12:00:00:000",
  "level": "info",
  "message": "HTTP Request",
  "service": "ticket-resell-platform",
  "environment": "production",
  "correlationId": "uuid-v4",
  "userId": "user-123",
  "method": "GET",
  "url": "/api/listings",
  "statusCode": 200,
  "responseTime": 45
}
```

### Log Transports

1. **Console**: Development-friendly colored output
2. **File**: Persistent logs in `logs/` directory
   - `logs/error.log`: Error-level logs only
   - `logs/combined.log`: All logs
3. **Elasticsearch**: Production log aggregation (when configured)

### Correlation IDs

Every request is assigned a correlation ID that tracks the request through the entire system. This enables:
- Request tracing across services
- Log aggregation and filtering
- Debugging distributed transactions

The correlation ID is:
- Generated automatically if not provided
- Accepted via `X-Correlation-ID` header
- Included in all log entries
- Returned in response headers

### Contextual Logging

Use child loggers for request-specific context:

```typescript
req.logger.info('Processing payment', {
  transactionId: 'txn-123',
  amount: 100.00,
  currency: 'USD'
});
```

## Alerting

### Alert Rules

The system includes predefined alert rules for:

#### System Resources
- High memory usage (>85%)
- High CPU usage (>80%)
- Low disk space (<20%)

#### Application Performance
- High response time (>2 seconds)
- High error rate (>5%)

#### Database
- Connection pool exhausted (>90%)
- Slow queries (>1 second)

#### Business Logic
- High fraud detection rate (>10%)
- Payment failure rate (>15%)

#### External Services
- Elasticsearch unhealthy
- Redis unhealthy

### Alert Severity Levels

- **critical**: Immediate action required, may trigger on-call
- **high**: Urgent issue requiring attention
- **medium**: Issue that should be addressed soon
- **low**: Informational, no immediate action needed

### Alert Channels

Based on severity, alerts are sent via:
- **Email**: All severities
- **SMS**: Critical alerts only
- **Slack**: Critical and high severity
- **PagerDuty**: Critical alerts only

### Cooldown Periods

Each alert rule has a cooldown period to prevent alert fatigue:
- Critical alerts: 5-10 minutes
- High severity: 10-15 minutes
- Medium severity: 15-30 minutes

### Managing Alert Rules

```typescript
// Disable an alert rule
alertingService.disableRule('high_memory_usage');

// Update threshold
alertingService.updateRuleThreshold('high_cpu_usage', 90);

// Enable an alert rule
alertingService.enableRule('high_memory_usage');
```

## Monitoring Best Practices

### 1. Use Correlation IDs

Always include correlation IDs in logs and pass them to downstream services:

```typescript
const correlationId = req.correlationId;
req.logger.info('Processing request', { correlationId });
```

### 2. Monitor Database Queries

Wrap database operations with monitoring:

```typescript
import { monitorDatabaseQuery } from '../middleware/monitoring';

const users = await monitorDatabaseQuery(
  'SELECT',
  'users',
  () => userRepository.findAll(),
  req.logger
);
```

### 3. Record Business Metrics

Track important business events:

```typescript
import { recordTransaction, recordFraudEvent } from '../config/metrics';

recordTransaction('completed', 'stripe', 100.00, 'concert');
recordFraudEvent('suspicious_listing', 'flagged');
```

### 4. Log Security Events

Always log security-related events:

```typescript
import { logSecurityEvent } from '../config/logger';

logSecurityEvent('failed_login_attempt', userId, {
  ip: req.ip,
  userAgent: req.get('User-Agent')
});
```

### 5. Use Structured Logging

Include relevant context in logs:

```typescript
logger.info('Payment processed', {
  transactionId,
  userId,
  amount,
  currency,
  paymentMethod,
  duration: Date.now() - startTime
});
```

## Integration with External Tools

### Prometheus

Scrape metrics from `/metrics` endpoint:

```yaml
scrape_configs:
  - job_name: 'ticket-platform'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics'
    scrape_interval: 15s
```

### Grafana

Import the dashboard from `monitoring/grafana-dashboard.json` for pre-configured visualizations.

### Elasticsearch + Kibana

Logs are automatically sent to Elasticsearch when configured. Create index patterns in Kibana:
- Pattern: `ticket-platform-logs-*`
- Time field: `@timestamp`

### Loki + Promtail

Alternative to Elasticsearch for log aggregation. Configuration available in `monitoring/loki-config.yml` and `monitoring/promtail-config.yml`.

### Alertmanager

Configure Prometheus Alertmanager with rules from `monitoring/alert_rules.yml`.

## Environment Variables

```bash
# Logging
LOG_LEVEL=info
NODE_ENV=production

# Elasticsearch (optional)
ELASTICSEARCH_URL=http://localhost:9200
ELASTICSEARCH_USERNAME=elastic
ELASTICSEARCH_PASSWORD=changeme

# Alerting
DEVOPS_EMAIL=devops@ticketplatform.com
DEVOPS_PHONE=+1234567890
DEV_EMAIL=dev@ticketplatform.com
OPS_EMAIL=ops@ticketplatform.com
OPS_PHONE=+1234567890

# External integrations
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx
PAGERDUTY_INTEGRATION_KEY=your-key-here

# Payment gateway
STRIPE_SECRET_KEY=sk_test_xxx
```

## Troubleshooting

### High Memory Usage

1. Check `/health/info` for memory statistics
2. Review slow queries in logs
3. Check for memory leaks using heap snapshots
4. Scale horizontally if needed

### Slow Response Times

1. Check `/metrics` for request duration percentiles
2. Review database query performance
3. Check external service health
4. Enable query logging for slow queries

### Service Unavailable

1. Check `/health/ready` for service status
2. Review error logs for specific failures
3. Check external service connectivity
4. Verify database connection pool

### Missing Logs

1. Verify LOG_LEVEL environment variable
2. Check file permissions on logs directory
3. Verify Elasticsearch connectivity (if configured)
4. Check disk space

## Performance Considerations

### Log Volume

- Use appropriate log levels (avoid debug in production)
- Implement log sampling for high-volume endpoints
- Rotate log files regularly
- Archive old logs to cold storage

### Metrics Cardinality

- Avoid high-cardinality labels (e.g., user IDs)
- Use aggregated metrics where possible
- Set appropriate retention policies
- Monitor Prometheus memory usage

### Health Check Frequency

- Liveness: Every 10 seconds
- Readiness: Every 5 seconds
- Full health: On-demand or every 30 seconds
- External services: Every 60 seconds

## Monitoring Checklist

- [ ] Prometheus scraping configured
- [ ] Grafana dashboards imported
- [ ] Log aggregation configured (Elasticsearch or Loki)
- [ ] Alert rules configured in Alertmanager
- [ ] Notification channels configured (Email, SMS, Slack)
- [ ] Health check endpoints accessible
- [ ] Correlation IDs flowing through system
- [ ] Business metrics being recorded
- [ ] Security events being logged
- [ ] Log rotation configured
- [ ] Backup monitoring in place
- [ ] On-call rotation configured for critical alerts
