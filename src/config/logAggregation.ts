import logger from './logger';

/**
 * Log Aggregation Configuration
 * 
 * This module provides configuration and utilities for log aggregation
 * across different environments and platforms.
 */

export interface LogAggregationConfig {
  enabled: boolean;
  provider: 'elasticsearch' | 'loki' | 'cloudwatch' | 'datadog' | 'none';
  batchSize: number;
  flushInterval: number; // milliseconds
  retryAttempts: number;
  retryDelay: number; // milliseconds
}

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  service: string;
  environment: string;
  correlationId?: string;
  userId?: string;
  metadata?: Record<string, any>;
}

export class LogAggregator {
  private config: LogAggregationConfig;
  private buffer: LogEntry[] = [];
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(config: LogAggregationConfig) {
    this.config = config;
    
    if (this.config.enabled) {
      this.startFlushTimer();
    }
  }

  /**
   * Add a log entry to the buffer
   */
  addLog(entry: LogEntry): void {
    if (!this.config.enabled) {
      return;
    }

    this.buffer.push(entry);

    // Flush if buffer is full
    if (this.buffer.length >= this.config.batchSize) {
      this.flush();
    }
  }

  /**
   * Flush buffered logs to the aggregation service
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) {
      return;
    }

    const logsToSend = [...this.buffer];
    this.buffer = [];

    try {
      switch (this.config.provider) {
        case 'elasticsearch':
          await this.sendToElasticsearch(logsToSend);
          break;
        case 'loki':
          await this.sendToLoki(logsToSend);
          break;
        case 'cloudwatch':
          await this.sendToCloudWatch(logsToSend);
          break;
        case 'datadog':
          await this.sendToDatadog(logsToSend);
          break;
        default:
          logger.warn('No log aggregation provider configured');
      }
    } catch (error) {
      logger.error('Failed to flush logs to aggregation service', error as Error);
      
      // Retry logic
      await this.retryFlush(logsToSend);
    }
  }

  /**
   * Send logs to Elasticsearch
   */
  private async sendToElasticsearch(logs: LogEntry[]): Promise<void> {
    const url = process.env['ELASTICSEARCH_URL'];
    if (!url) {
      throw new Error('ELASTICSEARCH_URL not configured');
    }

    const bulkBody = logs.flatMap(log => [
      { index: { _index: 'ticket-platform-logs' } },
      log,
    ]);

    const response = await fetch(`${url}/_bulk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-ndjson',
        ...(process.env['ELASTICSEARCH_AUTH'] && {
          'Authorization': `Basic ${Buffer.from(
            `${process.env['ELASTICSEARCH_USERNAME']}:${process.env['ELASTICSEARCH_PASSWORD']}`
          ).toString('base64')}`,
        }),
      },
      body: bulkBody.map(item => JSON.stringify(item)).join('\n') + '\n',
    });

    if (!response.ok) {
      throw new Error(`Elasticsearch bulk insert failed: ${response.statusText}`);
    }
  }

  /**
   * Send logs to Grafana Loki
   */
  private async sendToLoki(logs: LogEntry[]): Promise<void> {
    const url = process.env['LOKI_URL'];
    if (!url) {
      throw new Error('LOKI_URL not configured');
    }

    const streams = this.groupLogsByLabels(logs);

    const response = await fetch(`${url}/loki/api/v1/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env['LOKI_AUTH'] && {
          'Authorization': `Bearer ${process.env['LOKI_AUTH']}`,
        }),
      },
      body: JSON.stringify({ streams }),
    });

    if (!response.ok) {
      throw new Error(`Loki push failed: ${response.statusText}`);
    }
  }

  /**
   * Send logs to AWS CloudWatch
   */
  private async sendToCloudWatch(logs: LogEntry[]): Promise<void> {
    // This would require AWS SDK integration
    logger.warn('CloudWatch integration not yet implemented', { logCount: logs.length });
  }

  /**
   * Send logs to Datadog
   */
  private async sendToDatadog(logs: LogEntry[]): Promise<void> {
    const apiKey = process.env['DATADOG_API_KEY'];
    if (!apiKey) {
      throw new Error('DATADOG_API_KEY not configured');
    }

    const response = await fetch('https://http-intake.logs.datadoghq.com/v1/input', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'DD-API-KEY': apiKey,
      },
      body: JSON.stringify(logs),
    });

    if (!response.ok) {
      throw new Error(`Datadog log submission failed: ${response.statusText}`);
    }
  }

  /**
   * Group logs by labels for Loki
   */
  private groupLogsByLabels(logs: LogEntry[]): any[] {
    const grouped = new Map<string, LogEntry[]>();

    for (const log of logs) {
      const labels = JSON.stringify({
        service: log.service,
        environment: log.environment,
        level: log.level,
      });

      if (!grouped.has(labels)) {
        grouped.set(labels, []);
      }
      grouped.get(labels)!.push(log);
    }

    return Array.from(grouped.entries()).map(([labels, entries]) => ({
      stream: JSON.parse(labels),
      values: entries.map(entry => [
        String(new Date(entry.timestamp).getTime() * 1000000), // nanoseconds
        JSON.stringify(entry),
      ]),
    }));
  }

  /**
   * Retry failed flush with exponential backoff
   */
  private async retryFlush(logs: LogEntry[], attempt: number = 1): Promise<void> {
    if (attempt > this.config.retryAttempts) {
      logger.error('Max retry attempts reached for log aggregation', {
        logCount: logs.length,
        attempts: attempt,
      });
      return;
    }

    const delay = this.config.retryDelay * Math.pow(2, attempt - 1);
    
    await new Promise(resolve => setTimeout(resolve, delay));

    try {
      await this.flush();
    } catch (error) {
      logger.error(`Retry attempt ${attempt} failed`, error as Error);
      await this.retryFlush(logs, attempt + 1);
    }
  }

  /**
   * Start periodic flush timer
   */
  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush().catch(error => {
        logger.error('Periodic flush failed', error as Error);
      });
    }, this.config.flushInterval);
  }

  /**
   * Stop the aggregator and flush remaining logs
   */
  async stop(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    await this.flush();
  }
}

