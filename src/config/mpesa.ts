import dotenv from 'dotenv';

dotenv.config();

export interface MpesaConfig {
  consumerKey: string;
  consumerSecret: string;
  environment: 'sandbox' | 'production';
  shortCode: string;
  passkey: string;
  callbackUrl: string;
  timeoutUrl: string;
  baseUrl: string;
}

export const mpesaConfig: MpesaConfig = {
  consumerKey: process.env['MPESA_CONSUMER_KEY'] || '',
  consumerSecret: process.env['MPESA_CONSUMER_SECRET'] || '',
  environment: (process.env['MPESA_ENVIRONMENT'] as 'sandbox' | 'production') || 'sandbox',
  shortCode: process.env['MPESA_SHORT_CODE'] || '174379',
  passkey: process.env['MPESA_PASSKEY'] || '',
  callbackUrl: process.env['MPESA_CALLBACK_URL'] || 'http://localhost:3000/api/payments/mpesa/callback',
  timeoutUrl: process.env['MPESA_TIMEOUT_URL'] || 'http://localhost:3000/api/payments/mpesa/timeout',
  baseUrl: process.env['MPESA_ENVIRONMENT'] === 'production' 
    ? 'https://api.safaricom.co.ke' 
    : 'https://sandbox.safaricom.co.ke'
};

// Validate required configuration
export function validateMpesaConfig(): void {
  const requiredFields: (keyof MpesaConfig)[] = [
    'consumerKey', 
    'consumerSecret', 
    'shortCode', 
    'passkey'
  ];

  const missingFields = requiredFields.filter(field => !mpesaConfig[field]);
  
  if (missingFields.length > 0) {
    throw new Error(`Missing required M-Pesa configuration: ${missingFields.join(', ')}`);
  }
}