/**
 * Unit tests for Circuit Breaker implementation
 */

import { 
  CircuitBreaker, 
  CircuitBreakerManager, 
  CircuitState,
  CircuitBreakerError
} from '../../utils/circuitBreaker';
import { describe, it, expect, beforeEach } from '@jest/globals';

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker('test-service', {
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 1000,
      monitoringPeriod: 5000
    });
  });

  describe('Initial State', () => {
    it('should start in CLOSED state', () => {
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
      expect(circuitBreaker.isOpen()).toBe(false);
    });

    it('should have zero failures initially', () => {
      const stats = circuitBreaker.getStats();
      expect(stats.failures).toBe(0);
      expect(stats.successes).toBe(0);
      expect(stats.totalCalls).toBe(0);
    });
  });

  describe('Successful Execution', () => {
    it('should execute function successfully', async () => {
      const result = await circuitBreaker.execute(async () => 'success');
      expect(result).toBe('success');
    });

    it('should track successful calls', async () => {
      await circuitBreaker.execute(async () => 'success');
      const stats = circuitBreaker.getStats();
      expect(stats.totalCalls).toBe(1);
      expect(stats.lastSuccessTime).toBeDefined();
    });

    it('should reset failure count on success', async () => {
      // Cause some failures
      try {
        await circuitBreaker.execute(async () => {
          throw new Error('failure');
        });
      } catch (e) {}

      // Success should reset failures
      await circuitBreaker.execute(async () => 'success');
      const stats = circuitBreaker.getStats();
      expect(stats.failures).toBe(0);
    });
  });

  describe('Failed Execution', () => {
    it('should propagate errors', async () => {
      await expect(
        circuitBreaker.execute(async () => {
          throw new Error('test error');
        })
      ).rejects.toThrow('test error');
    });

    it('should track failures', async () => {
      try {
        await circuitBreaker.execute(async () => {
          throw new Error('failure');
        });
      } catch (e) {}

      const stats = circuitBreaker.getStats();
      expect(stats.failures).toBe(1);
      expect(stats.lastFailureTime).toBeDefined();
    });

    it('should open circuit after threshold failures', async () => {
      // Cause threshold failures
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('failure');
          });
        } catch (e) {}
      }

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
      expect(circuitBreaker.isOpen()).toBe(true);
    });
  });

  describe('OPEN State', () => {
    beforeEach(async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('failure');
          });
        } catch (e) {}
      }
    });

    it('should reject calls immediately when open', async () => {
      await expect(
        circuitBreaker.execute(async () => 'success')
      ).rejects.toThrow(CircuitBreakerError);
    });

    it('should transition to HALF_OPEN after timeout', async () => {
      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Next call should transition to half-open
      try {
        await circuitBreaker.execute(async () => 'success');
      } catch (e) {}

      const state = circuitBreaker.getState();
      expect([CircuitState.HALF_OPEN, CircuitState.CLOSED]).toContain(state);
    });
  });

  describe('HALF_OPEN State', () => {
    beforeEach(async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('failure');
          });
        } catch (e) {}
      }
      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 1100));
    });

    it('should close circuit after success threshold', async () => {
      // Execute successful calls
      await circuitBreaker.execute(async () => 'success');
      await circuitBreaker.execute(async () => 'success');

      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should reopen circuit on failure', async () => {
      try {
        await circuitBreaker.execute(async () => {
          throw new Error('failure');
        });
      } catch (e) {}

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
    });
  });

  describe('State Callbacks', () => {
    it('should call onStateChange callback', async () => {
      const stateChanges: CircuitState[] = [];
      
      const cb = new CircuitBreaker('callback-test', {
        failureThreshold: 2,
        successThreshold: 1,
        timeout: 1000,
        monitoringPeriod: 5000,
        onStateChange: (state) => stateChanges.push(state)
      });

      // Trigger state change to OPEN
      for (let i = 0; i < 2; i++) {
        try {
          await cb.execute(async () => {
            throw new Error('failure');
          });
        } catch (e) {}
      }

      expect(stateChanges).toContain(CircuitState.OPEN);
    });

    it('should call onFailure callback', async () => {
      const failures: Error[] = [];
      
      const cb = new CircuitBreaker('failure-callback-test', {
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 1000,
        monitoringPeriod: 5000,
        onFailure: (error) => failures.push(error)
      });

      try {
        await cb.execute(async () => {
          throw new Error('test failure');
        });
      } catch (e) {}

      expect(failures.length).toBe(1);
      expect(failures[0]?.message).toBe('test failure');
    });
  });

  describe('Manual Reset', () => {
    it('should reset circuit to CLOSED state', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('failure');
          });
        } catch (e) {}
      }

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);

      // Reset
      circuitBreaker.reset();

      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
      const stats = circuitBreaker.getStats();
      expect(stats.failures).toBe(0);
    });
  });

  describe('Statistics', () => {
    it('should provide accurate statistics', async () => {
      await circuitBreaker.execute(async () => 'success');
      
      try {
        await circuitBreaker.execute(async () => {
          throw new Error('failure');
        });
      } catch (e) {}

      const stats = circuitBreaker.getStats();
      expect(stats.totalCalls).toBe(2);
      expect(stats.failures).toBe(1);
      expect(stats.lastSuccessTime).toBeDefined();
      expect(stats.lastFailureTime).toBeDefined();
    });
  });
});

