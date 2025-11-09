import multer from 'multer';
import AWS from 'aws-sdk';
import { Request } from 'express';
import path from 'path';
import crypto from 'crypto';

// Configure AWS S3
const s3 = new AWS.S3({
  accessKeyId: process.env['AWS_ACCESS_KEY_ID'] || '',
  secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY'] || '',
  region: process.env['AWS_REGION'] || 'us-east-1'
});

const BUCKET_NAME = process.env['AWS_S3_BUCKET'] || 'ticket-resell-platform-images';

// Multer configuration for memory storage
const storage = multer.memoryStorage();

// File filter for images only
const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Check file type
  const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, and WebP images are allowed.'));
  }
};

// Multer upload configuration
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB per file
    files: 5 // Maximum 5 files
  }
});

// Interface for upload result
export interface UploadResult {
  url: string;
  key: string;
  originalName: string;
  size: number;
}

// Upload single file to S3
export async function uploadFileToS3(
  file: Express.Multer.File,
  folder: string = 'listings'
): Promise<UploadResult> {
  try {
    // Generate unique filename
    const fileExtension = path.extname(file.originalname);
    const fileName = `${crypto.randomUUID()}${fileExtension}`;
    const key = `${folder}/${fileName}`;

    // Upload parameters
    const uploadParams: AWS.S3.PutObjectRequest = {
      Bucket: BUCKET_NAME,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      ACL: 'public-read',
      Metadata: {
        originalName: file.originalname,
        uploadedAt: new Date().toISOString()
      }
    };

    // Upload to S3
    const result = await s3.upload(uploadParams).promise();

    return {
      url: result.Location,
      key: result.Key,
      originalName: file.originalname,
      size: file.size
    };
  } catch (error) {
    console.error('Error uploading file to S3:', error);
    throw new Error('Failed to upload image');
  }
}

// Upload multiple files to S3
export async function uploadFilesToS3(
  files: Express.Multer.File[],
  folder: string = 'listings'
): Promise<UploadResult[]> {
  try {
    const uploadPromises = files.map(file => uploadFileToS3(file, folder));
    return await Promise.all(uploadPromises);
  } catch (error) {
    console.error('Error uploading files to S3:', error);
    throw new Error('Failed to upload images');
  }
}

// Delete file from S3
export async function deleteFileFromS3(key: string): Promise<boolean> {
  try {
    const deleteParams: AWS.S3.DeleteObjectRequest = {
      Bucket: BUCKET_NAME,
      Key: key
    };

    await s3.deleteObject(deleteParams).promise();
    return true;
  } catch (error) {
    console.error('Error deleting file from S3:', error);
    return false;
  }
}

// Delete multiple files from S3
export async function deleteFilesFromS3(keys: string[]): Promise<boolean[]> {
  try {
    const deletePromises = keys.map(key => deleteFileFromS3(key));
    return await Promise.all(deletePromises);
  } catch (error) {
    console.error('Error deleting files from S3:', error);
    return keys.map(() => false);
  }
}

// Extract S3 key from URL
export function extractS3KeyFromUrl(url: string): string | null {
  try {
    const urlParts = new URL(url);
    // Remove leading slash
    return urlParts.pathname.substring(1);
  } catch (error) {
    console.error('Error extracting S3 key from URL:', error);
    return null;
  }
}

