/**
 * Unit tests for Graceful Degradation utilities
 */

import {
  withFallback,
  withRetry,
  withPartialSuccess,
  withTimeout,
  CachedValue,
  FeatureFlag,
  ServiceHealthTracker
} from '../../utils/gracefulDegradation';

describe('withFallback', () => {
  it('should return primary result on success', async () => {
    const result = await withFallback(
      async () => 'primary',
      { fallbackValue: 'fallback' }
    );
    expect(result).toBe('primary');
  });

  it('should return fallback value on error', async () => {
    const result = await withFallback(
      async () => {
        throw new Error('failure');
      },
      { fallbackValue: 'fallback' }
    );
    expect(result).toBe('fallback');
  });

  it('should use fallback function', async () => {
    const result = await withFallback(
      async () => {
        throw new Error('failure');
      },
      { fallbackFn: async () => 'fallback-fn' }
    );
    expect(result).toBe('fallback-fn');
  });

  it('should throw if no fallback provided', async () => {
    await expect(
      withFallback(
        async () => {
          throw new Error('failure');
        },
        {}
      )
    ).rejects.toThrow('failure');
  });
});

describe('withRetry', () => {
  it('should succeed on first attempt', async () => {
    const fn = jest.fn().mockResolvedValue('success');
    const result = await withRetry(fn);
    
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('success');

    const result = await withRetry(fn, { maxRetries: 3, initialDelay: 10 });
    
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should throw after max retries', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('persistent failure'));

    await expect(
      withRetry(fn, { maxRetries: 2, initialDelay: 10 })
    ).rejects.toThrow('persistent failure');
    
    expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
  });

  it('should respect retryable errors', async () => {
    const error = new Error('NonRetryableError');
    error.name = 'NonRetryableError';
    const fn = jest.fn().mockRejectedValue(error);

    await expect(
      withRetry(fn, {
        maxRetries: 3,
        initialDelay: 10,
        retryableErrors: ['RetryableError']
      })
    ).rejects.toThrow('NonRetryableError');
    
    expect(fn).toHaveBeenCalledTimes(1); // Should not retry
  });
});

describe('withPartialSuccess', () => {
  it('should succeed when all operations succeed', async () => {
    const operations = [
      async () => 'result1',
      async () => 'result2',
      async () => 'result3'
    ];

    const { results, errors } = await withPartialSuccess(operations, 2);
    
    expect(results).toHaveLength(3);
    expect(errors).toHaveLength(0);
  });

  it('should succeed with partial failures', async () => {
    const operations = [
      async () => 'result1',
      async () => {
        throw new Error('failure');
      },
      async () => 'result3'
    ];

    const { results, errors } = await withPartialSuccess(operations, 2);
    
    expect(results).toHaveLength(2);
    expect(errors).toHaveLength(1);
  });

  it('should fail when minimum success not met', async () => {
    const operations = [
      async () => 'result1',
      async () => {
        throw new Error('failure1');
      },
      async () => {
        throw new Error('failure2');
      }
    ];

    await expect(
      withPartialSuccess(operations, 2)
    ).rejects.toThrow('Required 2 successful operations, got 1');
  });
});

describe('withTimeout', () => {
  it('should succeed before timeout', async () => {
    const result = await withTimeout(
      async () => 'success',
      1000
    );
    expect(result).toBe('success');
  });

  it('should throw on timeout', async () => {
    await expect(
      withTimeout(
        async () => {
          await new Promise(resolve => setTimeout(resolve, 200));
          return 'too slow';
        },
        50
      )
    ).rejects.toThrow('Operation timed out after 50ms');
  });

  it('should use custom timeout error', async () => {
    const customError = new Error('Custom timeout');
    
    await expect(
      withTimeout(
        async () => {
          await new Promise(resolve => setTimeout(resolve, 200));
          return 'too slow';
        },
        50,
        customError
      )
    ).rejects.toThrow('Custom timeout');
  });
});