describe('CircuitBreakerManager', () => {
  let manager: CircuitBreakerManager;

  beforeEach(() => {
    manager = new CircuitBreakerManager();
  });

  describe('Breaker Management', () => {
    it('should create and retrieve circuit breakers', () => {
      const breaker = manager.getBreaker('service-1');
      expect(breaker).toBeDefined();
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should reuse existing circuit breakers', () => {
      const breaker1 = manager.getBreaker('service-1');
      const breaker2 = manager.getBreaker('service-1');
      expect(breaker1).toBe(breaker2);
    });

    it('should create separate breakers for different services', () => {
      const breaker1 = manager.getBreaker('service-1');
      const breaker2 = manager.getBreaker('service-2');
      expect(breaker1).not.toBe(breaker2);
    });

    it('should apply custom options', () => {
      const breaker = manager.getBreaker('custom-service', {
        failureThreshold: 10
      });
      expect(breaker).toBeDefined();
    });
  });

  describe('Execute with Manager', () => {
    it('should execute function through manager', async () => {
      const result = await manager.execute('test-service', async () => 'success');
      expect(result).toBe('success');
    });

    it('should track failures across executions', async () => {
      for (let i = 0; i < 5; i++) {
        try {
          await manager.execute('failing-service', async () => {
            throw new Error('failure');
          });
        } catch (e) {}
      }

      const breaker = manager.getBreaker('failing-service');
      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });
  });

  describe('Statistics', () => {
    it('should get stats for all breakers', async () => {
      await manager.execute('service-1', async () => 'success');
      await manager.execute('service-2', async () => 'success');

      const stats = manager.getAllStats();
      expect(Object.keys(stats).length).toBeGreaterThanOrEqual(2);
      expect(stats['service-1']).toBeDefined();
      expect(stats['service-2']).toBeDefined();
    });

    it('should list all service names', async () => {
      await manager.execute('service-a', async () => 'success');
      await manager.execute('service-b', async () => 'success');

      const names = manager.getServiceNames();
      expect(names).toContain('service-a');
      expect(names).toContain('service-b');
    });
  });

  describe('Reset Operations', () => {
    it('should reset specific breaker', async () => {
      // Open circuit
      for (let i = 0; i < 5; i++) {
        try {
          await manager.execute('reset-test', async () => {
            throw new Error('failure');
          });
        } catch (e) {}
      }

      const breaker = manager.getBreaker('reset-test');
      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Reset
      manager.reset('reset-test');
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should reset all breakers', async () => {
      // Open multiple circuits
      for (let i = 0; i < 5; i++) {
        try {
          await manager.execute('service-1', async () => {
            throw new Error('failure');
          });
          await manager.execute('service-2', async () => {
            throw new Error('failure');
          });
        } catch (e) {}
      }

      // Reset all
      manager.resetAll();

      const breaker1 = manager.getBreaker('service-1');
      const breaker2 = manager.getBreaker('service-2');
      expect(breaker1.getState()).toBe(CircuitState.CLOSED);
      expect(breaker2.getState()).toBe(CircuitState.CLOSED);
    });

    it('should remove breaker', () => {
      manager.getBreaker('removable-service');
      manager.remove('removable-service');

      const names = manager.getServiceNames();
      expect(names).not.toContain('removable-service');
    });
  });
});