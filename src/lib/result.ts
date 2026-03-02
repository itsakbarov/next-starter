/**
 * Result type system for structured error handling
 * Inspired by Rust's Result<T, E> and Zod's SafeParseResult
 */

export type ErrorCategory =
  | 'validation'
  | 'authentication'
  | 'authorization'
  | 'not_found'
  | 'database'
  | 'external_api'
  | 'network'
  | 'internal'
  | 'unknown';

export interface ErrorDetail {
  category: ErrorCategory;
  message: string;
  code?: string;
  originalError?: unknown;
  context?: Record<string, unknown>;
}

export type Result<T> =
  | { success: true; data: T }
  | { success: false; error: ErrorDetail };

export type AsyncResult<T> = Promise<Result<T>>;

/**
 * Type guard to check if result is success
 */
export const isSuccess = <T>(
  result: Result<T>
): result is { success: true; data: T } => {
  return result.success;
};

/**
 * Type guard to check if result is error
 */
export const isError = <T>(
  result: Result<T>
): result is { success: false; error: ErrorDetail } => {
  return !result.success;
};

/**
 * Create a success result
 */
export const ok = <T>(data: T): Result<T> => ({
  success: true,
  data,
});

/**
 * Create an error result
 */
export const err = (
  category: ErrorCategory,
  message: string,
  options?: {
    code?: string;
    originalError?: unknown;
    context?: Record<string, unknown>;
  }
): Result<never> => ({
  success: false,
  error: {
    category,
    message,
    code: options?.code,
    originalError: options?.originalError,
    context: options?.context,
  },
});

/**
 * Classify error based on error type and characteristics
 */
export const classifyError = (error: unknown): ErrorCategory => {
  if (error instanceof Error) {
    const errorName = error.constructor.name;
    const message = error.message.toLowerCase();

    // Prisma errors
    if (errorName.startsWith('Prisma') || message.includes('prisma')) {
      if (message.includes('not found') || message.includes('record')) {
        return 'not_found';
      }
      return 'database';
    }

    // Stripe errors
    if (errorName.includes('Stripe') || message.includes('stripe')) {
      if (message.includes('authentication') || message.includes('api key')) {
        return 'authentication';
      }
      if (message.includes('permission') || message.includes('unauthorized')) {
        return 'authorization';
      }
      return 'external_api';
    }

    // Network errors
    if (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('econnrefused') ||
      message.includes('fetch failed')
    ) {
      return 'network';
    }

    // Validation errors
    if (
      errorName === 'ValidationError' ||
      errorName === 'ZodError' ||
      message.includes('invalid') ||
      message.includes('validation')
    ) {
      return 'validation';
    }

    // Authentication/Authorization
    if (
      message.includes('unauthorized') ||
      message.includes('unauthenticated')
    ) {
      return 'authentication';
    }
    if (message.includes('forbidden') || message.includes('access denied')) {
      return 'authorization';
    }

    // Not found
    if (message.includes('not found') || message.includes('does not exist')) {
      return 'not_found';
    }
  }

  return 'unknown';
};

/**
 * Wrap a try-catch block with automatic error classification
 */
export const tryCatch = async <T>(
  fn: () => Promise<T>,
  context?: Record<string, unknown>
): Promise<Result<T>> => {
  try {
    const data = await fn();
    return ok(data);
  } catch (error) {
    const category = classifyError(error);
    const message =
      error instanceof Error ? error.message : 'An unknown error occurred';

    return err(category, message, {
      originalError: error,
      context,
    });
  }
};

/**
 * Wrap a synchronous try-catch block with automatic error classification
 */
export const tryCatchSync = <T>(
  fn: () => T,
  context?: Record<string, unknown>
): Result<T> => {
  try {
    const data = fn();
    return ok(data);
  } catch (error) {
    const category = classifyError(error);
    const message =
      error instanceof Error ? error.message : 'An unknown error occurred';

    return err(category, message, {
      originalError: error,
      context,
    });
  }
};

/**
 * Get HTTP status code for error category
 */
export const getStatusCode = (category: ErrorCategory): number => {
  const statusMap: Record<ErrorCategory, number> = {
    validation: 400,
    authentication: 401,
    authorization: 403,
    not_found: 404,
    database: 500,
    external_api: 502,
    network: 503,
    internal: 500,
    unknown: 500,
  };

  return statusMap[category];
};

/**
 * Format error for API response
 */
export const formatErrorResponse = (error: ErrorDetail) => {
  return {
    error: {
      code: error.code || error.category,
      message: error.message,
      ...(error.context && { context: error.context }),
    },
  };
};
