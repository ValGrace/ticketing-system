# Comprehensive Test Suite

This directory contains a comprehensive test suite for the Ticket Resell Platform, covering all critical functionality and requirements.

## Test Structure

```
src/test/
├── integration/          # Integration tests for API endpoints
│   ├── auth.test.ts
│   ├── user.test.ts
│   ├── listing.test.ts
│   ├── payment.test.ts
│   ├── messaging.test.ts
│   ├── websocket.test.ts
│   ├── database.test.ts
│   └── database-containers.test.ts
├── e2e/                  # End-to-end user journey tests
│   └── user-journeys.test.ts
├── performance/          # Performance and load tests
│   └── load.test.ts
├── security/             # Security and authentication tests
│   └── auth-security.test.ts
├── utils/                # Utility function tests
│   ├── circuitBreaker.test.ts
│   └── gracefulDegradation.test.ts
└── setup.ts              # Global test setup
```

## Test Categories

### 1. Integration Tests (`test/integration/`)

Tests that verify API endpoints work correctly with real database connections and services.

**Coverage:**
- Authentication flows (register, login, logout, token refresh)
- User management (profile, transaction history, account deletion)
- Listing operations (CRUD, search, image upload)
- Payment processing (transactions, confirmations, disputes)
- Messaging system (send, receive, notifications)
- WebSocket real-time updates
- Database operations with test containers

**Run:** `npm run test:integration`

### 2. End-to-End Tests (`test/e2e/`)

Tests that simulate complete user journeys from start to finish.

**Scenarios:**
- Complete ticket purchase flow (register → list → search → buy → review)
- Dispute resolution process
- Fraud detection workflow
- Mobile user experience

**Run:** `npm run test:e2e`

### 3. Performance Tests (`test/performance/`)

Tests that verify system performance under various load conditions.

**Coverage:**
- API response time benchmarks
- Concurrent request handling (50+ simultaneous requests)
- Database query performance
- Rate limiting effectiveness
- Memory usage and leak detection
- Cache performance

**Run:** `npm run test:performance`

### 4. Security Tests (`test/security/`)

Tests that verify security measures and prevent common vulnerabilities.

**Coverage:**
- Password strength validation
- JWT token security (expiration, tampering, validation)
- SQL injection prevention
- XSS (Cross-Site Scripting) prevention
- CSRF protection
- Rate limiting for brute force prevention
- Authorization and privilege escalation prevention
- Input validation and sanitization

**Run:** `npm run test:security`

## Running Tests

### Run All Tests
```bash
npm test
```

### Run Specific Test Suites
```bash
npm run test:integration    # Integration tests only
npm run test:e2e           # End-to-end tests only
npm run test:security      # Security tests only
npm run test:performance   # Performance tests only
npm run test:all           # All test suites sequentially
```

### Run Tests with Coverage
```bash
npm run test:coverage
```

### Run Tests in Watch Mode
```bash
npm run test:watch
```

## Test Environment Setup

### Prerequisites
- Node.js 18+
- PostgreSQL 15+
- Redis 7+
- Elasticsearch 8+ (for search tests)

### Environment Variables
Create a `.env.test` file with:
```env
TEST_DB_HOST=localhost
TEST_DB_PORT=5432
TEST_DB_NAME=ticket_resell_test
TEST_DB_USER=postgres
TEST_DB_PASSWORD=postgres
REDIS_HOST=localhost
REDIS_PORT=6379
ELASTICSEARCH_URL=http://localhost:9200
JWT_SECRET=test_secret_key
```

### Database Setup
```bash
# Create test database
createdb ticket_resell_test

# Run migrations
npm run migrate:test
```

## CI/CD Pipeline

The automated test pipeline runs on every push and pull request:

1. **Unit Tests** - Fast, isolated tests
2. **Integration Tests** - API endpoint tests with database
3. **E2E Tests** - Complete user journey tests
4. **Security Tests** - Security vulnerability checks
5. **Performance Tests** - Load and performance benchmarks

See `.github/workflows/test-pipeline.yml` for configuration.

## Test Best Practices

### Writing Tests
1. **Arrange-Act-Assert** pattern
2. Clear test descriptions
3. Independent tests (no shared state)
4. Clean up after tests
5. Mock external services appropriately

### Test Data
- Use factories for test data creation
- Clean up test data after each test
- Use transactions for database tests when possible

### Performance
- Keep tests fast (< 5 seconds per test)
- Use parallel execution when possible
- Mock slow external services

## Coverage Goals

- **Overall Coverage:** > 80%
- **Critical Paths:** > 95%
- **Security Functions:** 100%

## Troubleshooting

### Tests Failing Locally
1. Ensure all services are running (PostgreSQL, Redis, Elasticsearch)
2. Check environment variables in `.env.test`
3. Run migrations: `npm run migrate:test`
4. Clear test database: `dropdb ticket_resell_test && createdb ticket_resell_test`

### Slow Tests
1. Check database connection pooling
2. Verify test isolation (no shared state)
3. Use `--maxWorkers=1` for debugging

### Flaky Tests
1. Check for race conditions
2. Increase timeouts if needed
3. Ensure proper cleanup in `afterEach`/`afterAll`

## Contributing

When adding new features:
1. Write tests first (TDD approach)
2. Ensure all test suites pass
3. Maintain or improve coverage
4. Update this README if adding new test categories
