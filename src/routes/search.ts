import { Router } from 'express';
import { SearchController } from '../controllers/SearchController';
import { authenticateToken } from '../middleware/auth';
import rateLimit from 'express-rate-limit';

const router = Router();
const searchController = new SearchController();

// Rate limiting for search endpoints
const searchRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute
  message: {
    success: false,
    error: 'Too many search requests',
    message: 'Please try again later',
  },
});

const suggestionRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 120, // 120 requests per minute (higher for autocomplete)
  message: {
    success: false,
    error: 'Too many suggestion requests',
    message: 'Please try again later',
  },
});

// Public search endpoints
router.get('/listings', searchRateLimit, searchController.searchListings);
router.get('/nearby', searchRateLimit, searchController.searchNearby);
router.get('/suggestions', suggestionRateLimit, searchController.getSuggestions);
router.get('/health', searchController.healthCheck);

// Admin-only endpoints
router.post('/initialize', authenticateToken, searchController.initializeIndex);

export default router;