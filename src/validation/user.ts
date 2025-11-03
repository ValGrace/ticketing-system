import { Request, Response, NextFunction } from 'express';

export interface UpdateProfileRequest {
    firstName?: string;
    lastName?: string;
    phoneNumber?: string;
    profileImage?: string;
}

export interface DeleteAccountRequest {
    confirmDeletion: boolean;
}

/**
 * Validate update profile request
 */
export const validateUpdateProfile = (req: Request, res: Response, next: NextFunction): void => {
    const { firstName, lastName, phoneNumber, profileImage } = req.body as UpdateProfileRequest;
    const errors: string[] = [];

    // Validate firstName
    if (firstName !== undefined) {
        if (typeof firstName !== 'string') {
            errors.push('First name must be a string');
        } else if (firstName.trim().length === 0) {
            errors.push('First name cannot be empty');
        } else if (firstName.length > 50) {
            errors.push('First name must be 50 characters or less');
        } else if (!/^[a-zA-Z\s\-'\.]+$/.test(firstName)) {
            errors.push('First name contains invalid characters');
        }
    }

    // Validate lastName
    if (lastName !== undefined) {
        if (typeof lastName !== 'string') {
            errors.push('Last name must be a string');
        } else if (lastName.trim().length === 0) {
            errors.push('Last name cannot be empty');
        } else if (lastName.length > 50) {
            errors.push('Last name must be 50 characters or less');
        } else if (!/^[a-zA-Z\s\-'\.]+$/.test(lastName)) {
            errors.push('Last name contains invalid characters');
        }
    }

    // Validate phoneNumber
    if (phoneNumber !== undefined) {
        if (phoneNumber !== null && typeof phoneNumber !== 'string') {
            errors.push('Phone number must be a string or null');
        } else if (phoneNumber && !/^\+?[\d\s\-\(\)]{10,20}$/.test(phoneNumber)) {
            errors.push('Invalid phone number format. Use international format with country code');
        }
    }

    // Validate profileImage
    if (profileImage !== undefined) {
        if (profileImage !== null && typeof profileImage !== 'string') {
            errors.push('Profile image must be a string URL or null');
        } else if (profileImage && profileImage.length > 500) {
            errors.push('Profile image URL must be 500 characters or less');
        } else if (profileImage && !isValidUrl(profileImage)) {
            errors.push('Profile image must be a valid URL');
        }
    }

    // Check if at least one field is provided
    if (firstName === undefined && lastName === undefined && phoneNumber === undefined && profileImage === undefined) {
        errors.push('At least one field must be provided for update');
    }

    if (errors.length > 0) {
        res.status(400).json({
            error: {
                code: 'VALIDATION_ERROR',
                message: 'Invalid input data',
                details: errors,
                timestamp: new Date().toISOString(),
                requestId: req.headers['x-request-id'] || 'unknown'
            }
        });
        return;
    }

    next();
};

/**
 * Validate delete account request
 */
export const validateDeleteAccount = (req: Request, res: Response, next: NextFunction): void => {
    const { confirmDeletion } = req.body as DeleteAccountRequest;
    const errors: string[] = [];

    if (confirmDeletion === undefined) {
        errors.push('confirmDeletion field is required');
    } else if (typeof confirmDeletion !== 'boolean') {
        errors.push('confirmDeletion must be a boolean');
    } else if (confirmDeletion !== true) {
        errors.push('confirmDeletion must be true to proceed with account deletion');
    }

    if (errors.length > 0) {
        res.status(400).json({
            error: {
                code: 'VALIDATION_ERROR',
                message: 'Invalid input data',
                details: errors,
                timestamp: new Date().toISOString(),
                requestId: req.headers['x-request-id'] || 'unknown'
            }
        });
        return;
    }

    next();
};

/**
 * Validate pagination parameters
 */
export const validatePagination = (req: Request, res: Response, next: NextFunction): void => {
    const limit = req.query['limit'] ? parseInt(req.query['limit'] as string) : undefined;
    const offset = req.query['offset'] ? parseInt(req.query['offset'] as string) : undefined;
    const errors: string[] = [];

    if (limit !== undefined) {
        if (isNaN(limit) || limit < 1 || limit > 100) {
            errors.push('Limit must be a number between 1 and 100');
        }
    }

    if (offset !== undefined) {
        if (isNaN(offset) || offset < 0) {
            errors.push('Offset must be a non-negative number');
        }
    }

    if (errors.length > 0) {
        res.status(400).json({
            error: {
                code: 'VALIDATION_ERROR',
                message: 'Invalid pagination parameters',
                details: errors,
                timestamp: new Date().toISOString(),
                requestId: req.headers['x-request-id'] || 'unknown'
            }
        });
        return;
    }

    next();
};

/**
 * Validate search query
 */
export const validateSearchQuery = (req: Request, res: Response, next: NextFunction): void => {
    const { q: searchTerm } = req.query;
    const errors: string[] = [];

    if (!searchTerm) {
        errors.push('Search term (q) is required');
    } else if (typeof searchTerm !== 'string') {
        errors.push('Search term must be a string');
    } else if (searchTerm.trim().length < 2) {
        errors.push('Search term must be at least 2 characters long');
    } else if (searchTerm.length > 100) {
        errors.push('Search term must be 100 characters or less');
    }

    if (errors.length > 0) {
        res.status(400).json({
            error: {
                code: 'VALIDATION_ERROR',
                message: 'Invalid search parameters',
                details: errors,
                timestamp: new Date().toISOString(),
                requestId: req.headers['x-request-id'] || 'unknown'
            }
        });
        return;
    }

    next();
};

/**
 * Validate user status parameter
 */
export const validateUserStatus = (req: Request, res: Response, next: NextFunction): void => {
    const { status } = req.params;
    const validStatuses = ['active', 'suspended', 'banned'];
    const errors: string[] = [];

    if (!status) {
        errors.push('Status parameter is required');
    } else if (!validStatuses.includes(status)) {
        errors.push(`Status must be one of: ${validStatuses.join(', ')}`);
    }

    if (errors.length > 0) {
        res.status(400).json({
            error: {
                code: 'VALIDATION_ERROR',
                message: 'Invalid status parameter',
                details: errors,
                timestamp: new Date().toISOString(),
                requestId: req.headers['x-request-id'] || 'unknown'
            }
        });
        return;
    }

    next();
};

/**
 * Helper function to validate URL format
 */
function isValidUrl(url: string): boolean {
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
}