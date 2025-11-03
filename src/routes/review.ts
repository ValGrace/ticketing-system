import { Router } from 'express';
import { ReviewController } from '../controllers/ReviewController';
import { authenticateToken } from '../middleware/auth';
import { validateCreateReview, validateReviewId, validateUserId, validateUpdateVisibility, validateFlagReview } from '../validation/review';

const router = Router();
const reviewController = new ReviewController();

// Create a new review (requires authentication)
router.post('/', authenticateToken, validateCreateReview, reviewController.createReview);

// Get reviews for a specific user (reviewee)
router.get('/user/:userId', validateUserId, reviewController.getReviewsByUser);

// Get review statistics for a user
router.get('/user/:userId/stats', validateUserId, reviewController.getUserReviewStats);

// Get pending reviews for authenticated user
router.get('/pending', authenticateToken, reviewController.getPendingReviews);

// Get reviews by transaction ID
router.get('/transaction/:transactionId', authenticateToken, reviewController.getReviewsByTransaction);

// Get reviews written by authenticated user
router.get('/my-reviews', authenticateToken, reviewController.getMyReviews);

// Update review visibility (admin/moderator only)
router.patch('/:reviewId/visibility', authenticateToken, validateReviewId, validateUpdateVisibility, reviewController.updateReviewVisibility);

// Get a specific review by ID
router.get('/:reviewId', validateReviewId, reviewController.getReviewById);

// Flag a review for moderation
router.post('/:reviewId/flag', authenticateToken, validateReviewId, validateFlagReview, reviewController.flagReviewForModeration);

// Get reviews requiring moderation (admin/moderator only)
router.get('/moderation/queue', authenticateToken, reviewController.getReviewsForModeration);

export default router;