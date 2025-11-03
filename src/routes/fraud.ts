import { Router } from 'express';
import { FraudDetectionController } from '../controllers/FraudDetectionController';
import { authenticateToken, requireRole } from '../middleware/auth';
import { DatabaseConnection } from '../types';

export function createFraudRoutes(connection: DatabaseConnection): Router {
  const router = Router();
  const fraudController = new FraudDetectionController(connection);

  // All fraud detection routes require authentication
  router.use(authenticateToken);

  // Fraud Report routes
  router.post('/reports', fraudController.reportFraud);
  router.get('/reports', requireRole(['moderator', 'admin']), fraudController.getFraudReports);
  router.put('/reports/:reportId/assign', requireRole(['admin']), fraudController.assignReport);
  router.put('/reports/:reportId/resolve', requireRole(['moderator', 'admin']), fraudController.resolveReport);

  // Suspicious Activity routes
  router.get('/activities', requireRole(['moderator', 'admin']), fraudController.getSuspiciousActivities);
  router.put('/activities/:activityId/review', requireRole(['moderator', 'admin']), fraudController.reviewActivity);

  // Ticket Verification routes
  router.post('/verify/:listingId', requireRole(['moderator', 'admin']), fraudController.verifyTicket);
  router.get('/verifications', requireRole(['moderator', 'admin']), fraudController.getVerifications);
  router.put('/verifications/:verificationId/review', requireRole(['moderator', 'admin']), fraudController.manualReview);

  // User Suspension routes
  router.post('/suspensions', requireRole(['admin']), fraudController.suspendUser);
  router.delete('/suspensions/:suspensionId', requireRole(['admin']), fraudController.liftSuspension);
  router.get('/suspensions', requireRole(['moderator', 'admin']), fraudController.getSuspensions);

  // Investigation routes
  router.get('/users/:userId/risk-profile', requireRole(['moderator', 'admin']), fraudController.getUserRiskProfile);
  router.get('/statistics', requireRole(['admin']), fraudController.getSystemStatistics);

  // Automated detection triggers (internal use)
  router.post('/detect/rapid-listing/:userId', requireRole(['admin']), fraudController.triggerRapidListingCheck);
  router.post('/detect/price-manipulation/:listingId', requireRole(['admin']), fraudController.triggerPriceManipulationCheck);
  router.post('/detect/duplicate-images/:listingId', requireRole(['admin']), fraudController.triggerDuplicateImageCheck);

  return router;
}