/**
 * Create log aggregator based on environment configuration
 */
export function createLogAggregator(): LogAggregator {
  const config: LogAggregationConfig = {
    enabled: process.env['LOG_AGGREGATION_ENABLED'] === 'true',
    provider: (process.env['LOG_AGGREGATION_PROVIDER'] as any) || 'none',
    batchSize: parseInt(process.env['LOG_BATCH_SIZE'] || '100'),
    flushInterval: parseInt(process.env['LOG_FLUSH_INTERVAL'] || '5000'),
    retryAttempts: parseInt(process.env['LOG_RETRY_ATTEMPTS'] || '3'),
    retryDelay: parseInt(process.env['LOG_RETRY_DELAY'] || '1000'),
  };

  logger.info('Log aggregation configured', {
    enabled: config.enabled,
    provider: config.provider,
    batchSize: config.batchSize,
  });

  return new LogAggregator(config);
}

/**
 * Query logs from aggregation service
 */
export async function queryLogs(params: {
  startTime: Date;
  endTime: Date;
  level?: string;
  service?: string;
  correlationId?: string;
  limit?: number;
}): Promise<LogEntry[]> {
  const provider = process.env['LOG_AGGREGATION_PROVIDER'];

  switch (provider) {
    case 'elasticsearch':
      return queryElasticsearch(params);
    case 'loki':
      return queryLoki(params);
    default:
      throw new Error(`Query not supported for provider: ${provider}`);
  }
}

/**
 * Query Elasticsearch for logs
 */
async function queryElasticsearch(params: any): Promise<LogEntry[]> {
  const url = process.env['ELASTICSEARCH_URL'];
  if (!url) {
    throw new Error('ELASTICSEARCH_URL not configured');
  }

  const query = {
    query: {
      bool: {
        must: [
          {
            range: {
              timestamp: {
                gte: params.startTime.toISOString(),
                lte: params.endTime.toISOString(),
              },
            },
          },
        ],
        filter: [] as any[],
      },
    },
    size: params.limit || 100,
    sort: [{ timestamp: 'desc' }],
  };

  if (params.level) {
    query.query.bool.filter.push({ term: { level: params.level } });
  }
  if (params.service) {
    query.query.bool.filter.push({ term: { service: params.service } });
  }
  if (params.correlationId) {
    query.query.bool.filter.push({ term: { correlationId: params.correlationId } });
  }

  const response = await fetch(`${url}/ticket-platform-logs/_search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env['ELASTICSEARCH_AUTH'] && {
        'Authorization': `Basic ${Buffer.from(
          `${process.env['ELASTICSEARCH_USERNAME']}:${process.env['ELASTICSEARCH_PASSWORD']}`
        ).toString('base64')}`,
      }),
    },
    body: JSON.stringify(query),
  });

  if (!response.ok) {
    throw new Error(`Elasticsearch query failed: ${response.statusText}`);
  }

  const result: any = await response.json();
  return result.hits.hits.map((hit: any) => hit._source);
}

/**
 * Query Loki for logs
 */
async function queryLoki(params: any): Promise<LogEntry[]> {
  const url = process.env['LOKI_URL'];
  if (!url) {
    throw new Error('LOKI_URL not configured');
  }

  const labels: string[] = [];
  if (params.service) labels.push(`service="${params.service}"`);
  if (params.level) labels.push(`level="${params.level}"`);

  const query = `{${labels.join(',')}}`;
  const start = Math.floor(params.startTime.getTime() / 1000);
  const end = Math.floor(params.endTime.getTime() / 1000);

  const queryParams = new URLSearchParams({
    query,
    start: start.toString(),
    end: end.toString(),
    limit: (params.limit || 100).toString(),
  });

  const response = await fetch(`${url}/loki/api/v1/query_range?${queryParams}`, {
    headers: {
      ...(process.env['LOKI_AUTH'] && {
        'Authorization': `Bearer ${process.env['LOKI_AUTH']}`,
      }),
    },
  });

  if (!response.ok) {
    throw new Error(`Loki query failed: ${response.statusText}`);
  }

  const result: any = await response.json();
  const logs: LogEntry[] = [];

  for (const stream of result.data.result) {
    for (const [line] of stream.values) {
      try {
        const log = JSON.parse(line);
        logs.push(log);
      } catch {
        // Skip unparseable logs
      }
    }
  }

  return logs;
}

// Export singleton instance
let logAggregator: LogAggregator;

export function getLogAggregator(): LogAggregator {
  if (!logAggregator) {
    logAggregator = createLogAggregator();
  }
  return logAggregator;
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  if (logAggregator) {
    await logAggregator.stop();
  }
});

process.on('SIGINT', async () => {
  if (logAggregator) {
    await logAggregator.stop();
  }
});