// Validate image file with enhanced security checks
export function validateImageFile(file: Express.Multer.File): { isValid: boolean; error?: string } {
  // Check file size (5MB max)
  if (file.size > 5 * 1024 * 1024) {
    return { isValid: false, error: 'File size exceeds 5MB limit' };
  }

  // Check minimum file size (1KB to prevent empty/malicious files)
  if (file.size < 1024) {
    return { isValid: false, error: 'File is too small or empty' };
  }

  // Check file type
  const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!allowedMimeTypes.includes(file.mimetype)) {
    return { isValid: false, error: 'Invalid file type. Only JPEG, PNG, and WebP images are allowed.' };
  }

  // Check if file has content
  if (!file.buffer || file.buffer.length === 0) {
    return { isValid: false, error: 'File is empty' };
  }

  // Validate file extension matches mime type
  const ext = path.extname(file.originalname).toLowerCase();
  const mimeTypeExtensions: { [key: string]: string[] } = {
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/png': ['.png'],
    'image/webp': ['.webp']
  };

  const allowedExtensions = mimeTypeExtensions[file.mimetype] || [];
  if (!allowedExtensions.includes(ext)) {
    return { isValid: false, error: 'File extension does not match file type' };
  }

  // Check for malicious file names
  if (containsMaliciousFileName(file.originalname)) {
    return { isValid: false, error: 'Invalid file name' };
  }

  // Validate file signature (magic numbers) for common image types
  if (!validateFileSignature(file.buffer, file.mimetype)) {
    return { isValid: false, error: 'File content does not match declared type' };
  }

  return { isValid: true };
}

// Check for malicious file names
function containsMaliciousFileName(filename: string): boolean {
  // Check for path traversal attempts
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return true;
  }

  // Check for null bytes
  if (filename.includes('\0')) {
    return true;
  }

  // Check for executable extensions hidden in name
  const dangerousPatterns = [
    /\.exe$/i,
    /\.bat$/i,
    /\.cmd$/i,
    /\.sh$/i,
    /\.php$/i,
    /\.js$/i,
    /\.html$/i,
    /\.svg$/i // SVG can contain scripts
  ];

  return dangerousPatterns.some(pattern => pattern.test(filename));
}

// Validate file signature (magic numbers)
function validateFileSignature(buffer: Buffer, mimetype: string): boolean {
  if (!buffer || buffer.length < 4) {
    return false;
  }

  // Check magic numbers for different file types
  const signatures: { [key: string]: number[][] } = {
    'image/jpeg': [
      [0xFF, 0xD8, 0xFF] // JPEG
    ],
    'image/png': [
      [0x89, 0x50, 0x4E, 0x47] // PNG
    ],
    'image/webp': [
      [0x52, 0x49, 0x46, 0x46] // RIFF (WebP container)
    ]
  };

  const fileSignatures = signatures[mimetype];
  if (!fileSignatures) {
    return false;
  }

  // Check if buffer starts with any of the valid signatures
  return fileSignatures.some(signature => {
    return signature.every((byte, index) => buffer[index] === byte);
  });
}

// Validate multiple image files
export function validateImageFiles(files: Express.Multer.File[]): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check number of files
  if (files.length === 0) {
    errors.push('At least 1 image is required');
  }

  if (files.length > 5) {
    errors.push('Maximum 5 images allowed');
  }

  // Validate each file
  files.forEach((file, index) => {
    const validation = validateImageFile(file);
    if (!validation.isValid) {
      errors.push(`File ${index + 1}: ${validation.error}`);
    }
  });

  return {
    isValid: errors.length === 0,
    errors
  };
}

// Middleware for handling file upload errors
export function handleUploadError(error: any, _req: Request, res: any, _next: any) {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: {
          code: 'FILE_TOO_LARGE',
          message: 'File size exceeds 5MB limit',
          details: error.message
        }
      });
    }

    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        error: {
          code: 'TOO_MANY_FILES',
          message: 'Maximum 5 files allowed',
          details: error.message
        }
      });
    }

    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        error: {
          code: 'UNEXPECTED_FILE',
          message: 'Unexpected file field',
          details: error.message
        }
      });
    }
  }

  if (error.message.includes('Invalid file type')) {
    return res.status(400).json({
      error: {
        code: 'INVALID_FILE_TYPE',
        message: error.message,
        details: 'Only JPEG, PNG, and WebP images are allowed'
      }
    });
  }

  // Generic upload error
  return res.status(500).json({
    error: {
      code: 'UPLOAD_ERROR',
      message: 'Failed to upload files',
      details: error.message
    }
  });
}