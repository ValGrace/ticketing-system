import request from 'supertest';
import express, { Express } from 'express';
import { expect } from '@jest/globals'
import {
  sanitizeInput,
  detectSQLInjection,
  detectXSS,
  detectPathTraversal,
  bruteForceProtection,
  validateContentType,
  requestSizeLimit,
  sanitizeString,
  containsSQLInjection,
  recordFailedLogin,
  clearLoginAttempts
} from '../middleware/security';

describe('Security Middleware Tests', () => {
  let app: Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
  });

  describe('Input Sanitization', () => {
    it('should sanitize XSS attempts in request body', async () => {
      app.use(sanitizeInput);
      app.post('/test', (req, res) => {
        res.json(req.body);
      });

      const response = await request(app)
        .post('/test')
        .send({ name: '<script>alert("xss")</script>John' })
        .expect(200);

      expect(response.body.name).not.toContain('<script>');
      expect(response.body.name).not.toContain('</script>');
    });

    it('should sanitize javascript: protocol', async () => {
      app.use(sanitizeInput);
      app.post('/test', (req, res) => {
        res.json(req.body);
      });

      const response = await request(app)
        .post('/test')
        .send({ url: 'javascript:alert("xss")' })
        .expect(200);

      expect(response.body.url).not.toContain('javascript:');
    });

    it('should sanitize nested objects', async () => {
      app.use(sanitizeInput);
      app.post('/test', (req, res) => {
        res.json(req.body);
      });

      const response = await request(app)
        .post('/test')
        .send({
          user: {
            name: '<script>alert("xss")</script>',
            bio: 'onclick=alert("xss")'
          }
        })
        .expect(200);

      expect(response.body.user.name).not.toContain('<script>');
      expect(response.body.user.bio).not.toContain('onclick=');
    });
  });

  describe('SQL Injection Detection', () => {
    it('should block SQL injection attempts', async () => {
      app.use(detectSQLInjection);
      app.post('/test', (req, res) => {
        res.json({ success: true });
      });

      await request(app)
        .post('/test')
        .send({ query: "'; DROP TABLE users; --" })
        .expect(400);
    });

    it('should block UNION-based SQL injection', async () => {
      app.use(detectSQLInjection);
      app.post('/test', (req, res) => {
        res.json({ success: true });
      });

      await request(app)
        .post('/test')
        .send({ search: "' UNION SELECT * FROM users --" })
        .expect(400);
    });

    it('should allow legitimate queries', async () => {
      app.use(detectSQLInjection);
      app.post('/test', (req, res) => {
        res.json({ success: true });
      });

      await request(app)
        .post('/test')
        .send({ search: 'concert tickets' })
        .expect(200);
    });

    it('should detect SQL injection in query parameters', async () => {
      app.use(detectSQLInjection);
      app.get('/test', (req, res) => {
        res.json({ success: true });
      });

      await request(app)
        .get('/test?id=1 OR 1=1')
        .expect(400);
    });
  });

  describe('XSS Detection', () => {
    it('should block script tag injection', async () => {
      app.use(detectXSS);
      app.post('/test', (req, res) => {
        res.json({ success: true });
      });

      await request(app)
        .post('/test')
        .send({ comment: '<script>alert("xss")</script>' })
        .expect(400);
    });

    it('should block event handler injection', async () => {
      app.use(detectXSS);
      app.post('/test', (req, res) => {
        res.json({ success: true });
      });

      await request(app)
        .post('/test')
        .send({ html: '<img src=x onerror=alert("xss")>' })
        .expect(400);
    });

    it('should block iframe injection', async () => {
      app.use(detectXSS);
      app.post('/test', (req, res) => {
        res.json({ success: true });
      });

      await request(app)
        .post('/test')
        .send({ content: '<iframe src="evil.com"></iframe>' })
        .expect(400);
    });

    it('should allow safe HTML entities', async () => {
      app.use(detectXSS);
      app.post('/test', (req, res) => {
        res.json({ success: true });
      });

      await request(app)
        .post('/test')
        .send({ text: 'This is a safe message with &amp; and &lt;' })
        .expect(200);
    });
  });

  describe('Path Traversal Detection', () => {
    it('should block path traversal attempts', async () => {
      app.use(detectPathTraversal);
      app.get('/test', (req, res) => {
        res.json({ success: true });
      });

      await request(app)
        .get('/test?file=../../etc/passwd')
        .expect(400);
    });

    it('should block encoded path traversal', async () => {
      app.use(detectPathTraversal);
      app.get('/test', (req, res) => {
        res.json({ success: true });
      });

      await request(app)
        .get('/test?file=%2e%2e%2f%2e%2e%2fetc%2fpasswd')
        .expect(400);
    });

    it('should allow legitimate file paths', async () => {
      app.use(detectPathTraversal);
      app.get('/test', (req, res) => {
        res.json({ success: true });
      });

      await request(app)
        .get('/test?file=documents/report.pdf')
        .expect(200);
    });
  });

  describe('Brute Force Protection', () => {
    beforeEach(() => {
      // Clear any existing attempts
      clearLoginAttempts('test@example.com');
    });

    it('should allow initial login attempts', async () => {
      app.use(bruteForceProtection);
      app.post('/login', (req, res) => {
        res.json({ success: true });
      });

      await request(app)
        .post('/login')
        .send({ email: 'test@example.com', password: 'password' })
        .expect(200);
    });

    it('should block after max failed attempts', async () => {
      app.use(bruteForceProtection);
      app.post('/login', (req, res) => {
        res.json({ success: true });
      });

      const email = 'blocked@example.com';

      // Simulate 5 failed attempts
      for (let i = 0; i < 5; i++) {
        recordFailedLogin(email);
      }

      // Next attempt should be blocked
      await request(app)
        .post('/login')
        .send({ email, password: 'password' })
        .expect(429);
    });

    it('should clear attempts after successful login', () => {
      const email = 'success@example.com';
      
      recordFailedLogin(email);
      recordFailedLogin(email);
      
      clearLoginAttempts(email);
      
      // Should be able to attempt again
      expect(() => clearLoginAttempts(email)).not.toThrow();
    });
  });

  describe('Content-Type Validation', () => {
    it('should require Content-Type for POST requests', async () => {
      app.use(validateContentType);
      app.post('/test', (req, res) => {
        res.json({ success: true });
      });

      await request(app)
        .post('/test')
        .send({ data: 'test' })
        .set('Content-Type', '')
        .expect(400);
    });

    it('should accept application/json', async () => {
      app.use(validateContentType);
      app.post('/test', (req, res) => {
        res.json({ success: true });
      });

      await request(app)
        .post('/test')
        .set('Content-Type', 'application/json')
        .send({ data: 'test' })
        .expect(200);
    });

    it('should accept multipart/form-data', async () => {
      app.use(validateContentType);
      app.post('/test', (req, res) => {
        res.json({ success: true });
      });

      await request(app)
        .post('/test')
        .set('Content-Type', 'multipart/form-data')
        .expect(200);
    });

    it('should reject unsupported content types', async () => {
      app.use(validateContentType);
      app.post('/test', (req, res) => {
        res.json({ success: true });
      });

      await request(app)
        .post('/test')
        .set('Content-Type', 'text/plain')
        .send('plain text')
        .expect(415);
    });
  });

  describe('Request Size Limit', () => {
    it('should reject requests exceeding size limit', async () => {
      app.use(requestSizeLimit(1024)); // 1KB limit
      app.post('/test', (req, res) => {
        res.json({ success: true });
      });

      const largeData = 'x'.repeat(2000);
      
      await request(app)
        .post('/test')
        .set('Content-Length', largeData.length.toString())
        .send({ data: largeData })
        .expect(413);
    });

    it('should accept requests within size limit', async () => {
      app.use(requestSizeLimit(10 * 1024 * 1024)); // 10MB limit
      app.post('/test', (req, res) => {
        res.json({ success: true });
      });

      await request(app)
        .post('/test')
        .send({ data: 'small data' })
        .expect(200);
    });
  });

  describe('Utility Functions', () => {
    describe('sanitizeString', () => {
      it('should remove script tags', () => {
        const input = '<script>alert("xss")</script>Hello';
        const output = sanitizeString(input);
        expect(output).not.toContain('<script>');
        expect(output).not.toContain('</script>');
      });

      it('should remove event handlers', () => {
        const input = 'onclick=alert("xss")';
        const output = sanitizeString(input);
        expect(output).not.toContain('onclick=');
      });

      it('should preserve safe content', () => {
        const input = 'Hello World 123';
        const output = sanitizeString(input);
        expect(output).toBe('Hello World 123');
      });
    });

    describe('containsSQLInjection', () => {
      it('should detect SELECT statements', () => {
        expect(containsSQLInjection('SELECT * FROM users')).toBe(true);
      });

      it('should detect UNION attacks', () => {
        expect(containsSQLInjection("' UNION SELECT password FROM users --")).toBe(true);
      });

      it('should detect OR 1=1 attacks', () => {
        expect(containsSQLInjection("admin' OR 1=1 --")).toBe(true);
      });

      it('should allow safe strings', () => {
        expect(containsSQLInjection('concert tickets')).toBe(false);
      });
    });
  });

  describe('Integration Tests', () => {
    it('should apply multiple security middlewares', async () => {
      app.use(sanitizeInput);
      app.use(detectSQLInjection);
      app.use(detectXSS);
      app.post('/test', (req, res) => {
        res.json(req.body);
      });

      // Should sanitize but not block
      const response = await request(app)
        .post('/test')
        .send({ name: '<b>John</b>' })
        .expect(200);

      expect(response.body.name).not.toContain('<');
    });

    it('should block malicious requests early', async () => {
      app.use(detectSQLInjection);
      app.use(detectXSS);
      app.post('/test', (req, res) => {
        res.json({ success: true });
      });

      await request(app)
        .post('/test')
        .send({ query: "'; DROP TABLE users; --" })
        .expect(400);
    });
  });
});
