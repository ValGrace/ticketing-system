import { validateImageFile, validateImageFiles } from '../utils/fileUpload';

describe('File Upload Security Tests', () => {
  describe('validateImageFile', () => {
    it('should reject files that are too large', () => {
      const largeFile = {
        fieldname: 'image',
        originalname: 'large.jpg',
        encoding: '7bit',
        mimetype: 'image/jpeg',
        size: 6 * 1024 * 1024, // 6MB
        buffer: Buffer.alloc(6 * 1024 * 1024)
      } as Express.Multer.File;

      const result = validateImageFile(largeFile);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('exceeds 5MB limit');
    });

    it('should reject files that are too small', () => {
      const tinyFile = {
        fieldname: 'image',
        originalname: 'tiny.jpg',
        encoding: '7bit',
        mimetype: 'image/jpeg',
        size: 500, // 500 bytes
        buffer: Buffer.alloc(500)
      } as Express.Multer.File;

      const result = validateImageFile(tinyFile);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('too small');
    });

    it('should reject invalid mime types', () => {
      const invalidFile = {
        fieldname: 'image',
        originalname: 'document.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: 2 * 1024 * 1024,
        buffer: Buffer.alloc(2 * 1024 * 1024)
      } as Express.Multer.File;

      const result = validateImageFile(invalidFile);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Invalid file type');
    });

    it('should reject empty files', () => {
      const emptyFile = {
        fieldname: 'image',
        originalname: 'empty.jpg',
        encoding: '7bit',
        mimetype: 'image/jpeg',
        size: 0,
        buffer: Buffer.alloc(0)
      } as Express.Multer.File;

      const result = validateImageFile(emptyFile);
      expect(result.isValid).toBe(false);
    });

    it('should reject files with mismatched extension and mime type', () => {
      const mismatchedFile = {
        fieldname: 'image',
        originalname: 'image.png',
        encoding: '7bit',
        mimetype: 'image/jpeg',
        size: 2 * 1024 * 1024,
        buffer: Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]) // JPEG signature
      } as Express.Multer.File;

      const result = validateImageFile(mismatchedFile);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('extension does not match');
    });

    it('should reject files with path traversal in name', () => {
      const maliciousFile = {
        fieldname: 'image',
        originalname: '../../etc/passwd.jpg',
        encoding: '7bit',
        mimetype: 'image/jpeg',
        size: 2 * 1024 * 1024,
        buffer: Buffer.from([0xFF, 0xD8, 0xFF, 0xE0])
      } as Express.Multer.File;

      const result = validateImageFile(maliciousFile);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Invalid file name');
    });

    it('should reject files with executable extensions', () => {
      const executableFile = {
        fieldname: 'image',
        originalname: 'malware.exe',
        encoding: '7bit',
        mimetype: 'image/jpeg',
        size: 2 * 1024 * 1024,
        buffer: Buffer.alloc(2 * 1024 * 1024)
      } as Express.Multer.File;

      const result = validateImageFile(executableFile);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Invalid file name');
    });

    it('should reject SVG files (can contain scripts)', () => {
      const svgFile = {
        fieldname: 'image',
        originalname: 'image.svg',
        encoding: '7bit',
        mimetype: 'image/svg+xml',
        size: 2 * 1024,
        buffer: Buffer.from('<svg></svg>')
      } as Express.Multer.File;

      const result = validateImageFile(svgFile);
      expect(result.isValid).toBe(false);
    });

    it('should reject files with invalid JPEG signature', () => {
      const invalidJpeg = {
        fieldname: 'image',
        originalname: 'fake.jpg',
        encoding: '7bit',
        mimetype: 'image/jpeg',
        size: 2 * 1024 * 1024,
        buffer: Buffer.from([0x00, 0x00, 0x00, 0x00]) // Invalid signature
      } as Express.Multer.File;

      const result = validateImageFile(invalidJpeg);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('does not match declared type');
    });

    it('should accept valid JPEG files', () => {
      const validJpeg = {
        fieldname: 'image',
        originalname: 'photo.jpg',
        encoding: '7bit',
        mimetype: 'image/jpeg',
        size: 2 * 1024 * 1024,
        buffer: Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, ...Array(2 * 1024 * 1024 - 4).fill(0)])
      } as Express.Multer.File;

      const result = validateImageFile(validJpeg);
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept valid PNG files', () => {
      const validPng = {
        fieldname: 'image',
        originalname: 'photo.png',
        encoding: '7bit',
        mimetype: 'image/png',
        size: 2 * 1024 * 1024,
        buffer: Buffer.from([0x89, 0x50, 0x4E, 0x47, ...Array(2 * 1024 * 1024 - 4).fill(0)])
      } as Express.Multer.File;

      const result = validateImageFile(validPng);
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept valid WebP files', () => {
      const validWebp = {
        fieldname: 'image',
        originalname: 'photo.webp',
        encoding: '7bit',
        mimetype: 'image/webp',
        size: 2 * 1024 * 1024,
        buffer: Buffer.from([0x52, 0x49, 0x46, 0x46, ...Array(2 * 1024 * 1024 - 4).fill(0)])
      } as Express.Multer.File;

      const result = validateImageFile(validWebp);
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  describe('validateImageFiles', () => {
    it('should reject when no files provided', () => {
      const result = validateImageFiles([]);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('At least 1 image is required');
    });

    it('should reject when too many files provided', () => {
      const files = Array(6).fill({
        fieldname: 'image',
        originalname: 'photo.jpg',
        encoding: '7bit',
        mimetype: 'image/jpeg',
        size: 2 * 1024 * 1024,
        buffer: Buffer.from([0xFF, 0xD8, 0xFF, 0xE0])
      }) as Express.Multer.File[];

      const result = validateImageFiles(files);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Maximum 5 images allowed');
    });

    it('should validate each file individually', () => {
      const files = [
        {
          fieldname: 'image',
          originalname: 'valid.jpg',
          encoding: '7bit',
          mimetype: 'image/jpeg',
          size: 2 * 1024 * 1024,
          buffer: Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, ...Array(2 * 1024 * 1024 - 4).fill(0)])
        },
        {
          fieldname: 'image',
          originalname: 'toolarge.jpg',
          encoding: '7bit',
          mimetype: 'image/jpeg',
          size: 6 * 1024 * 1024,
          buffer: Buffer.alloc(6 * 1024 * 1024)
        }
      ] as Express.Multer.File[];

      const result = validateImageFiles(files);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('File 2');
    });

    it('should accept valid file arrays', () => {
      const files = [
        {
          fieldname: 'image',
          originalname: 'photo1.jpg',
          encoding: '7bit',
          mimetype: 'image/jpeg',
          size: 2 * 1024 * 1024,
          buffer: Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, ...Array(2 * 1024 * 1024 - 4).fill(0)])
        },
        {
          fieldname: 'image',
          originalname: 'photo2.png',
          encoding: '7bit',
          mimetype: 'image/png',
          size: 1 * 1024 * 1024,
          buffer: Buffer.from([0x89, 0x50, 0x4E, 0x47, ...Array(1 * 1024 * 1024 - 4).fill(0)])
        }
      ] as Express.Multer.File[];

      const result = validateImageFiles(files);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe('Security Edge Cases', () => {
    it('should reject double extension files', () => {
      const doubleExtFile = {
        fieldname: 'image',
        originalname: 'image.jpg.exe',
        encoding: '7bit',
        mimetype: 'image/jpeg',
        size: 2 * 1024 * 1024,
        buffer: Buffer.from([0xFF, 0xD8, 0xFF, 0xE0])
      } as Express.Multer.File;

      const result = validateImageFile(doubleExtFile);
      expect(result.isValid).toBe(false);
    });

    it('should reject files with null bytes in name', () => {
      const nullByteFile = {
        fieldname: 'image',
        originalname: 'image.jpg\0.exe',
        encoding: '7bit',
        mimetype: 'image/jpeg',
        size: 2 * 1024 * 1024,
        buffer: Buffer.from([0xFF, 0xD8, 0xFF, 0xE0])
      } as Express.Multer.File;

      const result = validateImageFile(nullByteFile);
      expect(result.isValid).toBe(false);
    });

    it('should handle unicode characters in filenames safely', () => {
      const unicodeFile = {
        fieldname: 'image',
        originalname: '图片.jpg',
        encoding: '7bit',
        mimetype: 'image/jpeg',
        size: 2 * 1024 * 1024,
        buffer: Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, ...Array(2 * 1024 * 1024 - 4).fill(0)])
      } as Express.Multer.File;

      const result = validateImageFile(unicodeFile);
      expect(result.isValid).toBe(true);
    });
  });
});
