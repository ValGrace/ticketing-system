import logger from './logger';
import { NotificationService } from '../services/NotificationService';

export interface Alert {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  service: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface AlertRule {
  id: string;
  name: string;
  condition: (value: number, threshold: number) => boolean;
  threshold: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  cooldownMinutes: number;
  enabled: boolean;
}

export class AlertingService {
  private notificationService: NotificationService;
  private alertHistory: Map<string, number> = new Map(); // Track last alert time
  private rules: AlertRule[] = [];

  constructor(notificationService: NotificationService) {
    this.notificationService = notificationService;
    this.initializeDefaultRules();
  }

  private initializeDefaultRules() {
    this.rules = [
      // System resource alerts
      {
        id: 'high_memory_usage',
        name: 'High Memory Usage',
        condition: (value, threshold) => value > threshold,
        threshold: 85, // 85%
        severity: 'high',
        cooldownMinutes: 15,
        enabled: true,
      },
      {
        id: 'high_cpu_usage',
        name: 'High CPU Usage',
        condition: (value, threshold) => value > threshold,
        threshold: 80, // 80%
        severity: 'high',
        cooldownMinutes: 10,
        enabled: true,
      },
      {
        id: 'low_disk_space',
        name: 'Low Disk Space',
        condition: (value, threshold) => value < threshold,
        threshold: 20, // 20% remaining
        severity: 'critical',
        cooldownMinutes: 30,
        enabled: true,
      },
      
      // Application performance alerts
      {
        id: 'high_response_time',
        name: 'High Response Time',
        condition: (value, threshold) => value > threshold,
        threshold: 2000, // 2 seconds
        severity: 'medium',
        cooldownMinutes: 5,
        enabled: true,
      },
      {
        id: 'high_error_rate',
        name: 'High Error Rate',
        condition: (value, threshold) => value > threshold,
        threshold: 5, // 5%
        severity: 'high',
        cooldownMinutes: 10,
        enabled: true,
      },
      
      // Database alerts
      {
        id: 'database_connection_pool_exhausted',
        name: 'Database Connection Pool Exhausted',
        condition: (value, threshold) => value > threshold,
        threshold: 90, // 90% of pool used
        severity: 'critical',
        cooldownMinutes: 5,
        enabled: true,
      },
      {
        id: 'slow_database_queries',
        name: 'Slow Database Queries',
        condition: (value, threshold) => value > threshold,
        threshold: 1000, // 1 second
        severity: 'medium',
        cooldownMinutes: 15,
        enabled: true,
      },
      
      // Business logic alerts
      {
        id: 'high_fraud_detection_rate',
        name: 'High Fraud Detection Rate',
        condition: (value, threshold) => value > threshold,
        threshold: 10, // 10% of transactions flagged
        severity: 'high',
        cooldownMinutes: 30,
        enabled: true,
      },
      {
        id: 'payment_failure_rate',
        name: 'High Payment Failure Rate',
        condition: (value, threshold) => value > threshold,
        threshold: 15, // 15% failure rate
        severity: 'high',
        cooldownMinutes: 10,
        enabled: true,
      },
      
      // External service alerts
      {
        id: 'elasticsearch_unhealthy',
        name: 'Elasticsearch Unhealthy',
        condition: (value, threshold) => value === 0, // 0 = unhealthy
        threshold: 0,
        severity: 'high',
        cooldownMinutes: 15,
        enabled: true,
      },
      {
        id: 'redis_unhealthy',
        name: 'Redis Unhealthy',
        condition: (value, threshold) => value === 0, // 0 = unhealthy
        threshold: 0,
        severity: 'critical',
        cooldownMinutes: 5,
        enabled: true,
      },
    ];
  }

  async checkAlert(ruleId: string, currentValue: number, service: string, metadata?: Record<string, any>) {
    const rule = this.rules.find(r => r.id === ruleId);
    if (!rule || !rule.enabled) {
      return;
    }

    // Check if alert condition is met
    if (!rule.condition(currentValue, rule.threshold)) {
      return;
    }

    // Check cooldown period
    const lastAlertTime = this.alertHistory.get(ruleId) || 0;
    const cooldownMs = rule.cooldownMinutes * 60 * 1000;
    const now = Date.now();

    if (now - lastAlertTime < cooldownMs) {
      return; // Still in cooldown period
    }

    // Create and send alert
    const alert: Alert = {
      id: `${ruleId}_${now}`,
      severity: rule.severity,
      title: rule.name,
      message: this.generateAlertMessage(rule, currentValue, service),
      service,
      timestamp: new Date().toISOString(),
      metadata: {
        ruleId,
        currentValue,
        threshold: rule.threshold,
        ...metadata,
      },
    };

    await this.sendAlert(alert);
    this.alertHistory.set(ruleId, now);
  }

