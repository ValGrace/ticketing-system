import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// Store for tracking failed login attempts
interface LoginAttempt {
    count: number;
    firstAttempt: number;
    blockedUntil?: number;
}

const loginAttempts = new Map<string, LoginAttempt>();
const ATTEMPT_WINDOW = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5;
const BLOCK_DURATION = 30 * 60 * 1000; // 30 minutes

// XSS Protection - Sanitize input strings
export function sanitizeString(input: string): string {
    if (typeof input !== 'string') return input;

    return input
        .replace(/[<>]/g, '') // Remove < and >
        .replace(/javascript:/gi, '') // Remove javascript: protocol
        .replace(/on\w+\s*=/gi, '') // Remove event handlers like onclick=
        .replace(/&lt;script&gt;/gi, '') // Remove encoded script tags
        .replace(/&lt;\/script&gt;/gi, '')
        .trim();
}

// SQL Injection Protection - Validate and sanitize SQL-like patterns
export function containsSQLInjection(input: string): boolean {
    if (typeof input !== 'string') return false;

    const sqlPatterns = [
        /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION|DECLARE)\b)/gi,
        /(--|\;|\/\*|\*\/|xp_|sp_)/gi,
        /('|(\\')|(--)|(\#)|(%23)|(\/\*))/gi,
        /(\bOR\b.*=.*|1=1|1=0)/gi
    ];

    return sqlPatterns.some(pattern => pattern.test(input));
}

// Path Traversal Protection
export function containsPathTraversal(input: string): boolean {
    if (typeof input !== 'string') return false;

    const pathTraversalPatterns = [
        /\.\./g,
        /\.\.\//g,
        /\.\.\\/g,
        /\/etc\/|\/proc\/|\/sys\//gi,
        /%2e%2e/gi,
        /\.\.%2f/gi
    ];

    return pathTraversalPatterns.some(pattern => pattern.test(input));
}

