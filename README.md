# Ticket Resell Platform

A secure marketplace for buying and selling tickets for various events including concerts, transportation, sports events, and other entertainment.

## Features

- Secure ticket listing and purchasing
- User authentication and authorization
- Payment processing with escrow
- Fraud detection and ticket verification
- Rating and review system
- Real-time notifications
- Mobile-responsive design

## Tech Stack

- **Backend**: Node.js, Express.js, TypeScript
- **Database**: PostgreSQL, Redis
- **Search**: Elasticsearch
- **Payment**: Stripe
- **File Storage**: AWS S3
- **Authentication**: JWT

## Development Setup

### Prerequisites

- Node.js 18+
- Docker and Docker Compose
- npm or yarn

### Important: 431 Error Fix

This application includes a fix for "431 Request Header Fields Too Large" errors that can occur with large JWT tokens or cookies. The server is configured with increased header size limits (32KB instead of the default 8KB).

If you encounter 431 errors:
1. Clear browser cookies and local storage
2. Use the provided npm scripts which include the header size fix
3. See [Troubleshooting 431 Errors](src/docs/troubleshooting-431-errors.md) for detailed solutions

### Installation

1. Clone the repository
```bash
git clone <repository-url>
cd ticket-resell-platform
```

2. Install dependencies
```bash
npm install
```

3. Copy environment variables
```bash
cp .env.example .env
```

4. Start development services with Docker
```bash
npm run docker:up
```

5. Start the development server
```bash
npm run dev
```

The application will be available at `http://localhost:3000`

### Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build the application for production
- `npm run start` - Start production server
- `npm run test` - Run tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage report
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint errors
- `npm run format` - Format code with Prettier
- `npm run docker:up` - Start Docker services
- `npm run docker:down` - Stop Docker services

### Docker Services

The development environment includes:

- **PostgreSQL** (port 5432) - Main database
- **Redis** (port 6379) - Caching and sessions
- **Elasticsearch** (port 9200) - Search functionality

### Project Structure

```
src/
├── config/          # Configuration files
├── controllers/     # Route controllers
├── middleware/      # Express middleware
├── models/          # Data models
├── routes/          # API routes
├── services/        # Business logic
├── types/           # TypeScript type definitions
├── utils/           # Utility functions
└── test/            # Test setup and utilities
```

## API Documentation

API documentation will be available at `/api/docs` when the server is running.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## License

MIT License