  private generateAlertMessage(rule: AlertRule, currentValue: number, service: string): string {
    switch (rule.id) {
      case 'high_memory_usage':
        return `Memory usage is ${currentValue}% (threshold: ${rule.threshold}%) on ${service}`;
      case 'high_cpu_usage':
        return `CPU usage is ${currentValue}% (threshold: ${rule.threshold}%) on ${service}`;
      case 'low_disk_space':
        return `Disk space is ${currentValue}% remaining (threshold: ${rule.threshold}%) on ${service}`;
      case 'high_response_time':
        return `Average response time is ${currentValue}ms (threshold: ${rule.threshold}ms) on ${service}`;
      case 'high_error_rate':
        return `Error rate is ${currentValue}% (threshold: ${rule.threshold}%) on ${service}`;
      case 'database_connection_pool_exhausted':
        return `Database connection pool is ${currentValue}% utilized (threshold: ${rule.threshold}%) on ${service}`;
      case 'slow_database_queries':
        return `Database query took ${currentValue}ms (threshold: ${rule.threshold}ms) on ${service}`;
      case 'high_fraud_detection_rate':
        return `Fraud detection rate is ${currentValue}% (threshold: ${rule.threshold}%) on ${service}`;
      case 'payment_failure_rate':
        return `Payment failure rate is ${currentValue}% (threshold: ${rule.threshold}%) on ${service}`;
      case 'elasticsearch_unhealthy':
        return `Elasticsearch is unhealthy on ${service}`;
      case 'redis_unhealthy':
        return `Redis is unhealthy on ${service}`;
      default:
        return `Alert: ${rule.name} - Current value: ${currentValue}, Threshold: ${rule.threshold} on ${service}`;
    }
  }

  private async sendAlert(alert: Alert) {
    try {
      // Log the alert
      logger.error('ALERT TRIGGERED', {
        alertId: alert.id,
        severity: alert.severity,
        title: alert.title,
        message: alert.message,
        service: alert.service,
        metadata: alert.metadata,
      });

      // Send notifications based on severity
      const recipients = this.getAlertRecipients(alert.severity);
      
      for (const recipient of recipients) {
        // Send email notification
        await this.notificationService.sendEmail({
          to: recipient.email,
          subject: `[${alert.severity.toUpperCase()}] ${alert.title}`,
          template: 'alert',
          data: {
            alert,
            recipient: recipient.name,
          },
        });

        // Send SMS for critical alerts
        if (alert.severity === 'critical' && recipient.phone) {
          await this.notificationService.sendSMS({
            to: recipient.phone,
            message: `CRITICAL ALERT: ${alert.title} - ${alert.message}`,
          });
        }
      }

      // Send to external monitoring systems (e.g., PagerDuty, Slack)
      await this.sendToExternalSystems(alert);

    } catch (error) {
      logger.error('Failed to send alert', error as Error, { alert });
    }
  }

  private getAlertRecipients(severity: string) {
    // In production, this would come from a configuration or database
    const recipients = [
      {
        name: 'DevOps Team',
        email: process.env['DEVOPS_EMAIL'] || 'devops@ticketplatform.com',
        phone: process.env['DEVOPS_PHONE'],
        severities: ['critical', 'high'],
      },
      {
        name: 'Development Team',
        email: process.env['DEV_EMAIL'] || 'dev@ticketplatform.com',
        phone: null,
        severities: ['critical', 'high', 'medium'],
      },
      {
        name: 'Operations Manager',
        email: process.env['OPS_EMAIL'] || 'ops@ticketplatform.com',
        phone: process.env['OPS_PHONE'],
        severities: ['critical'],
      },
    ];

    return recipients.filter(recipient => 
      recipient.severities.includes(severity)
    );
  }

  private async sendToExternalSystems(alert: Alert) {
    // Send to Slack webhook
    if (process.env['SLACK_WEBHOOK_URL']) {
      try {
        await fetch(process.env['SLACK_WEBHOOK_URL'], {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `🚨 ${alert.severity.toUpperCase()} Alert`,
            attachments: [{
              color: this.getSeverityColor(alert.severity),
              title: alert.title,
              text: alert.message,
              fields: [
                { title: 'Service', value: alert.service, short: true },
                { title: 'Severity', value: alert.severity, short: true },
                { title: 'Time', value: alert.timestamp, short: true },
              ],
            }],
          }),
        });
      } catch (error) {
        logger.error('Failed to send alert to Slack', error as Error);
      }
    }

    // Send to PagerDuty (if configured)
    if (process.env['PAGERDUTY_INTEGRATION_KEY'] && alert.severity === 'critical') {
      try {
        await fetch('https://events.pagerduty.com/v2/enqueue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            routing_key: process.env['PAGERDUTY_INTEGRATION_KEY'],
            event_action: 'trigger',
            payload: {
              summary: alert.title,
              source: alert.service,
              severity: 'critical',
              custom_details: alert.metadata,
            },
          }),
        });
      } catch (error) {
        logger.error('Failed to send alert to PagerDuty', error as Error);
      }
    }
  }

  private getSeverityColor(severity: string): string {
    switch (severity) {
      case 'critical': return 'danger';
      case 'high': return 'warning';
      case 'medium': return '#ffeb3b';
      case 'low': return 'good';
      default: return '#cccccc';
    }
  }

  // Public methods for manual alert management
  enableRule(ruleId: string) {
    const rule = this.rules.find(r => r.id === ruleId);
    if (rule) {
      rule.enabled = true;
      logger.info('Alert rule enabled', { ruleId });
    }
  }

  disableRule(ruleId: string) {
    const rule = this.rules.find(r => r.id === ruleId);
    if (rule) {
      rule.enabled = false;
      logger.info('Alert rule disabled', { ruleId });
    }
  }

  updateRuleThreshold(ruleId: string, threshold: number) {
    const rule = this.rules.find(r => r.id === ruleId);
    if (rule) {
      rule.threshold = threshold;
      logger.info('Alert rule threshold updated', { ruleId, threshold });
    }
  }

  getRules(): AlertRule[] {
    return [...this.rules];
  }
}

// Export singleton instance
let alertingService: AlertingService;

export const initializeAlerting = (notificationService: NotificationService) => {
  alertingService = new AlertingService(notificationService);
  return alertingService;
};

export const getAlertingService = () => alertingService;