// Command Injection Protection
export function containsCommandInjection(input: string): boolean {
    if (typeof input !== 'string') return false;

    const commandPatterns = [
        /(\||&|;|\$\(|\`|<|>)/g,
        /(cmd|exec|system|eval|base64_decode|passthru|shell_exec)/gi
    ];

    return commandPatterns.some(pattern => pattern.test(input));
}

// Comprehensive input sanitization middleware
export const sanitizeInput = (req: Request, res: Response, next: NextFunction): void => {
    try {
        // Sanitize body
        if (req.body && typeof req.body === 'object') {
            req.body = sanitizeObject(req.body);
        }

        // Sanitize query parameters
        if (req.query && typeof req.query === 'object') {
            req.query = sanitizeObject(req.query);
        }

        // Sanitize URL parameters
        if (req.params && typeof req.params === 'object') {
            req.params = sanitizeObject(req.params);
        }

        next();
    } catch (error) {
        res.status(400).json({
            error: {
                code: 'SANITIZATION_ERROR',
                message: 'Invalid input data',
                timestamp: new Date().toISOString(),
                requestId: req.headers['x-request-id'] || 'unknown'
            }
        });
    }
};

// Recursively sanitize object properties
function sanitizeObject(obj: any): any {
    if (typeof obj === 'string') {
        return sanitizeString(obj);
    }

    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeObject(item));
    }

    if (obj !== null && typeof obj === 'object') {
        const sanitized: any = {};
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                sanitized[key] = sanitizeObject(obj[key]);
            }
        }
        return sanitized;
    }

    return obj;
}

// SQL Injection detection middleware
export const detectSQLInjection = (req: Request, res: Response, next: NextFunction): void => {
    const checkForSQLInjection = (obj: any, path: string = ''): string | null => {
        if (typeof obj === 'string') {
            if (containsSQLInjection(obj)) {
                return path || 'input';
            }
        } else if (Array.isArray(obj)) {
            for (let i = 0; i < obj.length; i++) {
                const result = checkForSQLInjection(obj[i], `${path}[${i}]`);
                if (result) return result;
            }
        } else if (obj !== null && typeof obj === 'object') {
            for (const key in obj) {
                if (Object.prototype.hasOwnProperty.call(obj, key)) {
                    const newPath = path ? `${path}.${key}` : key;
                    const result = checkForSQLInjection(obj[key], newPath);
                    if (result) return result;
                }
            }
        }
        return null;
    };

    // Check body, query, and params
    const bodyCheck = req.body ? checkForSQLInjection(req.body, 'body') : null;
    const queryCheck = req.query ? checkForSQLInjection(req.query, 'query') : null;
    const paramsCheck = req.params ? checkForSQLInjection(req.params, 'params') : null;

    const suspiciousField = bodyCheck || queryCheck || paramsCheck;

    if (suspiciousField) {
        // Log security incident
        console.warn('SQL Injection attempt detected', {
            ip: req.ip,
            url: req.originalUrl,
            field: suspiciousField,
            timestamp: new Date().toISOString()
        });

        res.status(400).json({
            error: {
                code: 'INVALID_INPUT',
                message: 'Invalid input detected',
                timestamp: new Date().toISOString(),
                requestId: req.headers['x-request-id'] || 'unknown'
            }
        });
        return;
    }

    next();
};

// XSS detection middleware
export const detectXSS = (req: Request, res: Response, next: NextFunction): void => {
    const xssPatterns = [
        /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
        /javascript:/gi,
        /on\w+\s*=/gi,
        /<iframe/gi,
        /<object/gi,
        /<embed/gi,
        /vbscript:/gi,
        /onerror\s*=/gi,
        /onload\s*=/gi
    ];

    const checkForXSS = (obj: any): boolean => {
        if (typeof obj === 'string') {
            return xssPatterns.some(pattern => pattern.test(obj));
        } else if (Array.isArray(obj)) {
            return obj.some(item => checkForXSS(item));
        } else if (obj !== null && typeof obj === 'object') {
            return Object.values(obj).some(value => checkForXSS(value));
        }
        return false;
    };

    const hasXSS = checkForXSS(req.body) || checkForXSS(req.query) || checkForXSS(req.params);

    if (hasXSS) {
        console.warn('XSS attempt detected', {
            ip: req.ip,
            url: req.originalUrl,
            timestamp: new Date().toISOString()
        });

        res.status(400).json({
            error: {
                code: 'INVALID_INPUT',
                message: 'Invalid input detected',
                timestamp: new Date().toISOString(),
                requestId: req.headers['x-request-id'] || 'unknown'
            }
        });
        return;
    }

    next();
};

// Path traversal detection middleware
export const detectPathTraversal = (req: Request, res: Response, next: NextFunction): void => {
    const checkForPathTraversal = (obj: any): boolean => {
        if (typeof obj === 'string') {
            return containsPathTraversal(obj);
        } else if (Array.isArray(obj)) {
            return obj.some(item => checkForPathTraversal(item));
        } else if (obj !== null && typeof obj === 'object') {
            return Object.values(obj).some(value => checkForPathTraversal(value));
        }
        return false;
    };

    const hasPathTraversal = checkForPathTraversal(req.body) ||
        checkForPathTraversal(req.query) ||
        checkForPathTraversal(req.params);

    if (hasPathTraversal) {
        console.warn('Path traversal attempt detected', {
            ip: req.ip,
            url: req.originalUrl,
            timestamp: new Date().toISOString()
        });

        res.status(400).json({
            error: {
                code: 'INVALID_INPUT',
                message: 'Invalid input detected',
                timestamp: new Date().toISOString(),
                requestId: req.headers['x-request-id'] || 'unknown'
            }
        });
        return;
    }

    next();
};

// Brute force protection for login attempts
export const bruteForceProtection = (req: Request, res: Response, next: NextFunction): void => {
    const identifier = req.body.email || req.ip || 'unknown';
    const now = Date.now();

    const attempt = loginAttempts.get(identifier);

    if (attempt) {
        // Check if currently blocked
        if (attempt.blockedUntil && now < attempt.blockedUntil) {
            const remainingTime = Math.ceil((attempt.blockedUntil - now) / 1000 / 60);
            res.status(429).json({
                error: {
                    code: 'ACCOUNT_TEMPORARILY_LOCKED',
                    message: `Too many failed login attempts. Please try again in ${remainingTime} minutes.`,
                    timestamp: new Date().toISOString(),
                    requestId: req.headers['x-request-id'] || 'unknown',
                    retryAfter: remainingTime * 60
                }
            });
            return;
        }

        // Reset if outside attempt window
        if (now - attempt.firstAttempt > ATTEMPT_WINDOW) {
            loginAttempts.delete(identifier);
        }
    }

    // Store request for tracking (will be updated after authentication)
    req.bruteForceIdentifier = identifier;

    next();
};

// Track failed login attempt
export function recordFailedLogin(identifier: string): void {
    const now = Date.now();
    const attempt = loginAttempts.get(identifier);

    if (attempt) {
        attempt.count++;

        // Block if max attempts reached
        if (attempt.count >= MAX_ATTEMPTS) {
            attempt.blockedUntil = now + BLOCK_DURATION;
            console.warn('Account temporarily locked due to failed login attempts', {
                identifier,
                attempts: attempt.count,
                blockedUntil: new Date(attempt.blockedUntil).toISOString()
            });
        }
    } else {
        loginAttempts.set(identifier, {
            count: 1,
            firstAttempt: now
        });
    }
}

// Clear login attempts on successful login
export function clearLoginAttempts(identifier: string): void {
    loginAttempts.delete(identifier);
}

// Secure session validation middleware
export const validateSession = (req: Request, res: Response, next: NextFunction): void => {
    // Check for session token
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
        res.status(401).json({
            error: {
                code: 'UNAUTHORIZED',
                message: 'Authentication required',
                timestamp: new Date().toISOString(),
                requestId: req.headers['x-request-id'] || 'unknown'
            }
        });
        return;
    }

    // Additional session validation would go here
    // (JWT validation is handled by separate auth middleware)

    next();
};

// Content-Type validation middleware
export const validateContentType = (req: Request, res: Response, next: NextFunction): void => {
    // Only validate for requests with body
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        const contentType = req.headers['content-type'];

        if (!contentType) {
            res.status(400).json({
                error: {
                    code: 'MISSING_CONTENT_TYPE',
                    message: 'Content-Type header is required',
                    timestamp: new Date().toISOString(),
                    requestId: req.headers['x-request-id'] || 'unknown'
                }
            });
            return;
        }

        // Allow application/json and multipart/form-data
        const allowedTypes = ['application/json', 'multipart/form-data'];
        const isAllowed = allowedTypes.some(type => contentType.includes(type));

        if (!isAllowed) {
            res.status(415).json({
                error: {
                    code: 'UNSUPPORTED_MEDIA_TYPE',
                    message: 'Content-Type must be application/json or multipart/form-data',
                    timestamp: new Date().toISOString(),
                    requestId: req.headers['x-request-id'] || 'unknown'
                }
            });
            return;
        }
    }

    next();
};

// Request size limit middleware
export const requestSizeLimit = (maxSize: number = 10 * 1024 * 1024) => {
    return (req: Request, res: Response, next: NextFunction): void => {
        const contentLength = req.headers['content-length'];

        if (contentLength && parseInt(contentLength) > maxSize) {
            res.status(413).json({
                error: {
                    code: 'PAYLOAD_TOO_LARGE',
                    message: `Request size exceeds maximum allowed size of ${maxSize / 1024 / 1024}MB`,
                    timestamp: new Date().toISOString(),
                    requestId: req.headers['x-request-id'] || 'unknown'
                }
            });
            return;
        }

        next();
    };
};

// CSRF token generation and validation
export function generateCSRFToken(): string {
    return crypto.randomBytes(32).toString('hex');
}

export const csrfProtection = (req: Request, res: Response, next: NextFunction): void => {
    // Skip CSRF for GET, HEAD, OPTIONS
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return next();
    }

    const token = req.headers['x-csrf-token'] as string;
    const sessionToken = req.session?.csrfToken;

    if (!token || !sessionToken || token !== sessionToken) {
        res.status(403).json({
            error: {
                code: 'INVALID_CSRF_TOKEN',
                message: 'Invalid or missing CSRF token',
                timestamp: new Date().toISOString(),
                requestId: req.headers['x-request-id'] || 'unknown'
            }
        });
        return;
    }

    next();
};

// Extend Express Request interface
declare global {
    namespace Express {
        interface Request {
            bruteForceIdentifier?: string;
            session?: {
                csrfToken?: string;
            };
        }
    }
}

// Combined security middleware stack
export const securityMiddlewareStack = [
    sanitizeInput,
    detectSQLInjection,
    detectXSS,
    detectPathTraversal,
    validateContentType,
    requestSizeLimit()
];
