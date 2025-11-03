import { Request, Response, NextFunction } from 'express';
import { body, param, validationResult } from 'express-validator';

// Validation middleware for creating a review
export const validateCreateReview = [
  body('transactionId')
    .isUUID()
    .withMessage('Transaction ID must be a valid UUID'),
  
  body('revieweeId')
    .isUUID()
    .withMessage('Reviewee ID must be a valid UUID'),
  
  body('rating')
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be an integer between 1 and 5'),
  
  body('comment')
    .optional()
    .isString()
    .isLength({ min: 1, max: 1000 })
    .withMessage('Comment must be between 1 and 1000 characters')
    .trim(),
  
  body('type')
    .isIn(['buyer_to_seller', 'seller_to_buyer'])
    .withMessage('Type must be either buyer_to_seller or seller_to_buyer'),
  
  (req: Request, res: Response, next: NextFunction): void => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input data',
          details: errors.array(),
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
      return;
    }
    next();
  }
];

// Validation middleware for review ID parameter
export const validateReviewId = [
  param('reviewId')
    .isUUID()
    .withMessage('Review ID must be a valid UUID'),
  
  (req: Request, res: Response, next: NextFunction): void => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid review ID',
          details: errors.array(),
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
      return;
    }
    next();
  }
];

// Validation middleware for user ID parameter
export const validateUserId = [
  param('userId')
    .isUUID()
    .withMessage('User ID must be a valid UUID'),
  
  (req: Request, res: Response, next: NextFunction): void => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid user ID',
          details: errors.array(),
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
      return;
    }
    next();
  }
];

// Validation middleware for transaction ID parameter
export const validateTransactionId = [
  param('transactionId')
    .isUUID()
    .withMessage('Transaction ID must be a valid UUID'),
  
  (req: Request, res: Response, next: NextFunction): void => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid transaction ID',
          details: errors.array(),
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
      return;
    }
    next();
  }
];

// Validation middleware for updating review visibility
export const validateUpdateVisibility = [
  body('isVisible')
    .isBoolean()
    .withMessage('isVisible must be a boolean value'),
  
  (req: Request, res: Response, next: NextFunction): void => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid visibility value',
          details: errors.array(),
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
      return;
    }
    next();
  }
];

// Validation middleware for flagging review
export const validateFlagReview = [
  body('reason')
    .isString()
    .isLength({ min: 5, max: 500 })
    .withMessage('Reason must be between 5 and 500 characters')
    .trim(),
  
  (req: Request, res: Response, next: NextFunction): void => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid flag reason',
          details: errors.array(),
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
      return;
    }
    next();
  }
];