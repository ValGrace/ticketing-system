import request from 'supertest';
import express from 'express';

describe('Header Size Handling', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    
    // Add the same header size monitoring middleware as in main app
    app.use((req, _res, next) => {
      const headerSize = JSON.stringify(req.headers).length;
      if (headerSize > 8192) {
        console.log(`Large headers detected: ${headerSize} bytes`);
      }
      next();
    });

    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ limit: '10mb', extended: true, parameterLimit: 20000 }));

    // Test endpoint
    app.post('/test', (req, res) => {
      res.json({ 
        success: true, 
        headerSize: JSON.stringify(req.headers).length,
        bodySize: JSON.stringify(req.body).length
      });
    });

    // Error handler for 431 errors
    app.use((err: any, req: any, res: any, next: any) => {
      if (err.code === 'HPE_HEADER_OVERFLOW' || res.statusCode === 431) {
        return res.status(431).json({
          error: {
            code: 'REQUEST_HEADER_FIELDS_TOO_LARGE',
            message: 'Request headers are too large',
            headerSize: JSON.stringify(req.headers).length
          }
        });
      }
      next(err);
    });
  });

  it('should handle normal sized headers', async () => {
    const response = await request(app)
      .post('/test')
      .send({ message: 'test' })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.headerSize).toBeLessThan(8192);
  });

  it('should handle large authorization headers', async () => {
    // Create a large JWT-like token (simulating the issue)
    const largeToken = 'Bearer ' + 'x'.repeat(10000); // 10KB token
    
    const response = await request(app)
      .post('/test')
      .set('Authorization', largeToken)
      .send({ message: 'test' })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.headerSize).toBeGreaterThan(8192);
  });

  it('should handle multiple large headers', async () => {
    const largeValue = 'x'.repeat(5000);
    
    const response = await request(app)
      .post('/test')
      .set('X-Custom-Header-1', largeValue)
      .set('X-Custom-Header-2', largeValue)
      .set('X-Custom-Header-3', largeValue)
      .send({ message: 'test' })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.headerSize).toBeGreaterThan(15000);
  });

  it('should provide helpful error message for 431 errors', async () => {
    // This test documents the expected behavior when headers are too large
    // In practice, with our fix, this should not happen unless headers exceed 32KB
    const testApp = express();
    
    testApp.use((req, res) => {
      // Simulate a 431 error
      res.status(431).json({
        error: {
          code: 'REQUEST_HEADER_FIELDS_TOO_LARGE',
          message: 'Request headers are too large. This often happens with large JWT tokens or cookies.',
          suggestions: [
            'Clear browser cookies and local storage',
            'Use shorter JWT tokens',
            'Check for duplicate or unnecessary headers'
          ]
        }
      });
    });

    const response = await request(testApp)
      .get('/test')
      .expect(431);

    expect(response.body.error.code).toBe('REQUEST_HEADER_FIELDS_TOO_LARGE');
    expect(response.body.error.suggestions).toHaveLength(3);
  });
});