describe('CachedValue', () => {
  it('should load value on first access', async () => {
    const loader = jest.fn().mockResolvedValue('loaded');
    const cache = new CachedValue(loader, 1000);

    const value = await cache.get();
    
    expect(value).toBe('loaded');
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('should return cached value within TTL', async () => {
    const loader = jest.fn().mockResolvedValue('loaded');
    const cache = new CachedValue(loader, 1000);

    await cache.get();
    await cache.get();
    
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('should reload after TTL expires', async () => {
    const loader = jest.fn()
      .mockResolvedValueOnce('first')
      .mockResolvedValueOnce('second');
    
    const cache = new CachedValue(loader, 50);

    const first = await cache.get();
    await new Promise(resolve => setTimeout(resolve, 100));
    const second = await cache.get();
    
    expect(first).toBe('first');
    expect(second).toBe('second');
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('should return stale data on refresh failure', async () => {
    const loader = jest.fn()
      .mockResolvedValueOnce('initial')
      .mockRejectedValueOnce(new Error('refresh failed'));
    
    const cache = new CachedValue(loader, 50, true);

    await cache.get();
    await new Promise(resolve => setTimeout(resolve, 100));
    const stale = await cache.get();
    
    expect(stale).toBe('initial');
  });

  it('should invalidate cache', async () => {
    const loader = jest.fn()
      .mockResolvedValueOnce('first')
      .mockResolvedValueOnce('second');
    
    const cache = new CachedValue(loader, 1000);

    await cache.get();
    cache.invalidate();
    await cache.get();
    
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('should check if value exists', async () => {
    const loader = jest.fn().mockResolvedValue('loaded');
    const cache = new CachedValue(loader, 1000);

    expect(cache.hasValue()).toBe(false);
    await cache.get();
    expect(cache.hasValue()).toBe(true);
  });
});

describe('FeatureFlag', () => {
  it('should start enabled by default', () => {
    const flag = new FeatureFlag('test-feature');
    expect(flag.isEnabled()).toBe(true);
  });

  it('should respect initial state', () => {
    const flag = new FeatureFlag('test-feature', false);
    expect(flag.isEnabled()).toBe(false);
  });

  it('should enable and disable', () => {
    const flag = new FeatureFlag('test-feature');
    
    flag.disable();
    expect(flag.isEnabled()).toBe(false);
    
    flag.enable();
    expect(flag.isEnabled()).toBe(true);
  });

  it('should enter fallback mode', () => {
    const flag = new FeatureFlag('test-feature');
    
    flag.enterFallbackMode();
    expect(flag.isEnabled()).toBe(false);
  });

  it('should exit fallback mode', () => {
    const flag = new FeatureFlag('test-feature');
    
    flag.enterFallbackMode();
    flag.exitFallbackMode();
    expect(flag.isEnabled()).toBe(true);
  });

  it('should execute with fallback on failure', async () => {
    const flag = new FeatureFlag('test-feature');
    
    const result = await flag.executeWithFallback(
      async () => {
        throw new Error('primary failed');
      },
      async () => 'fallback'
    );
    
    expect(result).toBe('fallback');
    expect(flag.isEnabled()).toBe(false); // Should enter fallback mode
  });

  it('should use fallback when disabled', async () => {
    const flag = new FeatureFlag('test-feature', false);
    
    const result = await flag.executeWithFallback(
      async () => 'primary',
      async () => 'fallback'
    );
    
    expect(result).toBe('fallback');
  });
});

describe('ServiceHealthTracker', () => {
  let tracker: ServiceHealthTracker;

  beforeEach(() => {
    tracker = new ServiceHealthTracker();
  });

  it('should start with max health score', () => {
    expect(tracker.getHealthScore('new-service')).toBe(100);
    expect(tracker.isHealthy('new-service')).toBe(true);
  });

  it('should record successes', () => {
    tracker.recordSuccess('test-service', 10);
    expect(tracker.getHealthScore('test-service')).toBe(100);
  });

  it('should record failures', () => {
    tracker.recordFailure('test-service', 30);
    expect(tracker.getHealthScore('test-service')).toBe(70);
  });

  it('should mark service as unhealthy below threshold', () => {
    tracker.recordFailure('test-service', 60);
    
    expect(tracker.getHealthScore('test-service')).toBe(40);
    expect(tracker.isHealthy('test-service')).toBe(false);
    expect(tracker.shouldDegrade('test-service')).toBe(true);
  });

  it('should cap health score at max', () => {
    for (let i = 0; i < 20; i++) {
      tracker.recordSuccess('test-service', 10);
    }
    expect(tracker.getHealthScore('test-service')).toBe(100);
  });

  it('should cap health score at min', () => {
    const serviceName = 'min-cap-service';
    // Record one failure to initialize the service in the map
    tracker.recordFailure(serviceName, 10);
    
    // Now record many more failures to drive it to 0
    for (let i = 0; i < 20; i++) {
      tracker.recordFailure(serviceName, 10);
    }
    expect(tracker.getHealthScore(serviceName)).toBe(0);
  });

  it('should reset service health', () => {
    tracker.recordFailure('test-service', 60);
    tracker.reset('test-service');
    
    expect(tracker.getHealthScore('test-service')).toBe(100);
    expect(tracker.isHealthy('test-service')).toBe(true);
  });

  it('should get all health scores', () => {
    tracker.recordFailure('service-a', 20);
    tracker.recordFailure('service-b', 40);
    
    const scores = tracker.getAllScores();
    
    expect(scores['service-a']).toBe(80);
    expect(scores['service-b']).toBe(60);
  });
});
