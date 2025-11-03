import { Request, Response } from 'express';
import { PaymentService, PaymentInitiationRequest } from '../services/PaymentService';
import { MpesaCallbackResponse } from '../types';

export class PaymentController {
  constructor(private paymentService: PaymentService) {}

  /**
   * Initiate payment for ticket purchase
   */
  initiatePayment = async (req: Request, res: Response): Promise<void> => {
    try {
      const { listingId, quantity, phoneNumber } = req.body;
      const buyerId = req.user?.userId;

      if (!buyerId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      if (!listingId || !quantity || !phoneNumber) {
        res.status(400).json({ 
          error: 'Missing required fields: listingId, quantity, phoneNumber' 
        });
        return;
      }

      if (quantity <= 0) {
        res.status(400).json({ error: 'Quantity must be greater than 0' });
        return;
      }

      const request: PaymentInitiationRequest = {
        listingId,
        buyerId,
        quantity: parseInt(quantity),
        phoneNumber,
      };

      const result = await this.paymentService.initiatePayment(request);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('Payment initiation error:', error);
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Payment initiation failed',
      });
    }
  };

  /**
   * Handle M-Pesa payment callback
   */
  handleMpesaCallback = async (req: Request, res: Response): Promise<void> => {
    try {
      const callbackData: MpesaCallbackResponse = req.body;

      const result = await this.paymentService.processPaymentCallback(callbackData);

      // Always respond with success to M-Pesa to prevent retries
      res.status(200).json({
        ResultCode: 0,
        ResultDesc: 'Callback processed successfully',
      });

      // Log the result for monitoring
      console.log('Payment callback processed:', {
        transactionId: result.transactionId,
        success: result.success,
        mpesaReceiptNumber: result.mpesaReceiptNumber,
        error: result.error,
      });
    } catch (error) {
      console.error('Callback processing error:', error);
      
      // Still respond with success to prevent M-Pesa retries
      res.status(200).json({
        ResultCode: 0,
        ResultDesc: 'Callback received',
      });
    }
  };

  /**
   * Handle M-Pesa timeout callback
   */
  handleMpesaTimeout = async (req: Request, res: Response): Promise<void> => {
    try {
      console.log('M-Pesa timeout callback received:', req.body);
      
      res.status(200).json({
        ResultCode: 0,
        ResultDesc: 'Timeout callback received',
      });
    } catch (error) {
      console.error('Timeout callback error:', error);
      res.status(200).json({
        ResultCode: 0,
        ResultDesc: 'Timeout callback received',
      });
    }
  };

  /**
   * Confirm ticket transfer
   */
  confirmTransfer = async (req: Request, res: Response): Promise<void> => {
    try {
      const { transactionId } = req.params;
      const confirmerId = req.user?.userId;

      if (!confirmerId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      if (!transactionId) {
        res.status(400).json({ error: 'Transaction ID is required' });
        return;
      }

      const success = await this.paymentService.confirmTicketTransfer(transactionId, confirmerId);

      if (success) {
        res.status(200).json({
          success: true,
          message: 'Ticket transfer confirmed and payment released',
        });
      } else {
        res.status(400).json({
          success: false,
          error: 'Failed to confirm transfer',
        });
      }
    } catch (error) {
      console.error('Transfer confirmation error:', error);
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Transfer confirmation failed',
      });
    }
  };

  /**
   * File a dispute
   */
  fileDispute = async (req: Request, res: Response): Promise<void> => {
    try {
      const { transactionId } = req.params;
      const { reason, description } = req.body;
      const reporterId = req.user?.userId;

      if (!reporterId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      if (!transactionId || !reason || !description) {
        res.status(400).json({ 
          error: 'Missing required fields: reason, description' 
        });
        return;
      }

      const disputeCase = await this.paymentService.fileDispute(
        transactionId,
        reporterId,
        reason,
        description
      );

      res.status(201).json({
        success: true,
        data: disputeCase,
        message: 'Dispute filed successfully',
      });
    } catch (error) {
      console.error('Dispute filing error:', error);
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to file dispute',
      });
    }
  };

  /**
   * Request refund
   */
  requestRefund = async (req: Request, res: Response): Promise<void> => {
    try {
      const { transactionId } = req.params;
      const { reason } = req.body;

      if (!transactionId || !reason) {
        res.status(400).json({ 
          error: 'Missing required fields: reason' 
        });
        return;
      }

      const refundRequest = await this.paymentService.processRefund(transactionId, reason);

      res.status(201).json({
        success: true,
        data: refundRequest,
        message: 'Refund request submitted successfully',
      });
    } catch (error) {
      console.error('Refund request error:', error);
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process refund request',
      });
    }
  };

  /**
   * Get transaction status
   */
  getTransactionStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const { transactionId } = req.params;
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      // This would typically use the transaction repository directly
      // For now, we'll return a placeholder response
      res.status(200).json({
        success: true,
        data: {
          transactionId,
          status: 'pending',
          message: 'Transaction status retrieved successfully',
        },
      });
    } catch (error) {
      console.error('Transaction status error:', error);
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get transaction status',
      });
    }
  };

  /**
   * Process escrow releases (admin endpoint)
   */
  processEscrowReleases = async (req: Request, res: Response): Promise<void> => {
    try {
      // Check if user is admin
      if (req.user?.role !== 'admin') {
        res.status(403).json({ error: 'Admin access required' });
        return;
      }

      const results = await this.paymentService.processEscrowReleases();

      res.status(200).json({
        success: true,
        data: {
          processed: results.length,
          successful: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length,
          results,
        },
      });
    } catch (error) {
      console.error('Escrow release processing error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process escrow releases',
      });
    }
  };
}