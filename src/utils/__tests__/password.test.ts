import { PasswordUtils } from '../password';

describe('PasswordUtils', () => {
  describe('hashPassword', () => {
    it('should hash a valid password', async () => {
      const password = 'TestPassword123!';
      const hash = await PasswordUtils.hashPassword(password);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(50); // bcrypt hashes are typically 60 characters
    });

    it('should generate different hashes for the same password', async () => {
      const password = 'TestPassword123!';
      const hash1 = await PasswordUtils.hashPassword(password);
      const hash2 = await PasswordUtils.hashPassword(password);

      expect(hash1).not.toBe(hash2);
    });

    it('should throw error for password shorter than 8 characters', async () => {
      await expect(PasswordUtils.hashPassword('short')).rejects.toThrow(
        'Password must be at least 8 characters long'
      );
    });

    it('should throw error for empty password', async () => {
      await expect(PasswordUtils.hashPassword('')).rejects.toThrow(
        'Password must be at least 8 characters long'
      );
    });
  });

  describe('verifyPassword', () => {
    it('should verify correct password', async () => {
      const password = 'TestPassword123!';
      const hash = await PasswordUtils.hashPassword(password);
      
      const isValid = await PasswordUtils.verifyPassword(password, hash);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const password = 'TestPassword123!';
      const wrongPassword = 'WrongPassword123!';
      const hash = await PasswordUtils.hashPassword(password);
      
      const isValid = await PasswordUtils.verifyPassword(wrongPassword, hash);
      expect(isValid).toBe(false);
    });

    it('should return false for empty password', async () => {
      const hash = await PasswordUtils.hashPassword('TestPassword123!');
      
      const isValid = await PasswordUtils.verifyPassword('', hash);
      expect(isValid).toBe(false);
    });

    it('should return false for empty hash', async () => {
      const isValid = await PasswordUtils.verifyPassword('TestPassword123!', '');
      expect(isValid).toBe(false);
    });
  });

  describe('validatePasswordStrength', () => {
    it('should validate strong password', () => {
      const password = 'StrongPassword123!';
      const result = PasswordUtils.validatePasswordStrength(password);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject password without lowercase letter', () => {
      const password = 'STRONGPASSWORD123!';
      const result = PasswordUtils.validatePasswordStrength(password);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one lowercase letter');
    });

    it('should reject password without uppercase letter', () => {
      const password = 'strongpassword123!';
      const result = PasswordUtils.validatePasswordStrength(password);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one uppercase letter');
    });

    it('should reject password without number', () => {
      const password = 'StrongPassword!';
      const result = PasswordUtils.validatePasswordStrength(password);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one number');
    });

    it('should reject password without special character', () => {
      const password = 'StrongPassword123';
      const result = PasswordUtils.validatePasswordStrength(password);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one special character');
    });

    it('should reject password shorter than 8 characters', () => {
      const password = 'Short1!';
      const result = PasswordUtils.validatePasswordStrength(password);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must be at least 8 characters long');
    });

    it('should reject password longer than 128 characters', () => {
      const password = 'A'.repeat(120) + 'a1234567!';
      const result = PasswordUtils.validatePasswordStrength(password);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must be less than 128 characters long');
    });

    it('should reject common weak passwords', () => {
      const weakPasswords = ['password', 'Password123!', 'Admin123!'];
      
      weakPasswords.forEach(password => {
        const result = PasswordUtils.validatePasswordStrength(password);
        if (password.toLowerCase() === 'password') {
          expect(result.isValid).toBe(false);
          expect(result.errors).toContain('Password is too common, please choose a stronger password');
        }
      });
    });

    it('should return multiple errors for very weak password', () => {
      const password = 'weak';
      const result = PasswordUtils.validatePasswordStrength(password);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
      expect(result.errors).toContain('Password must be at least 8 characters long');
      expect(result.errors).toContain('Password must contain at least one uppercase letter');
      expect(result.errors).toContain('Password must contain at least one number');
      expect(result.errors).toContain('Password must contain at least one special character');
    });

    it('should handle null/undefined password', () => {
      const result = PasswordUtils.validatePasswordStrength(null as any);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password is required');
    });
  });
});