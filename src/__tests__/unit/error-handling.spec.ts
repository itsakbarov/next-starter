import {
  ActionError,
  AppError,
  classifyError,
  DatabaseError,
  getErrorMessage,
  StripeError,
  ValidationError,
} from '@/lib/errors';
import { err, ok, tryCatch, tryCatchSync } from '@/lib/result';

describe('Result Pattern', () => {
  describe('ok', () => {
    it('creates successful result', () => {
      const result = ok({ value: 42 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ value: 42 });
      }
    });
  });

  describe('err', () => {
    it('creates failed result', () => {
      const error = new ValidationError('Invalid input');
      const result = err(error);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe(error);
        expect(result.error.code).toBe('VALIDATION_ERROR');
      }
    });
  });

  describe('tryCatch', () => {
    it('returns ok for successful async operation', async () => {
      const result = await tryCatch(async () => {
        return { value: 42 };
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.value).toBe(42);
      }
    });

    it('returns err for failed async operation', async () => {
      const result = await tryCatch(
        async () => {
          throw new Error('Operation failed');
        },
        (error) =>
          new ActionError(
            error instanceof Error ? error.message : 'Unknown error'
          )
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(ActionError);
        expect(result.error.message).toBe('Operation failed');
      }
    });

    it('uses custom error handler', async () => {
      const result = await tryCatch(
        async () => {
          throw new Error('Database error');
        },
        (error) => new DatabaseError('Custom message', error)
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(DatabaseError);
        expect(result.error.code).toBe('DATABASE_ERROR');
      }
    });
  });

  describe('tryCatchSync', () => {
    it('returns ok for successful sync operation', () => {
      const result = tryCatchSync(() => {
        return { value: 42 };
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.value).toBe(42);
      }
    });

    it('returns err for failed sync operation', () => {
      const result = tryCatchSync(
        () => {
          throw new Error('Sync operation failed');
        },
        (error) =>
          new ValidationError(
            error instanceof Error ? error.message : 'Unknown error'
          )
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(ValidationError);
        expect(result.error.message).toBe('Sync operation failed');
      }
    });
  });
});

describe('Error Classes', () => {
  describe('AppError', () => {
    it('creates base error with code and status', () => {
      const error = new AppError('Test error', 'TEST_ERROR', 400);

      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.statusCode).toBe(400);
      expect(error.name).toBe('AppError');
    });

    it('defaults to 500 status code', () => {
      const error = new AppError('Test error', 'TEST_ERROR');

      expect(error.statusCode).toBe(500);
    });
  });

  describe('ValidationError', () => {
    it('creates validation error', () => {
      const error = new ValidationError('Name is required');

      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('Name is required');
    });

    it('stores field errors', () => {
      const fields = { name: 'required', email: 'invalid' };
      const error = new ValidationError('Validation failed', fields);

      expect(error.fields).toEqual(fields);
    });
  });

  describe('DatabaseError', () => {
    it('creates database error', () => {
      const originalError = new Error('Connection failed');
      const error = new DatabaseError(
        'Database operation failed',
        originalError
      );

      expect(error.code).toBe('DATABASE_ERROR');
      expect(error.statusCode).toBe(500);
      expect(error.originalError).toBe(originalError);
    });
  });

  describe('StripeError', () => {
    it('creates Stripe error', () => {
      const error = new StripeError('Payment failed');

      expect(error.code).toBe('STRIPE_ERROR');
      expect(error.statusCode).toBe(400);
    });
  });

  describe('ActionError', () => {
    it('creates action error with default code', () => {
      const error = new ActionError('Action failed');

      expect(error.code).toBe('ACTION_ERROR');
      expect(error.statusCode).toBe(500);
    });

    it('creates action error with custom code', () => {
      const error = new ActionError(
        'Custom action failed',
        'CUSTOM_ACTION_ERROR'
      );

      expect(error.code).toBe('CUSTOM_ACTION_ERROR');
    });
  });
});

describe('Error Classification', () => {
  describe('classifyError', () => {
    it('returns already classified AppError', () => {
      const original = new ValidationError('Test');
      const classified = classifyError(original);

      expect(classified).toBe(original);
    });

    it('classifies Prisma errors', () => {
      const prismaError = {
        code: 'P2002',
        message: 'Unique constraint failed',
      };
      const classified = classifyError(prismaError);

      expect(classified).toBeInstanceOf(DatabaseError);
      expect(classified.code).toBe('DATABASE_ERROR');
    });

    it('classifies Stripe errors', () => {
      const stripeError = {
        type: 'StripeInvalidRequestError',
        message: 'Invalid payment method',
      };
      const classified = classifyError(stripeError);

      expect(classified).toBeInstanceOf(StripeError);
      expect(classified.code).toBe('STRIPE_ERROR');
    });

    it('wraps generic Error', () => {
      const genericError = new Error('Something went wrong');
      const classified = classifyError(genericError);

      expect(classified).toBeInstanceOf(AppError);
      expect(classified.code).toBe('UNKNOWN_ERROR');
      expect(classified.message).toBe('Something went wrong');
    });

    it('wraps unknown error types', () => {
      const classified = classifyError('String error');

      expect(classified).toBeInstanceOf(AppError);
      expect(classified.code).toBe('UNKNOWN_ERROR');
      expect(classified.message).toBe('String error');
    });
  });

  describe('getErrorMessage', () => {
    it('extracts message from Error', () => {
      const error = new Error('Test message');
      expect(getErrorMessage(error)).toBe('Test message');
    });

    it('returns string directly', () => {
      expect(getErrorMessage('String error')).toBe('String error');
    });

    it('extracts message from object', () => {
      const error = { message: 'Object error' };
      expect(getErrorMessage(error)).toBe('Object error');
    });

    it('returns default for unknown types', () => {
      expect(getErrorMessage(null)).toBe('An unknown error occurred');
      expect(getErrorMessage(undefined)).toBe('An unknown error occurred');
      expect(getErrorMessage(42)).toBe('An unknown error occurred');
    });
  });
});
