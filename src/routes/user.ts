import { Router } from 'express';
import { UserController } from '../controllers/UserController';
import { authenticateToken, requireRole } from '../middleware/auth';
import {
  validateUpdateProfile,
  validateDeleteAccount,
  validatePagination,
  validateSearchQuery,
  validateUserStatus
} from '../validation/user';

export function createUserRoutes(userController: UserController): Router {
  const router = Router();

  // User profile routes (authenticated users only)
  router.get('/profile', authenticateToken, userController.getProfile);
  router.put('/profile', authenticateToken, validateUpdateProfile, userController.updateProfile);
  router.get('/transaction-history', authenticateToken, validatePagination, userController.getTransactionHistory);
  router.get('/stats', authenticateToken, userController.getUserStats);
  router.delete('/account', authenticateToken, validateDeleteAccount, userController.deleteAccount);

  // Admin routes (admin/moderator only)
  router.get('/search', authenticateToken, requireRole(['admin', 'moderator']), validateSearchQuery, validatePagination, userController.searchUsers);
  router.get('/status/:status', authenticateToken, requireRole(['admin', 'moderator']), validateUserStatus, validatePagination, userController.getUsersByStatus);

  return router;
}