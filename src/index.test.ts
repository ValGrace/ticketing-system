import request from 'supertest';
import app from './index';
import { expect } from '@jest/globals'

describe('Health Check', () => {
  it('should return 200 OK for health endpoint', async () => {
    const response = await request(app).get('/health');
    
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status', 'OK');
    expect(response.body).toHaveProperty('service', 'ticket-resell-platform');
    expect(response.body).toHaveProperty('timestamp');
  });
});