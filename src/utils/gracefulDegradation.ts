/**
 * Graceful Degradation Utilities
 * 
 * Provides fallback mechanisms and degraded functionality
 * when external services or features are unavailable.
 */

import logger from '../config/logger';

export interface FallbackOptions<T> {
  fallbackValue?: T;
  fallbackFn?: () => T | Promise<T>;
  logError?: boolean;
  errorMessage?: string;
  retries?: number;
  retryDelay?: number;
}

export interface RetryOptions {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableErrors?: string[];
}

/**
 * Execute a function with fallback value on failure
 */
export async function withFallback<T>(
  fn: () => Promise<T>,
  options: FallbackOptions<T>
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (options.logError !== false) {
      logger.warn(options.errorMessage || 'Operation failed, using fallback', {
        error: error instanceof Error ? error.message : String(error)
      });
    }

    if (options.fallbackFn) {
      return await options.fallbackFn();
    }

    if (options.fallbackValue !== undefined) {
      return options.fallbackValue;
    }

    throw error;
  }
}

/**
 * Execute a function with exponential backoff retry
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    backoffMultiplier = 2,
    retryableErrors = []
  } = options;

  let lastError: Error;
  let delay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Check if error is retryable
      if (retryableErrors.length > 0) {
        const isRetryable = retryableErrors.some(
          errorType => lastError.name === errorType || lastError.message.includes(errorType)
        );
        if (!isRetryable) {
          throw lastError;
        }
      }

      // Don't retry on last attempt
      if (attempt === maxRetries) {
        break;
      }

      logger.debug(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`, {
        error: lastError.message
      });

      // Wait before retrying
      await sleep(delay);

      // Exponential backoff
      delay = Math.min(delay * backoffMultiplier, maxDelay);
    }
  }

  throw lastError!;
}

/**
 * Execute multiple functions in parallel with partial success tolerance
 */
export async function withPartialSuccess<T>(
  operations: Array<() => Promise<T>>,
  minSuccessCount: number = 1
): Promise<{ results: T[]; errors: Error[] }> {
  const settled = await Promise.allSettled(operations.map(op => op()));

  const results: T[] = [];
  const errors: Error[] = [];

  settled.forEach(result => {
    if (result.status === 'fulfilled') {
      results.push(result.value);
    } else {
      errors.push(result.reason);
    }
  });

  if (results.length < minSuccessCount) {
    logger.error('Insufficient successful operations', {
      required: minSuccessCount,
      successful: results.length,
      failed: errors.length
    });
    throw new Error(
      `Required ${minSuccessCount} successful operations, got ${results.length}`
    );
  }

  if (errors.length > 0) {
    logger.warn('Some operations failed but minimum success threshold met', {
      successful: results.length,
      failed: errors.length
    });
  }

  return { results, errors };
}

/**
 * Execute a function with timeout
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  timeoutError?: Error
): Promise<T> {
  return Promise.race([
    fn(),
    sleep(timeoutMs).then(() => {
      throw timeoutError || new Error(`Operation timed out after ${timeoutMs}ms`);
    })
  ]);
}

/**
 * Cache wrapper with TTL and fallback to stale data
 */
export class CachedValue<T> {
  private value?: T;
  private timestamp?: number;
  private loading: boolean = false;
  private loadPromise?: Promise<T>;

  constructor(
    private loader: () => Promise<T>,
    private ttlMs: number,
    private staleWhileRevalidate: boolean = true
  ) {}

  async get(): Promise<T> {
    const now = Date.now();

    // Return cached value if still fresh
    if (this.value && this.timestamp && now - this.timestamp < this.ttlMs) {
      return this.value;
    }

    // If stale data exists and revalidation is in progress, return stale
    if (this.staleWhileRevalidate && this.value && this.loading) {
      return this.value;
    }

    // If already loading, wait for that promise
    if (this.loading && this.loadPromise) {
      return this.loadPromise;
    }

    // Load fresh data
    this.loading = true;
    this.loadPromise = this.loader()
      .then(value => {
        this.value = value;
        this.timestamp = Date.now();
        this.loading = false;
        return value;
      })
      .catch(error => {
        this.loading = false;
        // Return stale data if available
        if (this.staleWhileRevalidate && this.value) {
          logger.warn('Failed to refresh cached value, returning stale data', {
            error: error instanceof Error ? error.message : String(error)
          });
          return this.value;
        }
        throw error;
      });

    return this.loadPromise;
  }

  invalidate(): void {
    this.value = undefined;
    this.timestamp = undefined;
  }

  hasValue(): boolean {
    return this.value !== undefined;
  }
}

/**
 * Feature flag with graceful degradation
 */
export class FeatureFlag {
  private enabled: boolean;
  private fallbackMode: boolean = false;

  constructor(
    private name: string,
    initialState: boolean = true
  ) {
    this.enabled = initialState;
  }

  isEnabled(): boolean {
    return this.enabled && !this.fallbackMode;
  }

  enable(): void {
    this.enabled = true;
    this.fallbackMode = false;
  }

  disable(): void {
    this.enabled = false;
  }

  enterFallbackMode(): void {
    this.fallbackMode = true;
    logger.warn(`Feature ${this.name} entered fallback mode`);
  }

  exitFallbackMode(): void {
    this.fallbackMode = false;
    logger.info(`Feature ${this.name} exited fallback mode`);
  }

  async executeWithFallback<T>(
    primaryFn: () => Promise<T>,
    fallbackFn: () => Promise<T>
  ): Promise<T> {
    if (!this.isEnabled()) {
      return fallbackFn();
    }

    try {
      return await primaryFn();
    } catch (error) {
      logger.warn(`Feature ${this.name} failed, using fallback`, {
        error: error instanceof Error ? error.message : String(error)
      });
      this.enterFallbackMode();
      return fallbackFn();
    }
  }
}

/**
 * Service health tracker for degradation decisions
 */
export class ServiceHealthTracker {
  private healthScores: Map<string, number> = new Map();
  private readonly maxScore = 100;
  private readonly minScore = 0;
  private readonly degradationThreshold = 50;

  recordSuccess(serviceName: string, weight: number = 10): void {
    const current = this.healthScores.get(serviceName) || this.maxScore;
    const newScore = Math.min(current + weight, this.maxScore);
    this.healthScores.set(serviceName, newScore);
  }

  recordFailure(serviceName: string, weight: number = 20): void {
    const current = this.healthScores.get(serviceName) || this.maxScore;
    const newScore = Math.max(current - weight, this.minScore);
    this.healthScores.set(serviceName, newScore);

    if (newScore <= this.degradationThreshold) {
      logger.warn(`Service ${serviceName} health degraded`, {
        healthScore: newScore,
        threshold: this.degradationThreshold
      });
    }
  }

  getHealthScore(serviceName: string): number {
    return this.healthScores.get(serviceName) || this.maxScore;
  }

  isHealthy(serviceName: string): boolean {
    return this.getHealthScore(serviceName) > this.degradationThreshold;
  }

  shouldDegrade(serviceName: string): boolean {
    return !this.isHealthy(serviceName);
  }

  reset(serviceName: string): void {
    this.healthScores.set(serviceName, this.maxScore);
  }

  getAllScores(): Record<string, number> {
    const scores: Record<string, number> = {};
    this.healthScores.forEach((score, name) => {
      scores[name] = score;
    });
    return scores;
  }
}

/**
 * Helper function to sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Global instances
export const serviceHealthTracker = new ServiceHealthTracker();
