import Joi from 'joi';

// Base listing validation schema
export const createListingSchema = Joi.object({
  title: Joi.string()
    .min(5)
    .max(200)
    .required()
    .messages({
      'string.min': 'Title must be at least 5 characters long',
      'string.max': 'Title must be less than 200 characters long',
      'any.required': 'Title is required'
    }),

  description: Joi.string()
    .min(10)
    .max(2000)
    .required()
    .messages({
      'string.min': 'Description must be at least 10 characters long',
      'string.max': 'Description must be less than 2000 characters long',
      'any.required': 'Description is required'
    }),

  category: Joi.string()
    .valid('concert', 'sports', 'theater', 'transportation', 'other')
    .required()
    .messages({
      'any.only': 'Category must be one of: concert, sports, theater, transportation, other',
      'any.required': 'Category is required'
    }),

  eventName: Joi.string()
    .min(2)
    .max(200)
    .required()
    .messages({
      'string.min': 'Event name must be at least 2 characters long',
      'string.max': 'Event name must be less than 200 characters long',
      'any.required': 'Event name is required'
    }),

  eventDate: Joi.date()
    .min('now')
    .required()
    .messages({
      'date.min': 'Event date must be in the future',
      'any.required': 'Event date is required'
    }),

  eventTime: Joi.string()
    .pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .required()
    .messages({
      'string.pattern.base': 'Event time must be in HH:MM format (24-hour)',
      'any.required': 'Event time is required'
    }),

  venue: Joi.string()
    .min(2)
    .max(200)
    .required()
    .messages({
      'string.min': 'Venue must be at least 2 characters long',
      'string.max': 'Venue must be less than 200 characters long',
      'any.required': 'Venue is required'
    }),

  seatSection: Joi.string()
    .max(50)
    .optional()
    .messages({
      'string.max': 'Seat section must be less than 50 characters long'
    }),

  seatRow: Joi.string()
    .max(20)
    .optional()
    .messages({
      'string.max': 'Seat row must be less than 20 characters long'
    }),

  seatNumber: Joi.string()
    .max(20)
    .optional()
    .messages({
      'string.max': 'Seat number must be less than 20 characters long'
    }),

  quantity: Joi.number()
    .integer()
    .min(1)
    .max(10)
    .required()
    .messages({
      'number.base': 'Quantity must be a number',
      'number.integer': 'Quantity must be a whole number',
      'number.min': 'Quantity must be at least 1',
      'number.max': 'Quantity cannot exceed 10 tickets',
      'any.required': 'Quantity is required'
    }),

  originalPrice: Joi.number()
    .positive()
    .precision(2)
    .max(10000)
    .required()
    .messages({
      'number.base': 'Original price must be a number',
      'number.positive': 'Original price must be positive',
      'number.max': 'Original price cannot exceed $10,000',
      'any.required': 'Original price is required'
    }),

  askingPrice: Joi.number()
    .positive()
    .precision(2)
    .max(10000)
    .required()
    .messages({
      'number.base': 'Asking price must be a number',
      'number.positive': 'Asking price must be positive',
      'number.max': 'Asking price cannot exceed $10,000',
      'any.required': 'Asking price is required'
    }),

  location: Joi.object({
    city: Joi.string()
      .min(2)
      .max(100)
      .required()
      .messages({
        'string.min': 'City must be at least 2 characters long',
        'string.max': 'City must be less than 100 characters long',
        'any.required': 'City is required'
      }),

    state: Joi.string()
      .min(2)
      .max(100)
      .required()
      .messages({
        'string.min': 'State must be at least 2 characters long',
        'string.max': 'State must be less than 100 characters long',
        'any.required': 'State is required'
      }),

    country: Joi.string()
      .min(2)
      .max(100)
      .required()
      .messages({
        'string.min': 'Country must be at least 2 characters long',
        'string.max': 'Country must be less than 100 characters long',
        'any.required': 'Country is required'
      }),

    coordinates: Joi.array()
      .items(Joi.number().min(-90).max(90), Joi.number().min(-180).max(180))
      .length(2)
      .optional()
      .messages({
        'array.length': 'Coordinates must contain exactly 2 numbers [latitude, longitude]',
        'number.min': 'Invalid coordinates',
        'number.max': 'Invalid coordinates'
      })
  }).required()
});

// Category-specific validation rules
export const concertListingSchema = createListingSchema.keys({
  category: Joi.string().valid('concert').required(),
  seatSection: Joi.string().max(50).optional(),
  seatRow: Joi.string().max(20).optional(),
  seatNumber: Joi.string().max(20).optional()
});

export const sportsListingSchema = createListingSchema.keys({
  category: Joi.string().valid('sports').required(),
  seatSection: Joi.string().max(50).required().messages({
    'any.required': 'Seat section is required for sports events'
  }),
  seatRow: Joi.string().max(20).optional(),
  seatNumber: Joi.string().max(20).optional()
});

