import { MpesaService } from './MpesaService';
import { TransactionRepository } from '../models/TransactionRepository';
import { TicketListingRepository } from '../models/TicketListingRepository';
import { UserRepository } from '../models/UserRepository';
import { webSocketService } from './WebSocketService';
import { 
  Transaction, 
  PaymentRequest, 
  PaymentResult, 
  MpesaCallbackResponse,
  EscrowAccount,
  DisputeCase,
  RefundRequest,
  DatabaseConnection 
} from '../types';

export interface PaymentInitiationRequest {
  listingId: string;
  buyerId: string;
  quantity: number;
  phoneNumber: string;
}

export interface PaymentInitiationResponse {
  transactionId: string;
  checkoutRequestId: string;
  message: string;
}

export interface EscrowReleaseResult {
  success: boolean;
  transactionId: string;
  amountReleased: number;
  error?: string;
}

export class PaymentService {
  private mpesaService: MpesaService;
  private transactionRepo: TransactionRepository;
  private listingRepo: TicketListingRepository;
  private userRepo: UserRepository;
  private connection: DatabaseConnection;

  constructor(
    connection: DatabaseConnection,
    transactionRepo: TransactionRepository,
    listingRepo: TicketListingRepository,
    userRepo: UserRepository
  ) {
    this.connection = connection;
    this.mpesaService = new MpesaService();
    this.transactionRepo = transactionRepo;
    this.listingRepo = listingRepo;
    this.userRepo = userRepo;
  }

  /**
   * Initiate payment for a ticket purchase
   */
  async initiatePayment(request: PaymentInitiationRequest): Promise<PaymentInitiationResponse> {
    return this.connection.transaction(async () => {
      // Validate listing exists and is available
      const listing = await this.listingRepo.findById(request.listingId);
      if (!listing) {
        throw new Error('Listing not found');
      }

      if (listing.status !== 'active') {
        throw new Error('Listing is not available for purchase');
      }

      if (listing.quantity < request.quantity) {
        throw new Error('Insufficient ticket quantity available');
      }

      // Validate buyer exists
      const buyer = await this.userRepo.findById(request.buyerId);
      if (!buyer) {
        throw new Error('Buyer not found');
      }

      if (buyer.status !== 'active') {
        throw new Error('Buyer account is not active');
      }

      // Calculate amounts
      const totalAmount = listing.askingPrice * request.quantity;
      const platformFee = this.calculatePlatformFee(totalAmount);

      // Create transaction record
      const transaction = await this.transactionRepo.create({
        listingId: request.listingId,
        buyerId: request.buyerId,
        sellerId: listing.sellerId,
        quantity: request.quantity,
        totalAmount,
        platformFee,
      });

      // Initiate M-Pesa payment
      const paymentRequest: PaymentRequest = {
        transactionId: transaction.id,
        amount: totalAmount,
        phoneNumber: request.phoneNumber,
        description: `Ticket purchase: ${listing.title}`,
      };

      try {
        const mpesaResponse = await this.mpesaService.initiateSTKPush(paymentRequest);

        // Update transaction with M-Pesa checkout request ID
        await this.transactionRepo.updatePaymentIntentId(
          transaction.id, 
          mpesaResponse.CheckoutRequestID
        );

        return {
          transactionId: transaction.id,
          checkoutRequestId: mpesaResponse.CheckoutRequestID,
          message: mpesaResponse.CustomerMessage,
        };
      } catch (error) {
        // Mark transaction as cancelled if payment initiation fails
        await this.transactionRepo.updateStatus(transaction.id, 'cancelled');
        throw error;
      }
    });
  }

  /**
   * Process M-Pesa payment callback
   */
  async processPaymentCallback(callbackData: MpesaCallbackResponse): Promise<PaymentResult> {
    // Validate callback
    if (!this.mpesaService.validateCallback(callbackData)) {
      throw new Error('Invalid callback data');
    }

    const { stkCallback } = callbackData.Body;
    const checkoutRequestId = stkCallback.CheckoutRequestID;

    // Find transaction by checkout request ID
    const transaction = await this.transactionRepo.findByPaymentIntentId(checkoutRequestId);
    if (!transaction) {
      throw new Error('Transaction not found for checkout request ID');
    }

    // Process the callback
    const paymentResult = this.mpesaService.processCallback(callbackData);
    paymentResult.transactionId = transaction.id;

    return this.connection.transaction(async () => {
      if (paymentResult.success) {
        // Payment successful - move to escrow
        await this.transactionRepo.updateStatus(transaction.id, 'paid');
        await this.createEscrowAccount(transaction);
        
        // Update seller's transaction count
        await this.userRepo.incrementTransactionCount(transaction.sellerId);
        await this.userRepo.incrementTransactionCount(transaction.buyerId);

        // Emit real-time transaction update
        webSocketService.emitTransactionUpdate({
          transactionId: transaction.id,
          status: 'paid',
          buyerId: transaction.buyerId,
          sellerId: transaction.sellerId,
          updatedAt: new Date(),
        });
      } else {
        // Payment failed - cancel transaction and restore listing quantity
        await this.transactionRepo.updateStatus(transaction.id, 'cancelled');
        await this.restoreListingQuantity(transaction.listingId, transaction.quantity);

        // Emit real-time transaction update
        webSocketService.emitTransactionUpdate({
          transactionId: transaction.id,
          status: 'cancelled',
          buyerId: transaction.buyerId,
          sellerId: transaction.sellerId,
          updatedAt: new Date(),
        });
      }

      return paymentResult;
    });
  }

