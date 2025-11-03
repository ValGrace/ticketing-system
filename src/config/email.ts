import nodemailer from 'nodemailer';
import { EmailNotification } from '../types';

export interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  from: string;
  replyTo?: string;
}

export const getEmailConfig = (): EmailConfig => {
  return {
    host: process.env['SMTP_HOST'] || 'localhost',
    port: parseInt(process.env['SMTP_PORT'] || '587'),
    secure: process.env['SMTP_SECURE'] === 'true',
    auth: {
      user: process.env['SMTP_USER'] || '',
      pass: process.env['SMTP_PASS'] || ''
    },
    from: process.env['SMTP_FROM'] || 'noreply@ticketresell.com',
    replyTo: process.env['SMTP_REPLY_TO'] || ''
  };
};

export class EmailService {
  private transporter: nodemailer.Transporter;
  private config: EmailConfig;

  constructor() {
    this.config = getEmailConfig();
    this.transporter = nodemailer.createTransport({
      host: this.config.host,
      port: this.config.port,
      secure: this.config.secure,
      auth: this.config.auth,
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      rateLimit: 14 // messages per second
    });

    // Verify connection configuration
    this.verifyConnection();
  }

  private async verifyConnection(): Promise<void> {
    try {
      await this.transporter.verify();
      console.log('Email service connected successfully');
    } catch (error) {
      console.error('Email service connection failed:', error);
    }
  }

  async sendEmail(notification: EmailNotification): Promise<boolean> {
    try {
      const mailOptions = {
        from: notification.from || this.config.from,
        to: notification.to,
        subject: notification.subject,
        html: notification.html,
        text: notification.text,
        replyTo: notification.replyTo || this.config.replyTo,
        attachments: notification.attachments
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log('Email sent successfully:', info.messageId);
      return true;
    } catch (error) {
      console.error('Failed to send email:', error);
      return false;
    }
  }

  async sendBulkEmails(notifications: EmailNotification[]): Promise<{ sent: number; failed: number }> {
    let sent = 0;
    let failed = 0;

    // Process emails in batches to avoid overwhelming the SMTP server
    const batchSize = 10;
    for (let i = 0; i < notifications.length; i += batchSize) {
      const batch = notifications.slice(i, i + batchSize);

      const promises = batch.map(async (notification) => {
        const success = await this.sendEmail(notification);
        return success ? 'sent' : 'failed';
      });

      const results = await Promise.all(promises);
      sent += results.filter(r => r === 'sent').length;
      failed += results.filter(r => r === 'failed').length;

      // Add delay between batches to respect rate limits
      if (i + batchSize < notifications.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return { sent, failed };
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      console.error('Email connection test failed:', error);
      return false;
    }
  }

  async close(): Promise<void> {
    this.transporter.close();
  }
}

// Singleton instance
export const emailService = new EmailService();