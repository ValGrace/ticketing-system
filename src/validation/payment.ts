import Joi from 'joi';

export const initiatePaymentSchema = Joi.object({
  listingId: Joi.string().uuid().required().messages({
    'string.empty': 'Listing ID is required',
    'string.uuid': 'Invalid listing ID format',
    'any.required': 'Listing ID is required',
  }),
  quantity: Joi.number().integer().min(1).max(10).required().messages({
    'number.base': 'Quantity must be a number',
    'number.integer': 'Quantity must be an integer',
    'number.min': 'Quantity must be at least 1',
    'number.max': 'Quantity cannot exceed 10',
    'any.required': 'Quantity is required',
  }),
  phoneNumber: Joi.string().pattern(/^(\+?254|0)?[17]\d{8}$/).required().messages({
    'string.empty': 'Phone number is required',
    'string.pattern.base': 'Invalid phone number format. Use format: 254XXXXXXXXX or 07XXXXXXXX',
    'any.required': 'Phone number is required',
  }),
});

export const confirmTransferSchema = Joi.object({
  transactionId: Joi.string().uuid().required().messages({
    'string.empty': 'Transaction ID is required',
    'string.uuid': 'Invalid transaction ID format',
    'any.required': 'Transaction ID is required',
  }),
});

export const fileDisputeSchema = Joi.object({
  transactionId: Joi.string().uuid().required().messages({
    'string.empty': 'Transaction ID is required',
    'string.uuid': 'Invalid transaction ID format',
    'any.required': 'Transaction ID is required',
  }),
  reason: Joi.string().valid(
    'ticket_not_received',
    'invalid_ticket',
    'event_cancelled',
    'duplicate_sale',
    'fraudulent_seller',
    'other'
  ).required().messages({
    'string.empty': 'Dispute reason is required',
    'any.only': 'Invalid dispute reason',
    'any.required': 'Dispute reason is required',
  }),
  description: Joi.string().min(10).max(1000).required().messages({
    'string.empty': 'Description is required',
    'string.min': 'Description must be at least 10 characters',
    'string.max': 'Description cannot exceed 1000 characters',
    'any.required': 'Description is required',
  }),
});

export const requestRefundSchema = Joi.object({
  transactionId: Joi.string().uuid().required().messages({
    'string.empty': 'Transaction ID is required',
    'string.uuid': 'Invalid transaction ID format',
    'any.required': 'Transaction ID is required',
  }),
  reason: Joi.string().valid(
    'transaction_cancelled',
    'dispute_resolved',
    'event_cancelled',
    'duplicate_payment',
    'other'
  ).required().messages({
    'string.empty': 'Refund reason is required',
    'any.only': 'Invalid refund reason',
    'any.required': 'Refund reason is required',
  }),
});

export const mpesaCallbackSchema = Joi.object({
  Body: Joi.object({
    stkCallback: Joi.object({
      MerchantRequestID: Joi.string().required(),
      CheckoutRequestID: Joi.string().required(),
      ResultCode: Joi.number().required(),
      ResultDesc: Joi.string().required(),
      CallbackMetadata: Joi.object({
        Item: Joi.array().items(
          Joi.object({
            Name: Joi.string().required(),
            Value: Joi.alternatives().try(Joi.string(), Joi.number()).required(),
          })
        ).optional(),
      }).optional(),
    }).required(),
  }).required(),
});

// Validation middleware
export const validateInitiatePayment = (req: any, res: any, next: any) => {
  const { error } = initiatePaymentSchema.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      error: error.details?.[0]?.message || 'Validation error',
    });
  }
  next();
};

export const validateConfirmTransfer = (req: any, res: any, next: any) => {
  const { error } = confirmTransferSchema.validate(req.params);
  if (error) {
    return res.status(400).json({
      success: false,
      error: error.details?.[0]?.message || 'Validation error',
    });
  }
  next();
};

export const validateFileDispute = (req: any, res: any, next: any) => {
  const paramsValidation = confirmTransferSchema.validate(req.params);
  if (paramsValidation.error) {
    return res.status(400).json({
      success: false,
      error: paramsValidation.error.details?.[0]?.message || 'Validation error',
    });
  }

  const bodyValidation = fileDisputeSchema.validate({
    transactionId: req.params.transactionId,
    ...req.body,
  });
  if (bodyValidation.error) {
    return res.status(400).json({
      success: false,
      error: bodyValidation.error.details?.[0]?.message || 'Validation error',
    });
  }
  next();
};

export const validateRequestRefund = (req: any, res: any, next: any) => {
  const paramsValidation = confirmTransferSchema.validate(req.params);
  if (paramsValidation.error) {
    return res.status(400).json({
      success: false,
      error: paramsValidation.error.details?.[0]?.message || 'Validation error',
    });
  }

  const bodyValidation = requestRefundSchema.validate({
    transactionId: req.params.transactionId,
    ...req.body,
  });
  if (bodyValidation.error) {
    return res.status(400).json({
      success: false,
      error: bodyValidation.error.details?.[0]?.message || 'Validation error',
    });
  }
  next();
};

export const validateMpesaCallback = (req: any, _res: any, next: any) => {
  const { error } = mpesaCallbackSchema.validate(req.body);
  if (error) {
    console.error('Invalid M-Pesa callback:', error.details?.[0]?.message || 'Validation error');
    // Don't reject M-Pesa callbacks, just log the error
  }
  next();
};