import swaggerJSDoc from 'swagger-jsdoc';
import { SwaggerDefinition } from 'swagger-jsdoc';

// Swagger definition
const swaggerDefinition: SwaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'Ticket Resell Platform API',
    version: '1.0.0',
    description: 'A secure marketplace API for buying and selling tickets',
    contact: {
      name: 'API Support',
      email: 'support@ticket-platform.com'
    },
    license: {
      name: 'MIT',
      url: 'https://opensource.org/licenses/MIT'
    }
  },
  servers: [
    {
      url: process.env["API_BASE_URL"] || 'http://localhost:3000',
      description: 'Development server'
    },
    {
      url: 'https://api.ticket-platform.com',
      description: 'Production server'
    }
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT token for authentication'
      },
      apiKey: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
        description: 'API key for service-to-service authentication'
      }
    },
    schemas: {
      Error: {
        type: 'object',
        required: ['error'],
        properties: {
          error: {
            type: 'object',
            required: ['code', 'message', 'timestamp', 'requestId'],
            properties: {
              code: {
                type: 'string',
                description: 'Error code'
              },
              message: {
                type: 'string',
                description: 'Error message'
              },
              details: {
                type: 'object',
                description: 'Additional error details'
              },
              timestamp: {
                type: 'string',
                format: 'date-time',
                description: 'Error timestamp'
              },
              requestId: {
                type: 'string',
                description: 'Request correlation ID'
              },
              path: {
                type: 'string',
                description: 'Request path'
              },
              method: {
                type: 'string',
                description: 'HTTP method'
              }
            }
          }
        }
      },
      Success: {
        type: 'object',
        required: ['success', 'message', 'timestamp', 'requestId'],
        properties: {
          success: {
            type: 'boolean',
            example: true
          },
          message: {
            type: 'string',
            description: 'Success message'
          },
          data: {
            type: 'object',
            description: 'Response data'
          },
          timestamp: {
            type: 'string',
            format: 'date-time',
            description: 'Response timestamp'
          },
          requestId: {
            type: 'string',
            description: 'Request correlation ID'
          }
        }
      },
      User: {
        type: 'object',
        required: ['id', 'email', 'username', 'firstName', 'lastName'],
        properties: {
          id: {
            type: 'string',
            format: 'uuid',
            description: 'User unique identifier'
          },
          email: {
            type: 'string',
            format: 'email',
            description: 'User email address'
          },
          username: {
            type: 'string',
            description: 'User username'
          },
          firstName: {
            type: 'string',
            description: 'User first name'
          },
          lastName: {
            type: 'string',
            description: 'User last name'
          },
          phoneNumber: {
            type: 'string',
            description: 'User phone number'
          },
          profileImage: {
            type: 'string',
            format: 'uri',
            description: 'User profile image URL'
          },
          isVerified: {
            type: 'boolean',
            description: 'Whether user is verified'
          },
          rating: {
            type: 'number',
            minimum: 0,
            maximum: 5,
            description: 'User rating (0-5 stars)'
          },
          totalTransactions: {
            type: 'integer',
            minimum: 0,
            description: 'Total number of transactions'
          },
          status: {
            type: 'string',
            enum: ['active', 'suspended', 'banned'],
            description: 'User account status'
          },
          createdAt: {
            type: 'string',
            format: 'date-time',
            description: 'Account creation timestamp'
          },
          updatedAt: {
            type: 'string',
            format: 'date-time',
            description: 'Last update timestamp'
          }
        }
      },
      TicketListing: {
        type: 'object',
        required: ['id', 'sellerId', 'title', 'category', 'eventName', 'eventDate', 'quantity', 'askingPrice'],
        properties: {
          id: {
            type: 'string',
            format: 'uuid',
            description: 'Listing unique identifier'
          },
          sellerId: {
            type: 'string',
            format: 'uuid',
            description: 'Seller user ID'
          },
          title: {
            type: 'string',
            description: 'Listing title'
          },
          description: {
            type: 'string',
            description: 'Listing description'
          },
          category: {
            type: 'string',
            enum: ['concert', 'sports', 'theater', 'transportation', 'other'],
            description: 'Ticket category'
          },
          eventName: {
            type: 'string',
            description: 'Event name'
          },
          eventDate: {
            type: 'string',
            format: 'date-time',
            description: 'Event date and time'
          },
          eventTime: {
            type: 'string',
            description: 'Event time'
          },
          venue: {
            type: 'string',
            description: 'Event venue'
          },
          seatSection: {
            type: 'string',
            description: 'Seat section'
          },
          seatRow: {
            type: 'string',
            description: 'Seat row'
          },
          seatNumber: {
            type: 'string',
            description: 'Seat number'
          },
          quantity: {
            type: 'integer',
            minimum: 1,
            description: 'Number of tickets'
          },
          originalPrice: {
            type: 'number',
            minimum: 0,
            description: 'Original ticket price'
          },
          askingPrice: {
            type: 'number',
            minimum: 0,
            description: 'Asking price'
          },
          images: {
            type: 'array',
            items: {
              type: 'string',
              format: 'uri'
            },
            description: 'Ticket images'
          },
          status: {
            type: 'string',
            enum: ['active', 'sold', 'expired', 'suspended'],
            description: 'Listing status'
          },
          verificationStatus: {
            type: 'string',
            enum: ['pending', 'verified', 'rejected'],
            description: 'Verification status'
          },
          location: {
            type: 'object',
            properties: {
              city: { type: 'string' },
              state: { type: 'string' },
              country: { type: 'string' },
              coordinates: {
                type: 'array',
                items: { type: 'number' },
                minItems: 2,
                maxItems: 2
              }
            }
          },
          createdAt: {
            type: 'string',
            format: 'date-time',
            description: 'Creation timestamp'
          },
          updatedAt: {
            type: 'string',
            format: 'date-time',
            description: 'Last update timestamp'
          }
        }
      },
      Transaction: {
        type: 'object',
        required: ['id', 'listingId', 'buyerId', 'sellerId', 'quantity', 'totalAmount', 'status'],
        properties: {
          id: {
            type: 'string',
            format: 'uuid',
            description: 'Transaction unique identifier'
          },
          listingId: {
            type: 'string',
            format: 'uuid',
            description: 'Associated listing ID'
          },
          buyerId: {
            type: 'string',
            format: 'uuid',
            description: 'Buyer user ID'
          },
          sellerId: {
            type: 'string',
            format: 'uuid',
            description: 'Seller user ID'
          },
          quantity: {
            type: 'integer',
            minimum: 1,
            description: 'Number of tickets purchased'
          },
          totalAmount: {
            type: 'number',
            minimum: 0,
            description: 'Total transaction amount'
          },
          platformFee: {
            type: 'number',
            minimum: 0,
            description: 'Platform fee amount'
          },
          paymentIntentId: {
            type: 'string',
            description: 'Payment gateway transaction ID'
          },
          status: {
            type: 'string',
            enum: ['pending', 'paid', 'confirmed', 'disputed', 'completed', 'cancelled'],
            description: 'Transaction status'
          },
          escrowReleaseDate: {
            type: 'string',
            format: 'date-time',
            description: 'Escrow release date'
          },
          disputeReason: {
            type: 'string',
            description: 'Dispute reason if applicable'
          },
          resolutionNotes: {
            type: 'string',
            description: 'Resolution notes'
          },
          createdAt: {
            type: 'string',
            format: 'date-time',
            description: 'Creation timestamp'
          },
          updatedAt: {
            type: 'string',
            format: 'date-time',
            description: 'Last update timestamp'
          }
        }
      },
      Review: {
        type: 'object',
        required: ['id', 'transactionId', 'reviewerId', 'revieweeId', 'rating', 'type'],
        properties: {
          id: {
            type: 'string',
            format: 'uuid',
            description: 'Review unique identifier'
          },
          transactionId: {
            type: 'string',
            format: 'uuid',
            description: 'Associated transaction ID'
          },
          reviewerId: {
            type: 'string',
            format: 'uuid',
            description: 'Reviewer user ID'
          },
          revieweeId: {
            type: 'string',
            format: 'uuid',
            description: 'Reviewee user ID'
          },
          rating: {
            type: 'integer',
            minimum: 1,
            maximum: 5,
            description: 'Rating (1-5 stars)'
          },
          comment: {
            type: 'string',
            description: 'Review comment'
          },
          type: {
            type: 'string',
            enum: ['buyer_to_seller', 'seller_to_buyer'],
            description: 'Review type'
          },
          isVisible: {
            type: 'boolean',
            description: 'Whether review is visible'
          },
          createdAt: {
            type: 'string',
            format: 'date-time',
            description: 'Creation timestamp'
          }
        }
      }
    },
    responses: {
      BadRequest: {
        description: 'Bad Request',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' }
          }
        }
      },
      Unauthorized: {
        description: 'Unauthorized',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' }
          }
        }
      },
      Forbidden: {
        description: 'Forbidden',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' }
          }
        }
      },
      NotFound: {
        description: 'Not Found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' }
          }
        }
      },
      Conflict: {
        description: 'Conflict',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' }
          }
        }
      },
      TooManyRequests: {
        description: 'Too Many Requests',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' }
          }
        }
      },
      InternalServerError: {
        description: 'Internal Server Error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' }
          }
        }
      }
    },
    parameters: {
      CorrelationId: {
        name: 'X-Correlation-ID',
        in: 'header',
        description: 'Request correlation ID for tracing',
        schema: {
          type: 'string',
          format: 'uuid'
        }
      },
      ApiVersion: {
        name: 'API-Version',
        in: 'header',
        description: 'API version',
        schema: {
          type: 'string',
          default: 'v1'
        }
      }
    }
  },
  tags: [
    {
      name: 'Authentication',
      description: 'User authentication and authorization'
    },
    {
      name: 'Users',
      description: 'User management operations'
    },
    {
      name: 'Listings',
      description: 'Ticket listing operations'
    },
    {
      name: 'Search',
      description: 'Search and filtering operations'
    },
    {
      name: 'Payments',
      description: 'Payment processing operations'
    },
    {
      name: 'Reviews',
      description: 'Rating and review operations'
    },
    {
      name: 'Notifications',
      description: 'Notification management'
    },
    {
      name: 'Fraud',
      description: 'Fraud detection and prevention'
    },
    {
      name: 'Health',
      description: 'System health and monitoring'
    }
  ]
};

// Options for swagger-jsdoc
const swaggerOptions = {
  definition: swaggerDefinition,
  apis: [
    './src/routes/*.ts',
    './src/controllers/*.ts',
    './src/models/*.ts'
  ]
};

// Generate swagger specification
export const swaggerSpec = swaggerJSDoc(swaggerOptions);

// Swagger UI options
export const swaggerUiOptions = {
  explorer: true,
  swaggerOptions: {
    docExpansion: 'none',
    filter: true,
    showRequestHeaders: true,
    showCommonExtensions: true,
    tryItOutEnabled: true
  },
  customCss: `
    .swagger-ui .topbar { display: none }
    .swagger-ui .info { margin: 20px 0 }
    .swagger-ui .scheme-container { background: #fafafa; padding: 10px; border-radius: 4px; }
  `,
  customSiteTitle: 'Ticket Platform API Documentation'
};