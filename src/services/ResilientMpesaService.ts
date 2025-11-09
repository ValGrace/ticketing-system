/**
 * Resilient M-Pesa Service with Circuit Breaker
 * 
 * Wraps MpesaService with circuit breaker pattern and graceful degradation
 */

import { MpesaService } from './MpesaService';
import { circuitBreakerManager } from '../utils/circuitBreaker';
import { withRetry, withTimeout, serviceHealthTracker } from '../utils/gracefulDegradation';
import { ExternalServiceError } from '../middleware/errorHandler';
import logger from '../config/logger';
import {
  PaymentRequest,
  PaymentResult,
  MpesaSTKPushResponse,
  MpesaCallbackResponse
} from '../types';

export class ResilientMpesaService {
  private mpesaService: MpesaService;
  private readonly serviceName = 'mpesa';
  private readonly requestTimeout = 30000; // 30 seconds
  private readonly retryOptions = {
    maxRetries: 2,
    initialDelay: 1000,
    maxDelay: 5000,
    backoffMultiplier: 2,
    retryableErrors: ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND']
  };

  constructor() {
    this.mpesaService = new MpesaService();
  }

  /**
   * Initiate STK Push with circuit breaker protection
   */
  async initiateSTKPush(paymentRequest: PaymentRequest): Promise<MpesaSTKPushResponse> {
    const correlationId = (paymentRequest as any).correlationId || 'unknown';

    try {
      const result = await circuitBreakerManager.execute(
        this.serviceName,
        async () => {
          return await withTimeout(
            () => withRetry(
              () => this.mpesaService.initiateSTKPush(paymentRequest),
              this.retryOptions
            ),
            this.requestTimeout
          );
        },
        {
          failureThreshold: 5,
          successThreshold: 2,
          timeout: 60000,
          monitoringPeriod: 120000,
          onStateChange: (state) => {
            logger.warn(`M-Pesa circuit breaker state changed to ${state}`, {
              correlationId,
              service: this.serviceName
            });
          },
          onFailure: (error) => {
            serviceHealthTracker.recordFailure(this.serviceName);
            logger.error('M-Pesa STK Push failed', {
              correlationId,
              error: error.message,
              transactionId: paymentRequest.transactionId
            });
          }
        }
      );

      serviceHealthTracker.recordSuccess(this.serviceName);
      logger.info('M-Pesa STK Push successful', {
        correlationId,
        transactionId: paymentRequest.transactionId,
        checkoutRequestId: result.CheckoutRequestID
      });

      return result;
    } catch (error) {
      logger.error('M-Pesa STK Push failed after all retries', {
        correlationId,
        error: error instanceof Error ? error.message : String(error),
        transactionId: paymentRequest.transactionId
      });

      throw new ExternalServiceError(
        'M-Pesa',
        'Payment service is temporarily unavailable. Please try again later.'
      );
    }
  }

  /**
   * Query STK Push status with circuit breaker protection
   */
  async querySTKPushStatus(checkoutRequestId: string, correlationId?: string): Promise<any> {
    try {
      const result = await circuitBreakerManager.execute(
        this.serviceName,
        async () => {
          return await withTimeout(
            () => this.mpesaService.querySTKPushStatus(checkoutRequestId),
            this.requestTimeout
          );
        }
      );

      serviceHealthTracker.recordSuccess(this.serviceName);
      return result;
    } catch (error) {
      serviceHealthTracker.recordFailure(this.serviceName);
      logger.error('M-Pesa status query failed', {
        correlationId: correlationId || 'unknown',
        error: error instanceof Error ? error.message : String(error),
        checkoutRequestId
      });

      throw new ExternalServiceError(
        'M-Pesa',
        'Unable to query payment status. Please try again later.'
      );
    }
  }

  /**
   * Process callback (no circuit breaker needed for incoming webhooks)
   */
  processCallback(callbackData: MpesaCallbackResponse): PaymentResult {
    return this.mpesaService.processCallback(callbackData);
  }

  /**
   * Validate callback (no circuit breaker needed)
   */
  validateCallback(callbackData: MpesaCallbackResponse): boolean {
    return this.mpesaService.validateCallback(callbackData);
  }

  /**
   * Health check with circuit breaker awareness
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Check circuit breaker state
      const breaker = circuitBreakerManager.getBreaker(this.serviceName);
      if (breaker.isOpen()) {
        logger.warn('M-Pesa circuit breaker is OPEN', {
          stats: breaker.getStats()
        });
        return false;
      }

      // Check service health
      const isHealthy = await withTimeout(
        () => this.mpesaService.healthCheck(),
        5000
      );

      if (isHealthy) {
        serviceHealthTracker.recordSuccess(this.serviceName);
      } else {
        serviceHealthTracker.recordFailure(this.serviceName);
      }

      return isHealthy;
    } catch (error) {
      serviceHealthTracker.recordFailure(this.serviceName);
      logger.error('M-Pesa health check failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Get service health metrics
   */
  getHealthMetrics(): {
    circuitBreakerStats: any;
    healthScore: number;
    isHealthy: boolean;
  } {
    const breaker = circuitBreakerManager.getBreaker(this.serviceName);
    return {
      circuitBreakerStats: breaker.getStats(),
      healthScore: serviceHealthTracker.getHealthScore(this.serviceName),
      isHealthy: serviceHealthTracker.isHealthy(this.serviceName)
    };
  }

  /**
   * Reset circuit breaker (admin operation)
   */
  resetCircuitBreaker(): void {
    circuitBreakerManager.reset(this.serviceName);
    serviceHealthTracker.reset(this.serviceName);
    logger.info('M-Pesa circuit breaker reset');
  }
}
