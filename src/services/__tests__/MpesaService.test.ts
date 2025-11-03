import { MpesaService } from '../MpesaService';
import { MpesaCallbackResponse, PaymentRequest } from '../../types';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock the config
jest.mock('../../config/mpesa', () => ({
  mpesaConfig: {
    consumerKey: 'test_consumer_key',
    consumerSecret: 'test_consumer_secret',
    environment: 'sandbox',
    shortCode: '174379',
    passkey: 'test_passkey',
    callbackUrl: 'http://localhost:3000/api/payments/mpesa/callback',
    timeoutUrl: 'http://localhost:3000/api/payments/mpesa/timeout',
    baseUrl: 'https://sandbox.safaricom.co.ke'
  },
  validateMpesaConfig: jest.fn()
}));

describe('MpesaService', () => {
  let mpesaService: MpesaService;
  let mockAxiosInstance: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockAxiosInstance = {
      get: jest.fn(),
      post: jest.fn()
    };
    
    mockedAxios.create.mockReturnValue(mockAxiosInstance);
    mpesaService = new MpesaService();
  });

  describe('initiateSTKPush', () => {
    const mockPaymentRequest: PaymentRequest = {
      transactionId: 'test-transaction-id',
      amount: 100,
      phoneNumber: '254712345678',
      description: 'Test payment'
    };

    beforeEach(() => {
      // Mock access token request
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          access_token: 'mock_access_token',
          expires_in: 3600
        }
      });
    });

    it('should successfully initiate STK push', async () => {
      const mockSTKResponse = {
        MerchantRequestID: 'mock_merchant_id',
        CheckoutRequestID: 'mock_checkout_id',
        ResponseCode: '0',
        ResponseDescription: 'Success',
        CustomerMessage: 'Check your phone'
      };

      mockAxiosInstance.post.mockResolvedValue({
        data: mockSTKResponse
      });

      const result = await mpesaService.initiateSTKPush(mockPaymentRequest);

      expect(result).toEqual(mockSTKResponse);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/oauth/v1/generate?grant_type=client_credentials',
        expect.any(Object)
      );
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/mpesa/stkpush/v1/processrequest',
        expect.objectContaining({
          BusinessShortCode: '174379',
          TransactionType: 'CustomerPayBillOnline',
          Amount: 100,
          PartyA: '254712345678',
          PhoneNumber: '254712345678',
          AccountReference: 'test-transaction-id'
        }),
        expect.any(Object)
      );
    });

    it('should format phone numbers correctly', async () => {
      const testCases = [
        { input: '0712345678', expected: '254712345678' },
        { input: '254712345678', expected: '254712345678' },
        { input: '712345678', expected: '254712345678' },
        { input: '+254712345678', expected: '254712345678' }
      ];

      mockAxiosInstance.post.mockResolvedValue({
        data: { CheckoutRequestID: 'test' }
      });

      for (const testCase of testCases) {
        const request = { ...mockPaymentRequest, phoneNumber: testCase.input };
        await mpesaService.initiateSTKPush(request);

        expect(mockAxiosInstance.post).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            PartyA: testCase.expected,
            PhoneNumber: testCase.expected
          }),
          expect.any(Object)
        );
      }
    });

    it('should throw error for invalid phone number', async () => {
      const invalidRequest = { ...mockPaymentRequest, phoneNumber: '123' };

      await expect(mpesaService.initiateSTKPush(invalidRequest))
        .rejects.toThrow('Invalid phone number format');
    });

    it('should handle API errors', async () => {
      mockAxiosInstance.post.mockRejectedValue({
        response: {
          data: {
            errorMessage: 'Invalid request'
          }
        }
      });

      await expect(mpesaService.initiateSTKPush(mockPaymentRequest))
        .rejects.toThrow('Payment initiation failed: Invalid request');
    });

    it('should cache access token', async () => {
      mockAxiosInstance.post.mockResolvedValue({
        data: { CheckoutRequestID: 'test' }
      });

      // First call
      await mpesaService.initiateSTKPush(mockPaymentRequest);
      // Second call
      await mpesaService.initiateSTKPush(mockPaymentRequest);

      // Access token should only be requested once
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1);
    });
  });

  describe('processCallback', () => {
    it('should process successful callback', () => {
      const mockCallback: MpesaCallbackResponse = {
        Body: {
          stkCallback: {
            MerchantRequestID: 'merchant_id',
            CheckoutRequestID: 'checkout_id',
            ResultCode: 0,
            ResultDesc: 'Success',
            CallbackMetadata: {
              Item: [
                { Name: 'MpesaReceiptNumber', Value: 'ABC123' },
                { Name: 'Amount', Value: 100 },
                { Name: 'PhoneNumber', Value: '254712345678' }
              ]
            }
          }
        }
      };

      const result = mpesaService.processCallback(mockCallback);

      expect(result).toEqual({
        success: true,
        transactionId: '',
        mpesaReceiptNumber: 'ABC123',
        amount: 100,
        phoneNumber: '254712345678'
      });
    });

    it('should process failed callback', () => {
      const mockCallback: MpesaCallbackResponse = {
        Body: {
          stkCallback: {
            MerchantRequestID: 'merchant_id',
            CheckoutRequestID: 'checkout_id',
            ResultCode: 1,
            ResultDesc: 'Payment failed'
          }
        }
      };

      const result = mpesaService.processCallback(mockCallback);

      expect(result).toEqual({
        success: false,
        transactionId: '',
        error: 'Payment failed'
      });
    });
  });

  describe('validateCallback', () => {
    it('should validate correct callback structure', () => {
      const validCallback: MpesaCallbackResponse = {
        Body: {
          stkCallback: {
            MerchantRequestID: 'merchant_id',
            CheckoutRequestID: 'checkout_id',
            ResultCode: 0,
            ResultDesc: 'Success'
          }
        }
      };

      expect(mpesaService.validateCallback(validCallback)).toBe(true);
    });

    it('should reject invalid callback structure', () => {
      const invalidCallback = {
        Body: {
          stkCallback: {
            MerchantRequestID: 'merchant_id'
            // Missing required fields
          }
        }
      } as any;

      expect(mpesaService.validateCallback(invalidCallback)).toBe(false);
    });
  });

  describe('querySTKPushStatus', () => {
    beforeEach(() => {
      mockAxiosInstance.get.mockResolvedValue({
        data: { access_token: 'mock_token', expires_in: 3600 }
      });
    });

    it('should query STK push status', async () => {
      const mockResponse = {
        ResultCode: '0',
        ResultDesc: 'Success'
      };

      mockAxiosInstance.post.mockResolvedValue({
        data: mockResponse
      });

      const result = await mpesaService.querySTKPushStatus('checkout_id');

      expect(result).toEqual(mockResponse);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/mpesa/stkpushquery/v1/query',
        expect.objectContaining({
          CheckoutRequestID: 'checkout_id'
        }),
        expect.any(Object)
      );
    });
  });

  describe('healthCheck', () => {
    it('should return true when service is available', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: { access_token: 'token', expires_in: 3600 }
      });

      const result = await mpesaService.healthCheck();

      expect(result).toBe(true);
    });

    it('should return false when service is unavailable', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('Network error'));

      const result = await mpesaService.healthCheck();

      expect(result).toBe(false);
    });
  });
});