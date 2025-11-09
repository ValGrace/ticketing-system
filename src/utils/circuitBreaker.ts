/**
 * Circuit Breaker Pattern Implementation
 * 
 * Prevents cascading failures by monitoring external service calls
 * and temporarily blocking requests when failure threshold is reached.
 */

export enum CircuitState {
  CLOSED = 'CLOSED',     // Normal operation
  OPEN = 'OPEN',         // Blocking requests
  HALF_OPEN = 'HALF_OPEN' // Testing if service recovered
}

export interface CircuitBreakerOptions {
  failureThreshold: number;      // Number of failures before opening circuit
  successThreshold: number;      // Number of successes to close circuit from half-open
  timeout: number;               // Time in ms before attempting to close circuit
  monitoringPeriod: number;      // Time window for counting failures
  onStateChange?: (state: CircuitState) => void;
  onFailure?: (error: Error) => void;
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  totalCalls: number;
  lastFailureTime?: Date;
  lastSuccessTime?: Date;
  nextAttemptTime?: Date;
}

export class CircuitBreakerError extends Error {
  constructor(serviceName: string) {
    super(`Circuit breaker is OPEN for service: ${serviceName}`);
    this.name = 'CircuitBreakerError';
  }
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private totalCalls: number = 0;
  private lastFailureTime?: Date;
  private lastSuccessTime?: Date;
  private nextAttemptTime?: Date;
  private failureTimestamps: Date[] = [];

  constructor(
    private serviceName: string,
    private options: CircuitBreakerOptions
  ) {}

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalCalls++;

    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      if (this.nextAttemptTime && new Date() < this.nextAttemptTime) {
        throw new CircuitBreakerError(this.serviceName);
      }
      // Transition to half-open to test service
      this.transitionTo(CircuitState.HALF_OPEN);
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error as Error);
      throw error;
    }
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    this.lastSuccessTime = new Date();
    this.failureCount = 0;
    this.failureTimestamps = [];

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.options.successThreshold) {
        this.transitionTo(CircuitState.CLOSED);
      }
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(error: Error): void {
    this.lastFailureTime = new Date();
    this.failureTimestamps.push(new Date());
    
    // Remove old failures outside monitoring period
    const cutoffTime = new Date(Date.now() - this.options.monitoringPeriod);
    this.failureTimestamps = this.failureTimestamps.filter(
      timestamp => timestamp > cutoffTime
    );

    this.failureCount = this.failureTimestamps.length;

    if (this.options.onFailure) {
      this.options.onFailure(error);
    }

    // Open circuit if failure threshold reached
    if (this.state === CircuitState.HALF_OPEN) {
      this.transitionTo(CircuitState.OPEN);
    } else if (this.failureCount >= this.options.failureThreshold) {
      this.transitionTo(CircuitState.OPEN);
    }
  }

  /**
   * Transition to a new circuit state
   */
  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;

    if (newState === CircuitState.OPEN) {
      this.nextAttemptTime = new Date(Date.now() + this.options.timeout);
      this.successCount = 0;
    } else if (newState === CircuitState.CLOSED) {
      this.failureCount = 0;
      this.successCount = 0;
      this.failureTimestamps = [];
      this.nextAttemptTime = undefined;
    } else if (newState === CircuitState.HALF_OPEN) {
      this.successCount = 0;
    }

    if (this.options.onStateChange && oldState !== newState) {
      this.options.onStateChange(newState);
    }
  }

  /**
   * Get current circuit breaker statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.failureCount,
      successes: this.successCount,
      totalCalls: this.totalCalls,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      nextAttemptTime: this.nextAttemptTime
    };
  }

  /**
   * Manually reset the circuit breaker
   */
  reset(): void {
    this.transitionTo(CircuitState.CLOSED);
  }

  /**
   * Check if circuit is allowing requests
   */
  isOpen(): boolean {
    return this.state === CircuitState.OPEN;
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state;
  }
}

/**
 * Circuit Breaker Manager for managing multiple circuit breakers
 */
export class CircuitBreakerManager {
  private breakers: Map<string, CircuitBreaker> = new Map();
  private defaultOptions: CircuitBreakerOptions = {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 60000, // 1 minute
    monitoringPeriod: 120000 // 2 minutes
  };

  /**
   * Get or create a circuit breaker for a service
   */
  getBreaker(serviceName: string, options?: Partial<CircuitBreakerOptions>): CircuitBreaker {
    if (!this.breakers.has(serviceName)) {
      const breakerOptions = { ...this.defaultOptions, ...options };
      const breaker = new CircuitBreaker(serviceName, breakerOptions);
      this.breakers.set(serviceName, breaker);
    }
    return this.breakers.get(serviceName)!;
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(
    serviceName: string,
    fn: () => Promise<T>,
    options?: Partial<CircuitBreakerOptions>
  ): Promise<T> {
    const breaker = this.getBreaker(serviceName, options);
    return breaker.execute(fn);
  }

  /**
   * Get statistics for all circuit breakers
   */
  getAllStats(): Record<string, CircuitBreakerStats> {
    const stats: Record<string, CircuitBreakerStats> = {};
    this.breakers.forEach((breaker, name) => {
      stats[name] = breaker.getStats();
    });
    return stats;
  }

  /**
   * Reset a specific circuit breaker
   */
  reset(serviceName: string): void {
    const breaker = this.breakers.get(serviceName);
    if (breaker) {
      breaker.reset();
    }
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    this.breakers.forEach(breaker => breaker.reset());
  }

  /**
   * Remove a circuit breaker
   */
  remove(serviceName: string): void {
    this.breakers.delete(serviceName);
  }

  /**
   * Get all service names with circuit breakers
   */
  getServiceNames(): string[] {
    return Array.from(this.breakers.keys());
  }
}

// Global circuit breaker manager instance
export const circuitBreakerManager = new CircuitBreakerManager();