export const theaterListingSchema = createListingSchema.keys({
  category: Joi.string().valid('theater').required(),
  seatSection: Joi.string().max(50).optional(),
  seatRow: Joi.string().max(20).required().messages({
    'any.required': 'Seat row is required for theater events'
  }),
  seatNumber: Joi.string().max(20).required().messages({
    'any.required': 'Seat number is required for theater events'
  })
});

export const transportationListingSchema = createListingSchema.keys({
  category: Joi.string().valid('transportation').required(),
  seatSection: Joi.string().max(50).optional(),
  seatRow: Joi.string().max(20).optional(),
  seatNumber: Joi.string().max(20).optional(),
  eventTime: Joi.string()
    .pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .required()
    .messages({
      'string.pattern.base': 'Departure time must be in HH:MM format (24-hour)',
      'any.required': 'Departure time is required'
    })
});

// Update listing validation schema
export const updateListingSchema = Joi.object({
  title: Joi.string()
    .min(5)
    .max(200)
    .optional()
    .messages({
      'string.min': 'Title must be at least 5 characters long',
      'string.max': 'Title must be less than 200 characters long'
    }),

  description: Joi.string()
    .min(10)
    .max(2000)
    .optional()
    .messages({
      'string.min': 'Description must be at least 10 characters long',
      'string.max': 'Description must be less than 2000 characters long'
    }),

  askingPrice: Joi.number()
    .positive()
    .precision(2)
    .max(10000)
    .optional()
    .messages({
      'number.base': 'Asking price must be a number',
      'number.positive': 'Asking price must be positive',
      'number.max': 'Asking price cannot exceed $10,000'
    }),

  status: Joi.string()
    .valid('active', 'sold', 'expired', 'suspended')
    .optional()
    .messages({
      'any.only': 'Status must be one of: active, sold, expired, suspended'
    })
});

// Search/filter validation schema
export const searchListingsSchema = Joi.object({
  category: Joi.string()
    .valid('concert', 'sports', 'theater', 'transportation', 'other')
    .optional(),

  eventName: Joi.string()
    .min(1)
    .max(200)
    .optional(),

  venue: Joi.string()
    .min(1)
    .max(200)
    .optional(),

  city: Joi.string()
    .min(1)
    .max(100)
    .optional(),

  state: Joi.string()
    .min(1)
    .max(100)
    .optional(),

  country: Joi.string()
    .min(1)
    .max(100)
    .optional(),

  minPrice: Joi.number()
    .positive()
    .precision(2)
    .optional()
    .messages({
      'number.positive': 'Minimum price must be positive'
    }),

  maxPrice: Joi.number()
    .positive()
    .precision(2)
    .optional()
    .messages({
      'number.positive': 'Maximum price must be positive'
    }),

  eventDateFrom: Joi.date()
    .optional(),

  eventDateTo: Joi.date()
    .optional(),

  status: Joi.string()
    .valid('active', 'sold', 'expired', 'suspended')
    .optional(),

  verificationStatus: Joi.string()
    .valid('pending', 'verified', 'rejected')
    .optional(),

  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(20)
    .optional(),

  offset: Joi.number()
    .integer()
    .min(0)
    .default(0)
    .optional()
}).custom((value, helpers) => {
  // Validate that maxPrice is greater than minPrice if both are provided
  if (value.minPrice && value.maxPrice && value.maxPrice <= value.minPrice) {
    return helpers.error('custom.maxPriceGreaterThanMin');
  }

  // Validate that eventDateTo is after eventDateFrom if both are provided
  if (value.eventDateFrom && value.eventDateTo && value.eventDateTo <= value.eventDateFrom) {
    return helpers.error('custom.eventDateToAfterFrom');
  }

  return value;
}, 'Price and date range validation').messages({
  'custom.maxPriceGreaterThanMin': 'Maximum price must be greater than minimum price',
  'custom.eventDateToAfterFrom': 'End date must be after start date'
});

// Image upload validation
export const imageUploadSchema = Joi.object({
  images: Joi.array()
    .items(Joi.object({
      fieldname: Joi.string().required(),
      originalname: Joi.string().required(),
      encoding: Joi.string().required(),
      mimetype: Joi.string().valid('image/jpeg', 'image/jpg', 'image/png', 'image/webp').required(),
      size: Joi.number().max(5 * 1024 * 1024).required(), // 5MB max
      buffer: Joi.binary().required()
    }))
    .min(1)
    .max(5)
    .required()
    .messages({
      'array.min': 'At least 1 image is required',
      'array.max': 'Maximum 5 images allowed',
      'any.required': 'Images are required'
    })
});

// Helper function to get category-specific validation schema
export function getCategoryValidationSchema(category: string): Joi.ObjectSchema {
  switch (category) {
    case 'concert':
      return concertListingSchema;
    case 'sports':
      return sportsListingSchema;
    case 'theater':
      return theaterListingSchema;
    case 'transportation':
      return transportationListingSchema;
    default:
      return createListingSchema;
  }
}