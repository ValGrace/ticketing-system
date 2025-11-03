import { Router } from 'express';
import { AuthController } from '../controllers/AuthController';
import { AuthService } from '../services/AuthService';
import { UserRepository } from '../models/UserRepository';
import { DatabaseConnection } from '../types';
import {
  authenticateToken,
  authRateLimit,
  passwordResetRateLimit,
  validateRequest
} from '../middleware/auth';
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  changePasswordSchema
} from '../validation/auth';

/**
 * @swagger
 * components:
 *   schemas:
 *     LoginRequest:
 *       type: object
 *       required:
 *         - email
 *         - password
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           description: User email address
 *         password:
 *           type: string
 *           minLength: 8
 *           description: User password
 *     RegisterRequest:
 *       type: object
 *       required:
 *         - email
 *         - password
 *         - username
 *         - firstName
 *         - lastName
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           description: User email address
 *         password:
 *           type: string
 *           minLength: 8
 *           description: User password
 *         username:
 *           type: string
 *           minLength: 3
 *           description: Unique username
 *         firstName:
 *           type: string
 *           description: User first name
 *         lastName:
 *           type: string
 *           description: User last name
 *         phoneNumber:
 *           type: string
 *           description: User phone number
 *     AuthResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *         message:
 *           type: string
 *         data:
 *           type: object
 *           properties:
 *             user:
 *               $ref: '#/components/schemas/User'
 *             accessToken:
 *               type: string
 *               description: JWT access token
 *             refreshToken:
 *               type: string
 *               description: JWT refresh token
 *             expiresIn:
 *               type: number
 *               description: Token expiration time in seconds
 *         timestamp:
 *           type: string
 *           format: date-time
 *         requestId:
 *           type: string
 */

export function createAuthRoutes(connection: DatabaseConnection): Router {
  const router = Router();
  
  // Initialize dependencies
  const userRepository = new UserRepository(connection);
  const authService = new AuthService(userRepository);
  const authController = new AuthController(authService);

  // Public routes with rate limiting
  
  /**
   * @swagger
   * /api/auth/register:
   *   post:
   *     summary: Register a new user
   *     description: Create a new user account with email verification
   *     tags: [Authentication]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/RegisterRequest'
   *     responses:
   *       201:
   *         description: User registered successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/AuthResponse'
   *       400:
   *         $ref: '#/components/responses/BadRequest'
   *       409:
   *         $ref: '#/components/responses/Conflict'
   *       429:
   *         $ref: '#/components/responses/TooManyRequests'
   */
  router.post('/register', 
    authRateLimit,
    validateRequest(registerSchema),
    authController.register
  );

  /**
   * @swagger
   * /api/auth/login:
   *   post:
   *     summary: User login
   *     description: Authenticate user and return access/refresh tokens
   *     tags: [Authentication]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/LoginRequest'
   *     responses:
   *       200:
   *         description: Login successful
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/AuthResponse'
   *       400:
   *         $ref: '#/components/responses/BadRequest'
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   *       429:
   *         $ref: '#/components/responses/TooManyRequests'
   */
  router.post('/login',
    authRateLimit,
    validateRequest(loginSchema),
    authController.login
  );

  /**
   * @swagger
   * /api/auth/refresh:
   *   post:
   *     summary: Refresh access token
   *     description: Generate new access token using refresh token
   *     tags: [Authentication]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - refreshToken
   *             properties:
   *               refreshToken:
   *                 type: string
   *                 description: Valid refresh token
   *     responses:
   *       200:
   *         description: Token refreshed successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/AuthResponse'
   *       400:
   *         $ref: '#/components/responses/BadRequest'
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   *       429:
   *         $ref: '#/components/responses/TooManyRequests'
   */
  router.post('/refresh',
    authRateLimit,
    validateRequest(refreshTokenSchema),
    authController.refreshToken
  );

  /**
   * @swagger
   * /api/auth/logout:
   *   post:
   *     summary: User logout
   *     description: Invalidate refresh token and logout user
   *     tags: [Authentication]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - refreshToken
   *             properties:
   *               refreshToken:
   *                 type: string
   *                 description: Refresh token to invalidate
   *     responses:
   *       200:
   *         description: Logout successful
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   *       400:
   *         $ref: '#/components/responses/BadRequest'
   */
  router.post('/logout',
    validateRequest(refreshTokenSchema),
    authController.logout
  );

  // Protected routes
  router.get('/profile',
    authenticateToken,
    authController.getProfile
  );

  router.post('/change-password',
    authenticateToken,
    passwordResetRateLimit,
    validateRequest(changePasswordSchema),
    authController.changePassword
  );

  return router;
}