  /**
   * Confirm ticket transfer and release escrow
   */
  async confirmTicketTransfer(transactionId: string, confirmerId: string): Promise<boolean> {
    return this.connection.transaction(async () => {
      const transaction = await this.transactionRepo.findById(transactionId);
      if (!transaction) {
        throw new Error('Transaction not found');
      }

      // Only buyer can confirm receipt
      if (transaction.buyerId !== confirmerId) {
        throw new Error('Only the buyer can confirm ticket transfer');
      }

      if (transaction.status !== 'paid') {
        throw new Error('Transaction is not in paid status');
      }

      // Update transaction status
      await this.transactionRepo.updateStatus(transactionId, 'confirmed');

      // Emit real-time update for confirmation
      webSocketService.emitTransactionUpdate({
        transactionId,
        status: 'confirmed',
        buyerId: transaction.buyerId,
        sellerId: transaction.sellerId,
        updatedAt: new Date(),
      });

      // Release escrow funds
      const releaseResult = await this.releaseEscrowFunds(transactionId);
      
      if (releaseResult.success) {
        await this.transactionRepo.updateStatus(transactionId, 'completed');
        
        // Emit real-time update for completion
        webSocketService.emitTransactionUpdate({
          transactionId,
          status: 'completed',
          buyerId: transaction.buyerId,
          sellerId: transaction.sellerId,
          updatedAt: new Date(),
        });
        
        return true;
      }

      return false;
    });
  }

