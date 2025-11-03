import { PaymentService, PaymentInitiationRequest } from '../PaymentService';
import { MpesaService } from '../MpesaService';
import { TransactionRepository } from '../../models/TransactionRepository';
import { TicketListingRepository } from '../../models/TicketListingRepository';
import { UserRepository } from '../../models/UserRepository';
import { DatabaseConnection, Transaction, TicketListing, User, MpesaCallbackResponse } from '../../types';

// Mock the MpesaService
jest.mock('../MpesaService');

describe('PaymentService', () => {
  let paymentService: PaymentService;
  let mockConnection: jest.Mocked<DatabaseConnection>;
  let mockTransactionRepo: jest.Mocked<TransactionRepository>;
  let mockListingRepo: jest.Mocked<TicketListingRepository>;
  let mockUserRepo: jest.Mocked<UserRepository>;
  let mockMpesaService: jest.Mocked<MpesaService>;

  const mockUser: User = {
    id: 'user-1',
    email: 'test@example.com',
    username: 'testuser',
    firstName: 'Test',
    lastName: 'User',
    isVerified: true,
    rating: 4.5,
    totalTransactions: 5,
    role: 'user',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const mockListing: TicketListing = {
    id: 'listing-1',
    sellerId: 'seller-1',
    title: 'Concert Ticket',
    description: 'Great seats',
    category: 'concert',
    eventName: 'Test Concert',
    eventDate: new Date('2024-12-31'),
    eventTime: '20:00',
    venue: 'Test Venue',
    quantity: 2,
    originalPrice: 100,
    askingPrice: 120,
    images: [],
    status: 'active',
    verificationStatus: 'verified',
    location: {
      city: 'Nairobi',
      state: 'Nairobi',
      country: 'Kenya'
    },
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const mockTransaction: Transaction = {
    id: 'transaction-1',
    listingId: 'listing-1',
    buyerId: 'user-1',
    sellerId: 'seller-1',
    quantity: 1,
    totalAmount: 120,
    platformFee: 6,
    paymentIntentId: 'checkout-123',
    status: 'pending',
    escrowReleaseDate: new Date(),
    createdAt: new Date(),
    updatedAt: new Date()
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockConnection = {
      query: jest.fn(),
      transaction: jest.fn(),
      close: jest.fn()
    };

    mockTransactionRepo = {
      create: jest.fn(),
      findById: jest.fn(),
      findByPaymentIntentId: jest.fn(),
      updateStatus: jest.fn(),
      updatePaymentIntentId: jest.fn(),
      addDispute: jest.fn(),
      findEscrowReleaseDue: jest.fn(),
      incrementTransactionCount: jest.fn()
    } as any;

    mockListingRepo = {
      findById: jest.fn()
    } as any;

    mockUserRepo = {
      findById: jest.fn(),
      incrementTransactionCount: jest.fn()
    } as any;

    // Mock the transaction wrapper to execute the callback immediately
    mockConnection.transaction.mockImplementation(async (callback) => {
      return await callback(mockConnection);
    });

    paymentService = new PaymentService(
      mockConnection,
      mockTransactionRepo,
      mockListingRepo,
      mockUserRepo
    );

    // Get the mocked MpesaService instance
    mockMpesaService = jest.mocked(MpesaService.prototype);
  });

  describe('initiatePayment', () => {
    const mockRequest: PaymentInitiationRequest = {
      listingId: 'listing-1',
      buyerId: 'user-1',
      quantity: 1,
      phoneNumber: '254712345678'
    };

    beforeEach(() => {
      mockListingRepo.findById.mockResolvedValue(mockListing);
      mockUserRepo.findById.mockResolvedValue(mockUser);
      mockTransactionRepo.create.mockResolvedValue(mockTransaction);
      mockMpesaService.initiateSTKPush.mockResolvedValue({
        MerchantRequestID: 'merchant-123',
        CheckoutRequestID: 'checkout-123',
        ResponseCode: '0',
        ResponseDescription: 'Success',
        CustomerMessage: 'Check your phone'
      });
      mockTransactionRepo.updatePaymentIntentId.mockResolvedValue(true);
    });

    it('should successfully initiate payment', async () => {
      const result = await paymentService.initiatePayment(mockRequest);

      expect(result).toEqual({
        transactionId: 'transaction-1',
        checkoutRequestId: 'checkout-123',
        message: 'Check your phone'
      });

      expect(mockListingRepo.findById).toHaveBeenCalledWith('listing-1');
      expect(mockUserRepo.findById).toHaveBeenCalledWith('user-1');
      expect(mockTransactionRepo.create).toHaveBeenCalledWith({
        listingId: 'listing-1',
        buyerId: 'user-1',
        sellerId: 'seller-1',
        quantity: 1,
        totalAmount: 120,
        platformFee: 6
      });
      expect(mockMpesaService.initiateSTKPush).toHaveBeenCalled();
    });

    it('should throw error if listing not found', async () => {
      mockListingRepo.findById.mockResolvedValue(null);

      await expect(paymentService.initiatePayment(mockRequest))
        .rejects.toThrow('Listing not found');
    });

    it('should throw error if listing is not active', async () => {
      mockListingRepo.findById.mockResolvedValue({
        ...mockListing,
        status: 'sold'
      });

      await expect(paymentService.initiatePayment(mockRequest))
        .rejects.toThrow('Listing is not available for purchase');
    });

    it('should throw error if insufficient quantity', async () => {
      mockListingRepo.findById.mockResolvedValue({
        ...mockListing,
        quantity: 0
      });

      await expect(paymentService.initiatePayment(mockRequest))
        .rejects.toThrow('Insufficient ticket quantity available');
    });

    it('should throw error if buyer not found', async () => {
      mockUserRepo.findById.mockResolvedValue(null);

      await expect(paymentService.initiatePayment(mockRequest))
        .rejects.toThrow('Buyer not found');
    });

    it('should throw error if buyer account is not active', async () => {
      mockUserRepo.findById.mockResolvedValue({
        ...mockUser,
        status: 'suspended'
      });

      await expect(paymentService.initiatePayment(mockRequest))
        .rejects.toThrow('Buyer account is not active');
    });

    it('should cancel transaction if M-Pesa initiation fails', async () => {
      mockMpesaService.initiateSTKPush.mockRejectedValue(new Error('M-Pesa error'));
      mockTransactionRepo.updateStatus.mockResolvedValue(true);

      await expect(paymentService.initiatePayment(mockRequest))
        .rejects.toThrow('M-Pesa error');

      expect(mockTransactionRepo.updateStatus).toHaveBeenCalledWith('transaction-1', 'cancelled');
    });
  });

  describe('processPaymentCallback', () => {
    const mockSuccessCallback: MpesaCallbackResponse = {
      Body: {
        stkCallback: {
          MerchantRequestID: 'merchant-123',
          CheckoutRequestID: 'checkout-123',
          ResultCode: 0,
          ResultDesc: 'Success',
          CallbackMetadata: {
            Item: [
              { Name: 'MpesaReceiptNumber', Value: 'ABC123' },
              { Name: 'Amount', Value: 120 },
              { Name: 'PhoneNumber', Value: '254712345678' }
            ]
          }
        }
      }
    };

    beforeEach(() => {
      mockMpesaService.validateCallback.mockReturnValue(true);
      mockTransactionRepo.findByPaymentIntentId.mockResolvedValue(mockTransaction);
      mockConnection.query.mockResolvedValue([]);
    });

    it('should process successful payment callback', async () => {
      mockMpesaService.processCallback.mockReturnValue({
        success: true,
        transactionId: '',
        mpesaReceiptNumber: 'ABC123',
        amount: 120,
        phoneNumber: '254712345678'
      });

      const result = await paymentService.processPaymentCallback(mockSuccessCallback);

      expect(result).toEqual({
        success: true,
        transactionId: 'transaction-1',
        mpesaReceiptNumber: 'ABC123',
        amount: 120,
        phoneNumber: '254712345678'
      });

      expect(mockTransactionRepo.updateStatus).toHaveBeenCalledWith('transaction-1', 'paid');
      expect(mockUserRepo.incrementTransactionCount).toHaveBeenCalledTimes(2);
    });

    it('should process failed payment callback', async () => {
      mockMpesaService.processCallback.mockReturnValue({
        success: false,
        transactionId: '',
        error: 'Payment failed'
      });

      const result = await paymentService.processPaymentCallback(mockSuccessCallback);

      expect(result).toEqual({
        success: false,
        transactionId: 'transaction-1',
        error: 'Payment failed'
      });

      expect(mockTransactionRepo.updateStatus).toHaveBeenCalledWith('transaction-1', 'cancelled');
    });

    it('should throw error for invalid callback', async () => {
      mockMpesaService.validateCallback.mockReturnValue(false);

      await expect(paymentService.processPaymentCallback(mockSuccessCallback))
        .rejects.toThrow('Invalid callback data');
    });

    it('should throw error if transaction not found', async () => {
      mockTransactionRepo.findByPaymentIntentId.mockResolvedValue(null);

      await expect(paymentService.processPaymentCallback(mockSuccessCallback))
        .rejects.toThrow('Transaction not found for checkout request ID');
    });
  });

  describe('confirmTicketTransfer', () => {
    beforeEach(() => {
      mockTransactionRepo.findById.mockResolvedValue({
        ...mockTransaction,
        status: 'paid'
      });
      mockTransactionRepo.updateStatus.mockResolvedValue(true);
      mockConnection.query.mockResolvedValue([{ rowCount: 1 }]);
    });

    it('should confirm ticket transfer successfully', async () => {
      const result = await paymentService.confirmTicketTransfer('transaction-1', 'user-1');

      expect(result).toBe(true);
      expect(mockTransactionRepo.updateStatus).toHaveBeenCalledWith('transaction-1', 'confirmed');
      expect(mockTransactionRepo.updateStatus).toHaveBeenCalledWith('transaction-1', 'completed');
    });

    it('should throw error if transaction not found', async () => {
      mockTransactionRepo.findById.mockResolvedValue(null);

      await expect(paymentService.confirmTicketTransfer('transaction-1', 'user-1'))
        .rejects.toThrow('Transaction not found');
    });

    it('should throw error if confirmer is not the buyer', async () => {
      await expect(paymentService.confirmTicketTransfer('transaction-1', 'wrong-user'))
        .rejects.toThrow('Only the buyer can confirm ticket transfer');
    });

    it('should throw error if transaction is not in paid status', async () => {
      mockTransactionRepo.findById.mockResolvedValue({
        ...mockTransaction,
        status: 'pending'
      });

      await expect(paymentService.confirmTicketTransfer('transaction-1', 'user-1'))
        .rejects.toThrow('Transaction is not in paid status');
    });
  });

  describe('fileDispute', () => {
    beforeEach(() => {
      mockTransactionRepo.findById.mockResolvedValue({
        ...mockTransaction,
        status: 'paid'
      });
      mockTransactionRepo.addDispute.mockResolvedValue(true);
      mockConnection.query.mockResolvedValue([]);
    });

    it('should file dispute successfully', async () => {
      const result = await paymentService.fileDispute(
        'transaction-1',
        'user-1',
        'ticket_not_received',
        'Seller did not provide tickets'
      );

      expect(result).toMatchObject({
        transactionId: 'transaction-1',
        reporterId: 'user-1',
        reportedId: 'seller-1',
        reason: 'ticket_not_received',
        description: 'Seller did not provide tickets',
        status: 'open'
      });

      expect(mockTransactionRepo.addDispute).toHaveBeenCalledWith(
        'transaction-1',
        'ticket_not_received'
      );
    });

    it('should throw error if transaction not found', async () => {
      mockTransactionRepo.findById.mockResolvedValue(null);

      await expect(paymentService.fileDispute('transaction-1', 'user-1', 'reason', 'description'))
        .rejects.toThrow('Transaction not found');
    });

    it('should throw error if reporter is not part of transaction', async () => {
      await expect(paymentService.fileDispute('transaction-1', 'wrong-user', 'reason', 'description'))
        .rejects.toThrow('Only transaction participants can file disputes');
    });
  });

  describe('processEscrowReleases', () => {
    beforeEach(() => {
      mockTransactionRepo.findEscrowReleaseDue.mockResolvedValue([mockTransaction]);
      mockTransactionRepo.updateStatus.mockResolvedValue(true);
      mockConnection.query.mockResolvedValue([{ rowCount: 1 }]);
    });

    it('should process escrow releases successfully', async () => {
      const results = await paymentService.processEscrowReleases();

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        success: true,
        transactionId: 'transaction-1',
        amountReleased: 114 // totalAmount - platformFee
      });

      expect(mockTransactionRepo.updateStatus).toHaveBeenCalledWith('transaction-1', 'completed');
    });

    it('should handle errors during escrow release', async () => {
      mockConnection.query.mockRejectedValue(new Error('Database error'));

      const results = await paymentService.processEscrowReleases();

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        success: false,
        transactionId: 'transaction-1',
        amountReleased: 0,
        error: 'Database error'
      });
    });
  });
});