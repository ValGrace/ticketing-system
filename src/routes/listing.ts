import { Router, Request, Response } from 'express';
import { ListingController } from '../controllers/ListingController';
import { authenticateToken } from '../middleware/auth';
import { validateRequest } from '../middleware/auth';
import { upload, handleUploadError } from '../utils/fileUpload';
import {
  createListingSchema,
  updateListingSchema,
  searchListingsSchema,
  getCategoryValidationSchema
} from '../validation/listing';

export function createListingRoutes(listingController: ListingController): Router {
  const router = Router();

  // Public routes - no authentication required
  router.get('/search', validateRequest(searchListingsSchema), listingController.searchListings);
  router.get('/category/:category', listingController.getListingsByCategory);
  router.get('/nearby', listingController.getNearbyListings);
  router.get('/:id', listingController.getListing);

  // Protected routes - authentication required
  router.post('/', 
    authenticateToken,
    validateRequest(createListingSchema),
    (req: Request, res: Response) => listingController.createListing(req, res)
  );

  router.put('/:id',
    authenticateToken,
    validateRequest(updateListingSchema),
    (req: Request, res: Response) => listingController.updateListing(req, res)
  );

  router.delete('/:id',
    authenticateToken,
    (req: Request, res: Response) => listingController.deleteListing(req, res)
  );

  router.post('/:id/images',
    authenticateToken,
    upload.array('images', 5),
    handleUploadError,
    (req: Request, res: Response) => listingController.uploadImages(req, res)
  );

  router.post('/:id/sold',
    authenticateToken,
    (req: Request, res: Response) => listingController.markAsSold(req, res)
  );

  router.get('/user/my-listings',
    authenticateToken,
    (req: Request, res: Response) => listingController.getUserListings(req, res)
  );

  return router;
}

// Middleware for category-specific validation
export function validateCategorySpecificListing(req: any, res: any, next: any) {
  try {
    const { category } = req.body;
    
    if (!category) {
      return next(); // Let the main validation handle missing category
    }

    const categorySchema = getCategoryValidationSchema(category);
    const { error } = categorySchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message
          })),
          timestamp: new Date().toISOString()
        }
      });
    }

    next();
  } catch (error) {
    console.error('Error in category validation middleware:', error);
    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Validation error',
        timestamp: new Date().toISOString()
      }
    });
  }
}