  /**
   * Handle dispute filing
   */
  async fileDispute(
    transactionId: string, 
    reporterId: string, 
    reason: string, 
    description: string
  ): Promise<DisputeCase> {
    return this.connection.transaction(async () => {
      const transaction = await this.transactionRepo.findById(transactionId);
      if (!transaction) {
        throw new Error('Transaction not found');
      }

      // Verify reporter is part of the transaction
      if (transaction.buyerId !== reporterId && transaction.sellerId !== reporterId) {
        throw new Error('Only transaction participants can file disputes');
      }

      if (!['paid', 'confirmed'].includes(transaction.status)) {
        throw new Error('Disputes can only be filed for paid or confirmed transactions');
      }

      // Update transaction status to disputed
      await this.transactionRepo.addDispute(transactionId, reason);

      // Create dispute case record
      const disputeCase: DisputeCase = {
        id: this.generateId(),
        transactionId,
        reporterId,
        reportedId: reporterId === transaction.buyerId ? transaction.sellerId : transaction.buyerId,
        reason,
        description,
        status: 'open',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await this.createDisputeCase(disputeCase);

      // Emit real-time transaction update
      webSocketService.emitTransactionUpdate({
        transactionId,
        status: 'disputed',
        buyerId: transaction.buyerId,
        sellerId: transaction.sellerId,
        updatedAt: new Date(),
      });

      return disputeCase;
    });
  }

  /**
   * Process refund request
   */
  async processRefund(transactionId: string, reason: string): Promise<RefundRequest> {
    return this.connection.transaction(async () => {
      const transaction = await this.transactionRepo.findById(transactionId);
      if (!transaction) {
        throw new Error('Transaction not found');
      }

      if (!['disputed', 'cancelled'].includes(transaction.status)) {
        throw new Error('Refunds can only be processed for disputed or cancelled transactions');
      }

      const refundRequest: RefundRequest = {
        id: this.generateId(),
        transactionId,
        requesterId: transaction.buyerId,
        amount: transaction.totalAmount,
        reason,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await this.createRefundRequest(refundRequest);

      // For now, auto-approve refunds for cancelled transactions
      if (transaction.status === 'cancelled') {
        refundRequest.status = 'approved';
        refundRequest.processedAt = new Date();
        await this.updateRefundRequest(refundRequest);
      }

      return refundRequest;
    });
  }

  /**
   * Auto-release escrow funds after timeout period
   */
  async processEscrowReleases(): Promise<EscrowReleaseResult[]> {
    const transactionsDue = await this.transactionRepo.findEscrowReleaseDue();
    const results: EscrowReleaseResult[] = [];

    for (const transaction of transactionsDue) {
      try {
        const releaseResult = await this.releaseEscrowFunds(transaction.id);
        
        if (releaseResult.success) {
          await this.transactionRepo.updateStatus(transaction.id, 'completed');
        }
        
        results.push(releaseResult);
      } catch (error) {
        results.push({
          success: false,
          transactionId: transaction.id,
          amountReleased: 0,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return results;
  }

  /**
   * Calculate platform fee (e.g., 5% of transaction amount)
   */
  private calculatePlatformFee(amount: number): number {
    const feePercentage = parseFloat(process.env['PLATFORM_FEE_PERCENTAGE'] || '5');
    return Math.round(amount * (feePercentage / 100) * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Create escrow account for holding funds
   */
  private async createEscrowAccount(transaction: Transaction): Promise<void> {
    const escrowAccount: EscrowAccount = {
      id: this.generateId(),
      transactionId: transaction.id,
      amount: transaction.totalAmount,
      status: 'held',
      releaseDate: transaction.escrowReleaseDate,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Store escrow account (this would typically be in a separate table)
    const query = `
      INSERT INTO escrow_accounts (id, transaction_id, amount, status, release_date, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;
    
    await this.connection.query(query, [
      escrowAccount.id,
      escrowAccount.transactionId,
      escrowAccount.amount,
      escrowAccount.status,
      escrowAccount.releaseDate.toISOString(),
      escrowAccount.createdAt.toISOString(),
      escrowAccount.updatedAt.toISOString(),
    ]);
  }

  /**
   * Release escrow funds to seller
   */
  private async releaseEscrowFunds(transactionId: string): Promise<EscrowReleaseResult> {
    try {
      const transaction = await this.transactionRepo.findById(transactionId);
      if (!transaction) {
        throw new Error('Transaction not found');
      }

      // Update escrow status
      const updateQuery = `
        UPDATE escrow_accounts 
        SET status = 'released', updated_at = $2
        WHERE transaction_id = $1 AND status = 'held'
      `;
      
      await this.connection.query(updateQuery, [transactionId, new Date().toISOString()]);

      // In a real implementation, this would transfer funds to seller's account
      // For now, we'll just mark it as released
      const sellerAmount = transaction.totalAmount - transaction.platformFee;

      return {
        success: true,
        transactionId,
        amountReleased: sellerAmount,
      };
    } catch (error) {
      return {
        success: false,
        transactionId,
        amountReleased: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Restore listing quantity when transaction is cancelled
   */
  private async restoreListingQuantity(listingId: string, quantity: number): Promise<void> {
    const query = `
      UPDATE ticket_listings 
      SET quantity = quantity + $2,
          status = CASE 
            WHEN status = 'sold' AND quantity + $2 > 0 THEN 'active'::listing_status
            ELSE status 
          END
      WHERE id = $1
    `;
    
    await this.connection.query(query, [listingId, quantity]);
  }

  /**
   * Create dispute case record
   */
  private async createDisputeCase(disputeCase: DisputeCase): Promise<void> {
    const query = `
      INSERT INTO dispute_cases (id, transaction_id, reporter_id, reported_id, reason, description, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `;
    
    await this.connection.query(query, [
      disputeCase.id,
      disputeCase.transactionId,
      disputeCase.reporterId,
      disputeCase.reportedId,
      disputeCase.reason,
      disputeCase.description,
      disputeCase.status,
      disputeCase.createdAt.toISOString(),
      disputeCase.updatedAt.toISOString(),
    ]);
  }

  /**
   * Create refund request record
   */
  private async createRefundRequest(refundRequest: RefundRequest): Promise<void> {
    const query = `
      INSERT INTO refund_requests (id, transaction_id, requester_id, amount, reason, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `;
    
    await this.connection.query(query, [
      refundRequest.id,
      refundRequest.transactionId,
      refundRequest.requesterId,
      refundRequest.amount,
      refundRequest.reason,
      refundRequest.status,
      refundRequest.createdAt.toISOString(),
      refundRequest.updatedAt.toISOString(),
    ]);
  }

  /**
   * Update refund request
   */
  private async updateRefundRequest(refundRequest: RefundRequest): Promise<void> {
    const query = `
      UPDATE refund_requests 
      SET status = $2, processed_at = $3, updated_at = $4
      WHERE id = $1
    `;
    
    await this.connection.query(query, [
      refundRequest.id,
      refundRequest.status,
      refundRequest.processedAt?.toISOString(),
      refundRequest.updatedAt.toISOString(),
    ]);
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}