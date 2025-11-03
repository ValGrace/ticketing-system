import axios from 'axios';
import { SMSNotification } from '../types';

export interface SMSConfig {
  provider: 'twilio' | 'africastalking' | 'mock';
  apiKey: string;
  apiSecret?: string;
  senderId: string;
  baseUrl?: string;
}

export const getSMSConfig = (): SMSConfig => {
  return {
    provider: (process.env['SMS_PROVIDER'] as SMSConfig['provider']) || 'mock',
    apiKey: process.env['SMS_API_KEY'] || '',
    apiSecret: process.env['SMS_API_SECRET'] || '',
    senderId: process.env['SMS_SENDER_ID'] || 'TicketResell',
    baseUrl: process.env['SMS_BASE_URL'] || ''
  };
};

export abstract class BaseSMSProvider {
  protected config: SMSConfig;

  constructor(config: SMSConfig) {
    this.config = config;
  }

  abstract sendSMS(notification: SMSNotification): Promise<boolean>;
  abstract sendBulkSMS(notifications: SMSNotification[]): Promise<{ sent: number; failed: number }>;
  abstract testConnection(): Promise<boolean>;
}

export class TwilioSMSProvider extends BaseSMSProvider {
  async sendSMS(notification: SMSNotification): Promise<boolean> {
    try {
      const response = await axios.post(
        `https://api.twilio.com/2010-04-01/Accounts/${this.config.apiKey}/Messages.json`,
        new URLSearchParams({
          From: notification.from || this.config.senderId,
          To: notification.to,
          Body: notification.message
        }),
        {
          auth: {
            username: this.config.apiKey,
            password: this.config.apiSecret || ''
          },
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      console.log('SMS sent successfully via Twilio:', response.data.sid);
      return true;
    } catch (error) {
      console.error('Failed to send SMS via Twilio:', error);
      return false;
    }
  }

  async sendBulkSMS(notifications: SMSNotification[]): Promise<{ sent: number; failed: number }> {
    let sent = 0;
    let failed = 0;

    // Process SMS in batches
    const batchSize = 5;
    for (let i = 0; i < notifications.length; i += batchSize) {
      const batch = notifications.slice(i, i + batchSize);
      
      const promises = batch.map(async (notification) => {
        const success = await this.sendSMS(notification);
        return success ? 'sent' : 'failed';
      });

      const results = await Promise.all(promises);
      sent += results.filter(r => r === 'sent').length;
      failed += results.filter(r => r === 'failed').length;

      // Add delay between batches
      if (i + batchSize < notifications.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    return { sent, failed };
  }

  async testConnection(): Promise<boolean> {
    try {
      // Test by getting account info
      const response = await axios.get(
        `https://api.twilio.com/2010-04-01/Accounts/${this.config.apiKey}.json`,
        {
          auth: {
            username: this.config.apiKey,
            password: this.config.apiSecret || ''
          }
        }
      );

      return response.status === 200;
    } catch (error) {
      console.error('Twilio connection test failed:', error);
      return false;
    }
  }
}

export class AfricasTalkingSMSProvider extends BaseSMSProvider {
  async sendSMS(notification: SMSNotification): Promise<boolean> {
    try {
      const response = await axios.post(
        'https://api.africastalking.com/version1/messaging',
        {
          username: this.config.apiKey,
          to: notification.to,
          message: notification.message,
          from: notification.from || this.config.senderId
        },
        {
          headers: {
            'apiKey': this.config.apiSecret || '',
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      console.log('SMS sent successfully via Africa\'s Talking:', response.data);
      return true;
    } catch (error) {
      console.error('Failed to send SMS via Africa\'s Talking:', error);
      return false;
    }
  }

  async sendBulkSMS(notifications: SMSNotification[]): Promise<{ sent: number; failed: number }> {
    let sent = 0;
    let failed = 0;

    for (const notification of notifications) {
      const success = await this.sendSMS(notification);
      if (success) {
        sent++;
      } else {
        failed++;
      }

      // Add delay between messages
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return { sent, failed };
  }

  async testConnection(): Promise<boolean> {
    try {
      // Test by getting user data
      const response = await axios.get(
        'https://api.africastalking.com/version1/user',
        {
          headers: {
            'apiKey': this.config.apiSecret || '',
            'Accept': 'application/json'
          },
          params: {
            username: this.config.apiKey
          }
        }
      );

      return response.status === 200;
    } catch (error) {
      console.error('Africa\'s Talking connection test failed:', error);
      return false;
    }
  }
}

export class MockSMSProvider extends BaseSMSProvider {
  async sendSMS(notification: SMSNotification): Promise<boolean> {
    console.log('Mock SMS sent:', {
      to: notification.to,
      from: notification.from || this.config.senderId,
      message: notification.message
    });
    return true;
  }

  async sendBulkSMS(notifications: SMSNotification[]): Promise<{ sent: number; failed: number }> {
    console.log(`Mock bulk SMS: ${notifications.length} messages`);
    notifications.forEach((notification, index) => {
      console.log(`SMS ${index + 1}:`, {
        to: notification.to,
        message: notification.message
      });
    });
    return { sent: notifications.length, failed: 0 };
  }

  async testConnection(): Promise<boolean> {
    console.log('Mock SMS provider connection test: OK');
    return true;
  }
}

export class SMSService {
  private provider: BaseSMSProvider;

  constructor() {
    const config = getSMSConfig();
    
    switch (config.provider) {
      case 'twilio':
        this.provider = new TwilioSMSProvider(config);
        break;
      case 'africastalking':
        this.provider = new AfricasTalkingSMSProvider(config);
        break;
      default:
        this.provider = new MockSMSProvider(config);
    }
  }

  async sendSMS(notification: SMSNotification): Promise<boolean> {
    // Validate phone number format
    if (!this.isValidPhoneNumber(notification.to)) {
      console.error('Invalid phone number format:', notification.to);
      return false;
    }

    return await this.provider.sendSMS(notification);
  }

  async sendBulkSMS(notifications: SMSNotification[]): Promise<{ sent: number; failed: number }> {
    // Filter out invalid phone numbers
    const validNotifications = notifications.filter(n => this.isValidPhoneNumber(n.to));
    
    if (validNotifications.length !== notifications.length) {
      console.warn(`Filtered out ${notifications.length - validNotifications.length} invalid phone numbers`);
    }

    return await this.provider.sendBulkSMS(validNotifications);
  }

  async testConnection(): Promise<boolean> {
    return await this.provider.testConnection();
  }

  private isValidPhoneNumber(phoneNumber: string): boolean {
    // Basic phone number validation - should start with + and contain only digits
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    return phoneRegex.test(phoneNumber);
  }

  formatPhoneNumber(phoneNumber: string, countryCode = '+254'): string {
    // Remove any non-digit characters
    const cleaned = phoneNumber.replace(/\D/g, '');
    
    // If it starts with 0, replace with country code
    if (cleaned.startsWith('0')) {
      return countryCode + cleaned.substring(1);
    }
    
    // If it doesn't start with +, add country code
    if (!cleaned.startsWith(countryCode.substring(1))) {
      return countryCode + cleaned;
    }
    
    return '+' + cleaned;
  }
}

// Singleton instance
export const smsService = new SMSService();