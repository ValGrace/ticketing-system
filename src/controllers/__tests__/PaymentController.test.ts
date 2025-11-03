import request from 'supertest';
import express from 'express';
import { PaymentController } from '../PaymentController';
import { PaymentService } from '../../services/PaymentService';
import { MpesaCallbackResponse } from '../../types';

// Extend Express Request interface to include user property
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        email: string;
        username: string;
        role: string;
      };
    }
  }
}

// Mock the PaymentService
jest.mock('../../services/PaymentService');

describe('PaymentController', () => {
  let app: express.Application;
  let mockPaymentService: jest.Mocked<PaymentService>;
  let paymentController: PaymentController;

  beforeEach(() => {
    jest.clearAllMocks();

    mockPaymentService = {
      initiatePayment: jest.fn(),
      processPaymentCallback: jest.fn(),
      confirmTicketTransfer: jest.fn(),
      fileDispute: jest.fn(),
      processRefund: jest.fn(),
      processEscrowReleases: jest.fn()
    } as any;

    paymentController = new PaymentController(mockPaymentService);

    app = express();
    app.use(express.json());

    // Mock authentication middleware
    app.use((req, _res, next) => {
      req.user = { userId: 'user-1', email: 'test@example.com', username: 'testuser', role: 'user' };
      next();
    });

    // Setup routes
    app.post('/payments/initiate', paymentController.initiatePayment);
    app.post('/payments/mpesa/callback', paymentController.handleMpesaCallback);
    app.post('/payments/mpesa/timeout', paymentController.handleMpesaTimeout);
    app.post('/payments/transactions/:transactionId/confirm', paymentController.confirmTransfer);
    app.post('/payments/transactions/:transactionId/dispute', paymentController.fileDispute);
    app.post('/payments/transactions/:transactionId/refund', paymentController.requestRefund);
    app.get('/payments/transactions/:transactionId/status', paymentController.getTransactionStatus);
    app.post('/payments/escrow/release', paymentController.processEscrowReleases);
  });

  describe('POST /payments/initiate', () => {
    const validRequest = {
      listingId: 'listing-1',
      quantity: 1,
      phoneNumber: '254712345678'
    };

    it('should initiate payment successfully', async () => {
      const mockResponse = {
        transactionId: 'transaction-1',
        checkoutRequestId: 'checkout-123',
        message: 'Check your phone'
      };

      mockPaymentService.initiatePayment.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/payments/initiate')
        .send(validRequest);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: mockResponse
      });

      expect(mockPaymentService.initiatePayment).toHaveBeenCalledWith({
        ...validRequest,
        buyerId: 'user-1'
      });
    });

    it('should return 400 for missing fields', async () => {
      const response = await request(app)
        .post('/payments/initiate')
        .send({ listingId: 'listing-1' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Missing required fields');
    });

    it('should return 400 for invalid quantity', async () => {
      const response = await request(app)
        .post('/payments/initiate')
        .send({ ...validRequest, quantity: 0 });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Quantity must be greater than 0');
    });

    it('should handle service errors', async () => {
      mockPaymentService.initiatePayment.mockRejectedValue(new Error('Service error'));

      const response = await request(app)
        .post('/payments/initiate')
        .send(validRequest);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Service error');
    });
  });

  describe('POST /payments/mpesa/callback', () => {
    const mockCallback: MpesaCallbackResponse = {
      Body: {
        stkCallback: {
          MerchantRequestID: 'merchant-123',
          CheckoutRequestID: 'checkout-123',
          ResultCode: 0,
          ResultDesc: 'Success'
        }
      }
    };

    it('should process callback successfully', async () => {
      const mockResult = {
        success: true,
        transactionId: 'transaction-1',
        mpesaReceiptNumber: 'ABC123'
      };

      mockPaymentService.processPaymentCallback.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/payments/mpesa/callback')
        .send(mockCallback);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        ResultCode: 0,
        ResultDesc: 'Callback processed successfully'
      });

      expect(mockPaymentService.processPaymentCallback).toHaveBeenCalledWith(mockCallback);
    });

    it('should handle callback processing errors gracefully', async () => {
      mockPaymentService.processPaymentCallback.mockRejectedValue(new Error('Processing error'));

      const response = await request(app)
        .post('/payments/mpesa/callback')
        .send(mockCallback);

      // Should still return success to prevent M-Pesa retries
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        ResultCode: 0,
        ResultDesc: 'Callback received'
      });
    });
  });

  describe('POST /payments/transactions/:transactionId/confirm', () => {
    it('should confirm transfer successfully', async () => {
      mockPaymentService.confirmTicketTransfer.mockResolvedValue(true);

      const response = await request(app)
        .post('/payments/transactions/transaction-1/confirm');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        message: 'Ticket transfer confirmed and payment released'
      });

      expect(mockPaymentService.confirmTicketTransfer).toHaveBeenCalledWith('transaction-1', 'user-1');
    });

    it('should handle confirmation failure', async () => {
      mockPaymentService.confirmTicketTransfer.mockResolvedValue(false);

      const response = await request(app)
        .post('/payments/transactions/transaction-1/confirm');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to confirm transfer');
    });

    it('should handle service errors', async () => {
      mockPaymentService.confirmTicketTransfer.mockRejectedValue(new Error('Service error'));

      const response = await request(app)
        .post('/payments/transactions/transaction-1/confirm');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Service error');
    });
  });

  describe('POST /payments/transactions/:transactionId/dispute', () => {
    const validDispute = {
      reason: 'ticket_not_received',
      description: 'Seller did not provide tickets after payment'
    };

    it('should file dispute successfully', async () => {
      const mockDisputeCase = {
        id: 'dispute-1',
        transactionId: 'transaction-1',
        reporterId: 'user-1',
        reportedId: 'seller-1',
        reason: 'ticket_not_received',
        description: 'Seller did not provide tickets after payment',
        status: 'open' as const,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockPaymentService.fileDispute.mockResolvedValue(mockDisputeCase);

      const response = await request(app)
        .post('/payments/transactions/transaction-1/dispute')
        .send(validDispute);

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        success: true,
        data: mockDisputeCase,
        message: 'Dispute filed successfully'
      });

      expect(mockPaymentService.fileDispute).toHaveBeenCalledWith(
        'transaction-1',
        'user-1',
        'ticket_not_received',
        'Seller did not provide tickets after payment'
      );
    });

    it('should return 400 for missing fields', async () => {
      const response = await request(app)
        .post('/payments/transactions/transaction-1/dispute')
        .send({ reason: 'ticket_not_received' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Missing required fields');
    });
  });

  describe('POST /payments/transactions/:transactionId/refund', () => {
    it('should request refund successfully', async () => {
      const mockRefundRequest = {
        id: 'refund-1',
        transactionId: 'transaction-1',
        requesterId: 'user-1',
        amount: 120,
        reason: 'event_cancelled',
        status: 'pending' as const,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockPaymentService.processRefund.mockResolvedValue(mockRefundRequest);

      const response = await request(app)
        .post('/payments/transactions/transaction-1/refund')
        .send({ reason: 'event_cancelled' });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        success: true,
        data: mockRefundRequest,
        message: 'Refund request submitted successfully'
      });

      expect(mockPaymentService.processRefund).toHaveBeenCalledWith('transaction-1', 'event_cancelled');
    });

    it('should return 400 for missing reason', async () => {
      const response = await request(app)
        .post('/payments/transactions/transaction-1/refund')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Missing required fields');
    });
  });

  describe('GET /payments/transactions/:transactionId/status', () => {
    it('should get transaction status', async () => {
      const response = await request(app)
        .get('/payments/transactions/transaction-1/status');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.transactionId).toBe('transaction-1');
    });
  });

  describe('POST /payments/escrow/release', () => {
    beforeEach(() => {
      // Mock admin user
      app.use((req, _res, next) => {
        req.user = { userId: 'admin-1', email: 'admin@example.com', username: 'admin', role: 'admin' };
        next();
      });
    });

    it('should process escrow releases successfully', async () => {
      const mockResults = [
        {
          success: true,
          transactionId: 'transaction-1',
          amountReleased: 114
        }
      ];

      mockPaymentService.processEscrowReleases.mockResolvedValue(mockResults);

      const response = await request(app)
        .post('/payments/escrow/release');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: {
          processed: 1,
          successful: 1,
          failed: 0,
          results: mockResults
        }
      });
    });

    it('should return 403 for non-admin users', async () => {
      // Override with regular user
      app.use((req, _res, next) => {
        req.user = { userId: 'user-1', email: 'test@example.com', username: 'testuser', role: 'user' };
        next();
      });

      const response = await request(app)
        .post('/payments/escrow/release');

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Admin access required');
    });
  });

  describe('Authentication', () => {
    beforeEach(() => {
      // Remove authentication middleware
      app = express();
      app.use(express.json());
      app.post('/payments/initiate', paymentController.initiatePayment);
    });

    it('should return 401 for unauthenticated requests', async () => {
      const response = await request(app)
        .post('/payments/initiate')
        .send({
          listingId: 'listing-1',
          quantity: 1,
          phoneNumber: '254712345678'
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Authentication required');
    });
  });
});