import axios from 'axios';
import { mpesaConfig, validateMpesaConfig } from '../config/mpesa';
import { 
  MpesaSTKPushRequest, 
  MpesaSTKPushResponse, 
  MpesaCallbackResponse,
  PaymentRequest,
  PaymentResult 
} from '../types';

export class MpesaService {
  private axiosInstance: any;
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;

  constructor() {
    validateMpesaConfig();
    
    this.axiosInstance = axios.create({
      baseURL: mpesaConfig.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Get OAuth access token from M-Pesa API
   */
  private async getAccessToken(): Promise<string> {
    // Return cached token if still valid
    if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      const credentials = Buffer.from(
        `${mpesaConfig.consumerKey}:${mpesaConfig.consumerSecret}`
      ).toString('base64');

      const response = await this.axiosInstance.get('/oauth/v1/generate?grant_type=client_credentials', {
        headers: {
          Authorization: `Basic ${credentials}`,
        },
      });

      this.accessToken = response.data.access_token;
      
      // Set token expiry (M-Pesa tokens typically expire in 1 hour)
      this.tokenExpiry = new Date();
      this.tokenExpiry.setSeconds(this.tokenExpiry.getSeconds() + (response.data.expires_in || 3600));

      return this.accessToken!;
    } catch (error) {
      console.error('Failed to get M-Pesa access token:', error);
      throw new Error('Failed to authenticate with M-Pesa API');
    }
  }

  /**
   * Generate password for STK Push request
   */
  private generatePassword(): { password: string; timestamp: string } {
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, -3);
    const password = Buffer.from(
      `${mpesaConfig.shortCode}${mpesaConfig.passkey}${timestamp}`
    ).toString('base64');

    return { password, timestamp };
  }

  /**
   * Format phone number to M-Pesa format (254XXXXXXXXX)
   */
  private formatPhoneNumber(phoneNumber: string): string {
    // Remove any non-digit characters
    let cleaned = phoneNumber.replace(/\D/g, '');
    
    // Handle different formats
    if (cleaned.startsWith('0')) {
      cleaned = '254' + cleaned.slice(1);
    } else if (cleaned.startsWith('254')) {
      // Already in correct format
    } else if (cleaned.startsWith('7') || cleaned.startsWith('1')) {
      cleaned = '254' + cleaned;
    }
    
    // Validate length (should be 12 digits for Kenya)
    if (cleaned.length !== 12 || !cleaned.startsWith('254')) {
      throw new Error('Invalid phone number format. Use format: 254XXXXXXXXX');
    }
    
    return cleaned;
  }

  /**
   * Initiate STK Push payment request
   */
  async initiateSTKPush(paymentRequest: PaymentRequest): Promise<MpesaSTKPushResponse> {
    try {
      const accessToken = await this.getAccessToken();
      const { password, timestamp } = this.generatePassword();
      const formattedPhone = this.formatPhoneNumber(paymentRequest.phoneNumber);

      const stkPushRequest: MpesaSTKPushRequest = {
        BusinessShortCode: mpesaConfig.shortCode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: Math.round(paymentRequest.amount), // M-Pesa requires integer amounts
        PartyA: formattedPhone,
        PartyB: mpesaConfig.shortCode,
        PhoneNumber: formattedPhone,
        CallBackURL: mpesaConfig.callbackUrl,
        AccountReference: paymentRequest.transactionId,
        TransactionDesc: paymentRequest.description || 'Ticket Purchase',
      };

      const response = await this.axiosInstance.post(
        '/mpesa/stkpush/v1/processrequest',
        stkPushRequest,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      return response.data as MpesaSTKPushResponse;
    } catch (error: any) {
      console.error('STK Push request failed:', error.response?.data || error.message);
      throw new Error(`Payment initiation failed: ${error.response?.data?.errorMessage || error.message}`);
    }
  }

  /**
   * Query STK Push transaction status
   */
  async querySTKPushStatus(checkoutRequestId: string): Promise<any> {
    try {
      const accessToken = await this.getAccessToken();
      const { password, timestamp } = this.generatePassword();

      const queryRequest = {
        BusinessShortCode: mpesaConfig.shortCode,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: checkoutRequestId,
      };

      const response = await this.axiosInstance.post(
        '/mpesa/stkpushquery/v1/query',
        queryRequest,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('STK Push query failed:', error.response?.data || error.message);
      throw new Error(`Payment status query failed: ${error.response?.data?.errorMessage || error.message}`);
    }
  }

  /**
   * Process M-Pesa callback response
   */
  processCallback(callbackData: MpesaCallbackResponse): PaymentResult {
    const { stkCallback } = callbackData.Body;
    
    const result: PaymentResult = {
      success: stkCallback.ResultCode === 0,
      transactionId: '', // Will be set by the calling service
    };

    if (result.success && stkCallback.CallbackMetadata) {
      // Extract payment details from callback metadata
      const metadata = stkCallback.CallbackMetadata.Item;
      
      for (const item of metadata) {
        switch (item.Name) {
          case 'MpesaReceiptNumber':
            result.mpesaReceiptNumber = item.Value as string;
            break;
          case 'Amount':
            result.amount = Number(item.Value);
            break;
          case 'PhoneNumber':
            result.phoneNumber = item.Value as string;
            break;
        }
      }
    } else {
      result.error = stkCallback.ResultDesc;
    }

    return result;
  }

  /**
   * Validate callback authenticity (basic validation)
   */
  validateCallback(callbackData: MpesaCallbackResponse): boolean {
    try {
      // Basic structure validation
      return !!(
        callbackData.Body &&
        callbackData.Body.stkCallback &&
        callbackData.Body.stkCallback.MerchantRequestID &&
        callbackData.Body.stkCallback.CheckoutRequestID &&
        typeof callbackData.Body.stkCallback.ResultCode === 'number'
      );
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if M-Pesa service is available
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.getAccessToken();
      return true;
    } catch (error) {
      console.error('M-Pesa health check failed:', error);
      return false;
    }
  }
}