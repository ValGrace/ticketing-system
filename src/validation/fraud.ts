import Joi from 'joi';

// Fraud Report validation schemas
export const createFraudReportSchema = Joi.object({
  reportedUserId: Joi.string().uuid().optional(),
  listingId: Joi.string().uuid().optional(),
  transactionId: Joi.string().uuid().optional(),
  type: Joi.string().valid('fake_ticket', 'duplicate_listing', 'suspicious_behavior', 'payment_fraud', 'other').required(),
  reason: Joi.string().min(10).max(255).required(),
  description: Joi.string().min(20).max(2000).required(),
  evidence: Joi.array().items(Joi.string().uri()).optional()
}).or('reportedUserId', 'listingId', 'transactionId'); // At least one target must be specified

export const assignReportSchema = Joi.object({
  moderatorId: Joi.string().uuid().required()
});

export const resolveReportSchema = Joi.object({
  resolution: Joi.string().min(10).max(1000).required()
});

// Suspicious Activity validation schemas
export const reviewActivitySchema = Joi.object({
  status: Joi.string().valid('reviewed', 'dismissed').required(),
  notes: Joi.string().max(1000).optional()
});

// Ticket Verification validation schemas
export const manualReviewSchema = Joi.object({
  status: Joi.string().valid('verified', 'rejected').required(),
  reviewNotes: Joi.string().max(1000).optional()
});

// User Suspension validation schemas
export const suspendUserSchema = Joi.object({
  userId: Joi.string().uuid().required(),
  reason: Joi.string().min(10).max(500).required(),
  suspensionType: Joi.string().valid('temporary', 'permanent').required(),
  endDate: Joi.when('suspensionType', {
    is: 'temporary',
    then: Joi.date().iso().greater('now').required(),
    otherwise: Joi.forbidden()
  })
});

// Query parameter validation schemas
export const fraudReportQuerySchema = Joi.object({
  status: Joi.string().valid('pending', 'investigating', 'resolved', 'dismissed').optional(),
  assignedTo: Joi.string().uuid().optional(),
  reportedUserId: Joi.string().uuid().optional(),
  type: Joi.string().valid('fake_ticket', 'duplicate_listing', 'suspicious_behavior', 'payment_fraud', 'other').optional(),
  limit: Joi.number().integer().min(1).max(100).default(20).optional(),
  offset: Joi.number().integer().min(0).default(0).optional()
});

export const suspiciousActivityQuerySchema = Joi.object({
  userId: Joi.string().uuid().optional(),
  severity: Joi.string().valid('low', 'medium', 'high', 'critical').optional(),
  status: Joi.string().valid('flagged', 'reviewed', 'dismissed').optional(),
  type: Joi.string().valid('rapid_listing', 'price_manipulation', 'duplicate_images', 'suspicious_login', 'multiple_accounts').optional(),
  limit: Joi.number().integer().min(1).max(100).default(20).optional(),
  offset: Joi.number().integer().min(0).default(0).optional()
});

export const verificationQuerySchema = Joi.object({
  listingId: Joi.string().uuid().optional(),
  status: Joi.string().valid('pending', 'verified', 'rejected', 'requires_manual_review').optional(),
  method: Joi.string().valid('automated', 'manual', 'image_analysis').optional(),
  limit: Joi.number().integer().min(1).max(100).default(20).optional(),
  offset: Joi.number().integer().min(0).default(0).optional()
});

export const suspensionQuerySchema = Joi.object({
  userId: Joi.string().uuid().optional(),
  active: Joi.boolean().optional(),
  type: Joi.string().valid('temporary', 'permanent').optional(),
  limit: Joi.number().integer().min(1).max(100).default(20).optional(),
  offset: Joi.number().integer().min(0).default(0).optional()
});

// Parameter validation schemas
export const uuidParamSchema = Joi.object({
  id: Joi.string().uuid().required()
});

export const userIdParamSchema = Joi.object({
  userId: Joi.string().uuid().required()
});

export const listingIdParamSchema = Joi.object({
  listingId: Joi.string().uuid().required()
});

export const reportIdParamSchema = Joi.object({
  reportId: Joi.string().uuid().required()
});

export const activityIdParamSchema = Joi.object({
  activityId: Joi.string().uuid().required()
});

export const verificationIdParamSchema = Joi.object({
  verificationId: Joi.string().uuid().required()
});

export const suspensionIdParamSchema = Joi.object({
  suspensionId: Joi.string().uuid().required()
});