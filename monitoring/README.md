# Monitoring and Observability

This directory contains the monitoring and observability configuration for the Ticket Resell Platform.

## Components

### 1. Application Monitoring
- **Structured Logging**: Winston-based logging with correlation IDs
- **Metrics Collection**: Prometheus metrics for performance and business metrics
- **Health Checks**: Comprehensive health check endpoints for all services
- **Alerting**: Automated alerting based on thresholds and conditions

### 2. Infrastructure Monitoring
- **Prometheus**: Metrics collection and storage
- **Grafana**: Visualization and dashboards
- **Alertmanager**: Alert routing and notification management
- **Loki**: Log aggregation and analysis
- **Promtail**: Log shipping agent

### 3. Exporters
- **Node Exporter**: System metrics (CPU, memory, disk, network)
- **Postgres Exporter**: Database metrics
- **Redis Exporter**: Cache metrics
- **Elasticsearch Exporter**: Search engine metrics

## Quick Start

### 1. Start the Monitoring Stack

```bash
# Start all monitoring services
cd monitoring
docker-compose -f docker-compose.monitoring.yml up -d

# Check service status
docker-compose -f docker-compose.monitoring.yml ps
```

### 2. Access Dashboards

- **Grafana**: http://localhost:3001 (admin/admin123)
- **Prometheus**: http://localhost:9090
- **Alertmanager**: http://localhost:9093

### 3. Configure Alerts

1. Update `alertmanager.yml` with your notification channels
2. Modify alert thresholds in `alert_rules.yml`
3. Restart Alertmanager: `docker-compose restart alertmanager`

## Application Health Endpoints

The application exposes several health check endpoints:

- `GET /health` - Overall system health
- `GET /health/live` - Liveness probe (Kubernetes)
- `GET /health/ready` - Readiness probe (Kubernetes)
- `GET /health/database` - Database connectivity
- `GET /health/redis` - Redis connectivity
- `GET /health/elasticsearch` - Elasticsearch connectivity
- `GET /metrics` - Prometheus metrics
- `GET /health/info` - System information

## Metrics

### HTTP Metrics
- `ticket_platform_http_requests_total` - Total HTTP requests
- `ticket_platform_http_request_duration_seconds` - Request duration histogram

### Database Metrics
- `ticket_platform_database_connections_active` - Active database connections
- `ticket_platform_database_query_duration_seconds` - Query duration histogram
- `ticket_platform_database_queries_total` - Total database queries

### Business Metrics
- `ticket_platform_listings_total` - Total ticket listings
- `ticket_platform_transactions_total` - Total transactions
- `ticket_platform_user_registrations_total` - Total user registrations
- `ticket_platform_fraud_detection_events_total` - Fraud detection events

### Cache Metrics
- `ticket_platform_cache_hits_total` - Cache hits
- `ticket_platform_cache_misses_total` - Cache misses

## Logging

### Log Levels
- `error` - Error conditions
- `warn` - Warning conditions
- `info` - Informational messages
- `http` - HTTP request logs
- `debug` - Debug information

### Log Format
All logs are structured JSON with the following fields:
```json
{
  "timestamp": "2024-01-01T12:00:00.000Z",
  "level": "info",
  "message": "Request completed",
  "service": "ticket-resell-platform",
  "environment": "production",
  "correlationId": "uuid-v4",
  "userId": "user-id",
  "method": "GET",
  "url": "/api/listings",
  "statusCode": 200,
  "responseTime": 150
}
```

### Log Destinations
- **Console**: Development environment
- **Files**: `logs/combined.log` and `logs/error.log`
- **Elasticsearch**: Production environment (if configured)
- **Loki**: Log aggregation (via Promtail)

## Alerting Rules

### Critical Alerts
- High error rate (>5%)
- Database connection pool exhausted
- Service down
- High payment failure rate (>15%)
- Low disk space (<20%)

### Warning Alerts
- High response time (>2s)
- High memory usage (>1GB)
- Slow database queries (>1s)
- High fraud detection rate
- Low cache hit rate (<70%)

## Alert Channels

Configure the following environment variables for alert notifications:

```bash
# Email notifications
DEVOPS_EMAIL=devops@ticketplatform.com
DEV_EMAIL=dev@ticketplatform.com
OPS_EMAIL=ops@ticketplatform.com

# SMS notifications (for critical alerts)
DEVOPS_PHONE=+1234567890
OPS_PHONE=+1234567890

# Slack integration
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK

# PagerDuty integration (for critical alerts)
PAGERDUTY_INTEGRATION_KEY=your_pagerduty_integration_key
```

## Grafana Dashboards

The included dashboard provides visualization for:

1. **HTTP Request Rate** - Requests per second by method and route
2. **HTTP Response Time** - 95th and 50th percentile response times
3. **Error Rate** - Percentage of 5xx errors
4. **Database Performance** - Query duration percentiles
5. **Memory Usage** - RSS and heap memory usage
6. **Business Metrics** - New listings, transactions, and user registrations
7. **Fraud Detection** - Fraud events rate by type
8. **Cache Performance** - Cache hit rate percentage

## Troubleshooting

### Common Issues

1. **Metrics not appearing in Prometheus**
   - Check if the application is running on the correct port
   - Verify the `/metrics` endpoint is accessible
   - Check Prometheus configuration and targets

2. **Alerts not firing**
   - Verify alert rules syntax in `alert_rules.yml`
   - Check Alertmanager configuration
   - Ensure notification channels are properly configured

3. **Logs not appearing in Loki**
   - Check Promtail configuration and file paths
   - Verify log file permissions
   - Check Loki connectivity from Promtail

4. **High memory usage alerts**
   - Monitor application memory leaks
   - Check for inefficient database queries
   - Review caching strategies

### Performance Tuning

1. **Reduce log volume**
   - Adjust log levels in production
   - Implement log sampling for high-volume endpoints
   - Use structured logging efficiently

2. **Optimize metrics collection**
   - Reduce scrape intervals for non-critical metrics
   - Use histogram buckets appropriate for your use case
   - Implement metric sampling for high-cardinality labels

3. **Database monitoring**
   - Monitor slow query logs
   - Track connection pool utilization
   - Set up query performance alerts

## Security Considerations

1. **Secure monitoring endpoints**
   - Use authentication for Grafana and Prometheus
   - Restrict access to monitoring ports
   - Use HTTPS in production

2. **Log security**
   - Avoid logging sensitive information (passwords, tokens)
   - Implement log retention policies
   - Secure log storage and transmission

3. **Alert security**
   - Use secure channels for alert notifications
   - Implement alert acknowledgment workflows
   - Monitor for alert fatigue and false positives