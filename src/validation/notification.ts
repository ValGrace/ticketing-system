import Joi from 'joi';

// Notification types enum for validation
const notificationTypes = [
  'listing_created',
  'listing_sold',
  'listing_expired',
  'purchase_confirmation',
  'payment_received',
  'payment_failed',
  'transaction_completed',
  'review_received',
  'price_drop',
  'fraud_alert',
  'account_suspended',
  'verification_required',
  'dispute_opened',
  'dispute_resolved',
  'system_maintenance',
  'welcome',
  'password_reset'
];

const notificationChannels = ['email', 'sms', 'push', 'in_app'];

// Validation schema for updating notification preferences
export const updatePreferencesSchema = Joi.object({
  emailEnabled: Joi.boolean().optional(),
  smsEnabled: Joi.boolean().optional(),
  pushEnabled: Joi.boolean().optional(),
  inAppEnabled: Joi.boolean().optional(),
  preferences: Joi.object().pattern(
    Joi.string().valid(...notificationTypes),
    Joi.object({
      email: Joi.boolean().required(),
      sms: Joi.boolean().required(),
      push: Joi.boolean().required(),
      inApp: Joi.boolean().required()
    })
  ).optional()
});

// Validation schema for sending test notifications
export const sendTestNotificationSchema = Joi.object({
  type: Joi.string()
    .valid(...notificationTypes)
    .required()
    .messages({
      'any.only': 'Invalid notification type',
      'any.required': 'Notification type is required'
    }),
  variables: Joi.object().optional(),
  channels: Joi.array()
    .items(Joi.string().valid(...notificationChannels))
    .optional()
    .messages({
      'array.includes': 'Invalid notification channel'
    })
});

// Validation schema for bulk notifications (admin only)
export const sendBulkNotificationSchema = Joi.object({
  userIds: Joi.array()
    .items(Joi.string().uuid())
    .min(1)
    .max(1000)
    .required()
    .messages({
      'array.min': 'At least one user ID is required',
      'array.max': 'Maximum 1000 user IDs allowed',
      'any.required': 'User IDs array is required'
    }),
  type: Joi.string()
    .valid(...notificationTypes)
    .required()
    .messages({
      'any.only': 'Invalid notification type',
      'any.required': 'Notification type is required'
    }),
  variables: Joi.object().optional()
});

// Validation schema for notification template creation (admin only)
export const createTemplateSchema = Joi.object({
  type: Joi.string()
    .valid(...notificationTypes)
    .required()
    .messages({
      'any.only': 'Invalid notification type',
      'any.required': 'Notification type is required'
    }),
  channel: Joi.string()
    .valid(...notificationChannels)
    .required()
    .messages({
      'any.only': 'Invalid notification channel',
      'any.required': 'Notification channel is required'
    }),
  subject: Joi.string()
    .max(255)
    .optional()
    .when('channel', {
      is: 'email',
      then: Joi.required(),
      otherwise: Joi.forbidden()
    })
    .messages({
      'string.max': 'Subject must not exceed 255 characters',
      'any.required': 'Subject is required for email notifications'
    }),
  title: Joi.string()
    .max(255)
    .required()
    .messages({
      'string.max': 'Title must not exceed 255 characters',
      'any.required': 'Title is required'
    }),
  body: Joi.string()
    .max(10000)
    .required()
    .messages({
      'string.max': 'Body must not exceed 10000 characters',
      'any.required': 'Body is required'
    }),
  variables: Joi.array()
    .items(Joi.string().pattern(/^[a-zA-Z][a-zA-Z0-9_]*$/))
    .required()
    .messages({
      'array.base': 'Variables must be an array',
      'string.pattern.base': 'Variable names must be valid identifiers',
      'any.required': 'Variables array is required'
    })
});

// Validation schema for updating notification templates (admin only)
export const updateTemplateSchema = Joi.object({
  subject: Joi.string()
    .max(255)
    .optional()
    .messages({
      'string.max': 'Subject must not exceed 255 characters'
    }),
  title: Joi.string()
    .max(255)
    .optional()
    .messages({
      'string.max': 'Title must not exceed 255 characters'
    }),
  body: Joi.string()
    .max(10000)
    .optional()
    .messages({
      'string.max': 'Body must not exceed 10000 characters'
    }),
  variables: Joi.array()
    .items(Joi.string().pattern(/^[a-zA-Z][a-zA-Z0-9_]*$/))
    .optional()
    .messages({
      'array.base': 'Variables must be an array',
      'string.pattern.base': 'Variable names must be valid identifiers'
    })
});

// Validation schema for pagination parameters
export const paginationSchema = Joi.object({
  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .optional()
    .messages({
      'number.min': 'Limit must be at least 1',
      'number.max': 'Limit must not exceed 100'
    }),
  offset: Joi.number()
    .integer()
    .min(0)
    .optional()
    .messages({
      'number.min': 'Offset must be non-negative'
    })
});

// Validation schema for notification ID parameter
export const notificationIdSchema = Joi.object({
  notificationId: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.uuid': 'Invalid notification ID format',
      'any.required': 'Notification ID is required'
    })
});

// Validation schema for template query parameters
export const templateQuerySchema = Joi.object({
  type: Joi.string()
    .valid(...notificationTypes)
    .optional()
    .messages({
      'any.only': 'Invalid notification type'
    }),
  channel: Joi.string()
    .valid(...notificationChannels)
    .optional()
    .messages({
      'any.only': 'Invalid notification channel'
    })
});

// Validation schema for processing pending notifications
export const processPendingSchema = Joi.object({
  limit: Joi.number()
    .integer()
    .min(1)
    .max(1000)
    .optional()
    .messages({
      'number.min': 'Limit must be at least 1',
      'number.max': 'Limit must not exceed 1000'
    })
});

// Helper function to validate notification template variables
export const validateTemplateVariables = (template: string, variables: string[]): string[] => {
  const errors: string[] = [];
  const templateVariables = template.match(/\{\{(\w+)\}\}/g) || [];
  const usedVariables = templateVariables.map(v => v.replace(/[{}]/g, ''));
  
  // Check for undefined variables in template
  const undefinedVariables = usedVariables.filter(v => !variables.includes(v));
  if (undefinedVariables.length > 0) {
    errors.push(`Template uses undefined variables: ${undefinedVariables.join(', ')}`);
  }
  
  // Check for unused variables
  const unusedVariables = variables.filter(v => !usedVariables.includes(v));
  if (unusedVariables.length > 0) {
    errors.push(`Unused variables defined: ${unusedVariables.join(', ')}`);
  }
  
  return errors;
};