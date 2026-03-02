/**
 * Custom error classes for structured error handling
 */

/**
 * Base application error class
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(message: string, code: string, statusCode: number = 500) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Stripe-related errors
 */
export class StripeError extends AppError {
  public readonly originalError?: unknown;

  constructor(message: string, originalError?: unknown) {
    super(message, 'STRIPE_ERROR', 400);
    this.originalError = originalError;
  }
}

export class StripeWebhookError extends AppError {
  public readonly originalError?: unknown;

  constructor(message: string, originalError?: unknown) {
    super(`Webhook Error: ${message}`, 'STRIPE_WEBHOOK_ERROR', 400);
    this.originalError = originalError;
  }
}

export class StripeCustomerCreationError extends AppError {
  public readonly originalError?: unknown;

  constructor(message: string, originalError?: unknown) {
    super(
      `Customer Creation Error: ${message}`,
      'STRIPE_CUSTOMER_CREATION_ERROR',
      400
    );
    this.originalError = originalError;
  }
}

/**
 * Database-related errors
 */
export class DatabaseError extends AppError {
  public readonly originalError?: unknown;

  constructor(message: string, originalError?: unknown) {
    super(message, 'DATABASE_ERROR', 500);
    this.originalError = originalError;
  }
}

export class UserNotFoundError extends AppError {
  constructor(userId?: string) {
    super(
      userId ? `User not found: ${userId}` : 'User not found',
      'USER_NOT_FOUND',
      404
    );
  }
}

export class UserUpdateError extends AppError {
  public readonly originalError?: unknown;

  constructor(message: string, originalError?: unknown) {
    super(`Failed to update user: ${message}`, 'USER_UPDATE_ERROR', 500);
    this.originalError = originalError;
  }
}

/**
 * Validation errors
 */
export class ValidationError extends AppError {
  public readonly fields?: Record<string, string>;

  constructor(message: string, fields?: Record<string, string>) {
    super(message, 'VALIDATION_ERROR', 400);
    this.fields = fields;
  }
}

/**
 * HTTP method errors
 */
export class MethodNotAllowedError extends AppError {
  constructor(allowedMethods: string[] = ['POST']) {
    super(
      `Method Not Allowed. Allowed methods: ${allowedMethods.join(', ')}`,
      'METHOD_NOT_ALLOWED',
      405
    );
  }
}

/**
 * Action errors for server actions
 */
export class ActionError extends AppError {
  constructor(message: string, code: string = 'ACTION_ERROR') {
    super(message, code, 500);
  }
}

/**
 * Helper function to classify unknown errors
 */
export const classifyError = (error: unknown): AppError => {
  // Already classified
  if (error instanceof AppError) {
    return error;
  }

  // Prisma errors
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    const prismaCode = error.code;
    if (prismaCode.startsWith('P')) {
      const message =
        'message' in error && typeof error.message === 'string'
          ? error.message
          : 'Database operation failed';
      return new DatabaseError(message, error);
    }
  }

  // Stripe errors
  if (
    error &&
    typeof error === 'object' &&
    'type' in error &&
    typeof error.type === 'string' &&
    error.type.includes('Stripe')
  ) {
    const message =
      'message' in error && typeof error.message === 'string'
        ? error.message
        : 'Stripe operation failed';
    return new StripeError(message, error);
  }

  // Generic error
  if (error instanceof Error) {
    return new AppError(error.message, 'UNKNOWN_ERROR', 500);
  }

  // Unknown error type
  return new AppError(String(error), 'UNKNOWN_ERROR', 500);
};

/**
 * Helper to extract error message from unknown error
 */
export const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message);
  }
  return 'An unknown error occurred';
};
