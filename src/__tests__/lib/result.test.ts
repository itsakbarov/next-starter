import {
  classifyError,
  err,
  formatErrorResponse,
  getStatusCode,
  ok,
  tryCatch,
  tryCatchSync,
} from '@/lib/result';

describe('Result System', () => {
  describe('ok', () => {
    it('should create a success result', () => {
      const result = ok('test data');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('test data');
      }
    });
  });

  describe('err', () => {
    it('should create an error result', () => {
      const result = err('validation', 'Invalid input');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.category).toBe('validation');
        expect(result.error.message).toBe('Invalid input');
      }
    });

    it('should include optional fields', () => {
      const result = err('database', 'DB error', {
        code: 'DB_001',
        context: { table: 'users' },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('DB_001');
        expect(result.error.context).toEqual({ table: 'users' });
      }
    });
  });

  describe('classifyError', () => {
    it('should classify Prisma errors as database', () => {
      const error = new Error('Prisma query failed');
      expect(classifyError(error)).toBe('database');
    });

    it('should classify Stripe errors as external_api', () => {
      const error = new Error('Stripe API error');
      expect(classifyError(error)).toBe('external_api');
    });

    it('should classify validation errors', () => {
      const error = new Error('Invalid input provided');
      expect(classifyError(error)).toBe('validation');
    });

    it('should classify network errors', () => {
      const error = new Error('Network timeout');
      expect(classifyError(error)).toBe('network');
    });

    it('should classify authentication errors', () => {
      const error = new Error('User unauthorized');
      expect(classifyError(error)).toBe('authentication');
    });

    it('should default to unknown for unclassified errors', () => {
      const error = new Error('Something weird happened');
      expect(classifyError(error)).toBe('unknown');
    });
  });

  describe('tryCatchSync', () => {
    it('should return success for successful operations', () => {
      const result = tryCatchSync(() => 'success');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('success');
      }
    });

    it('should catch and classify errors', () => {
      const result = tryCatchSync(() => {
        throw new Error('Invalid data');
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.category).toBe('validation');
        expect(result.error.message).toBe('Invalid data');
      }
    });

    it('should include context in error result', () => {
      const result = tryCatchSync(
        () => {
          throw new Error('Operation failed');
        },
        { userId: '123' }
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.context).toEqual({ userId: '123' });
      }
    });
  });

  describe('tryCatch', () => {
    it('should return success for successful async operations', async () => {
      const result = await tryCatch(async () => 'async success');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('async success');
      }
    });

    it('should catch and classify async errors', async () => {
      const result = await tryCatch(async () => {
        throw new Error('Async error');
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('Async error');
      }
    });

    it('should include context in async error result', async () => {
      const result = await tryCatch(
        async () => {
          throw new Error('Async operation failed');
        },
        { operation: 'test' }
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.context).toEqual({ operation: 'test' });
      }
    });
  });

  describe('getStatusCode', () => {
    it('should return correct status codes for categories', () => {
      expect(getStatusCode('validation')).toBe(400);
      expect(getStatusCode('authentication')).toBe(401);
      expect(getStatusCode('authorization')).toBe(403);
      expect(getStatusCode('not_found')).toBe(404);
      expect(getStatusCode('database')).toBe(500);
      expect(getStatusCode('external_api')).toBe(502);
      expect(getStatusCode('network')).toBe(503);
      expect(getStatusCode('internal')).toBe(500);
      expect(getStatusCode('unknown')).toBe(500);
    });
  });

  describe('formatErrorResponse', () => {
    it('should format error for API response', () => {
      const errorDetail = {
        category: 'validation' as const,
        message: 'Invalid input',
        code: 'INVALID_INPUT',
        context: { field: 'email' },
      };
      const formatted = formatErrorResponse(errorDetail);
      expect(formatted).toEqual({
        error: {
          code: 'INVALID_INPUT',
          message: 'Invalid input',
          context: { field: 'email' },
        },
      });
    });

    it('should use category as code if no code provided', () => {
      const errorDetail = {
        category: 'database' as const,
        message: 'Database error',
      };
      const formatted = formatErrorResponse(errorDetail);
      expect(formatted).toEqual({
        error: {
          code: 'database',
          message: 'Database error',
        },
      });
    });
  });
});
