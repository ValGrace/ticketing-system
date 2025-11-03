import { Router } from 'express';
import { PaymentController } from '../controllers/PaymentController';
import { PaymentService } from '../services/PaymentService';
import { TransactionRepository } from '../models/TransactionRepository';
import { TicketListingRepository } from '../models/TicketListingRepository';
import { UserRepository } from '../models/UserRepository';
import { authenticateToken, requireRole } from '../middleware/auth';
import { 
  validateInitiatePayment,
  validateConfirmTransfer,
  validateFileDispute,
  validateRequestRefund,
  validateMpesaCallback
} from '../validation/payment';
import { DatabaseConnection } from '../types';

export function createPaymentRoutes(connection: DatabaseConnection): Router {
  const router = Router();
  
  // Initialize repositories and services
  const transactionRepo = new TransactionRepository(connection);
  const listingRepo = new TicketListingRepository(connection);
  const userRepo = new UserRepository(connection);
  const paymentService = new PaymentService(connection, transactionRepo, listingRepo, userRepo);
  const paymentController = new PaymentController(paymentService);

  // Public routes (M-Pesa callbacks)
  router.post('/mpesa/callback', validateMpesaCallback, paymentController.handleMpesaCallback);
  router.post('/mpesa/timeout', paymentController.handleMpesaTimeout);

  // Protected routes (require authentication)
  router.use(authenticateToken);

  // Payment initiation
  router.post('/initiate', validateInitiatePayment, paymentController.initiatePayment);

  // Transaction management
  router.post('/transactions/:transactionId/confirm', validateConfirmTransfer, paymentController.confirmTransfer);
  router.post('/transactions/:transactionId/dispute', validateFileDispute, paymentController.fileDispute);
  router.post('/transactions/:transactionId/refund', validateRequestRefund, paymentController.requestRefund);
  router.get('/transactions/:transactionId/status', paymentController.getTransactionStatus);

  // Admin routes
  router.post('/escrow/release', requireRole(['admin']), paymentController.processEscrowReleases);

  return router;
}