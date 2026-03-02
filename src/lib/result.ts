/**
 * Result type pattern for structured error handling
 * Inspired by Rust's Result type and Zod's SafeParseResult
 */

/**
 * Error categories for classification
 */
export enum ErrorCategory {
  VALIDATION = 'VALIDATION',
  AUTHENTICATION = 'AUTHENTICATION',
  AUTHORIZATION = 'AUTHORIZATION',
  NOT_FOUND = 'NOT_FOUND',
  EXTERNAL_SERVICE = 'EXTERNAL_SERVICE',
  DATABASE = 'DATABASE',
  INTERNAL = 'INTERNAL',
  NETWORK = 'NETWORK',
}

/**
 * Structured error with classification
 */
export interface ClassifiedError {
  category: ErrorCategory;
  message: string;
  code: string;
  statusCode: number;
  details?: unknown;
  originalError?: unknown;
}

/**
 * Success result
 */
export interface Success<T> {
  success: true;
  data: T;
}

/**
 * Failure result
 */
export interface Failure {
  success: false;
  error: ClassifiedError;
}

/**
 * Result type - either Success or Failure
 */
export type Result<T> = Success<T> | Failure;

/**
 * Create a success result
 */
export const success = <T>(data: T): Success<T> => ({
  success: true,
  data,
});

/**
 * Create a failure result
 */
export const failure = (error: ClassifiedError): Failure => ({
  success: false,
  error,
});

/**
 * Create a classified error
 */
export const createError = (
  category: ErrorCategory,
  message: string,
  code: string,
  statusCode: number,
  details?: unknown,
  originalError?: unknown
): ClassifiedError => ({
  category,
  message,
  code,
  statusCode,
  details,
  originalError,
});

/**
 * Type guards for checking result type
 */
export const isSuccess = <T>(result: Result<T>): result is Success<T> =>
  result.success === true;

export const isFailure = <T>(result: Result<T>): result is Failure =>
  result.success === false;

/**
 * Wrap an async operation in a Result
 */
export const wrapAsync = async <T>(
  fn: () => Promise<T>,
  onError: (error: unknown) => ClassifiedError
): Promise<Result<T>> => {
  try {
    const data = await fn();
    return success(data);
  } catch (error) {
    return failure(onError(error));
  }
};

/**
 * Wrap a sync operation in a Result
 */
export const wrap = <T>(
  fn: () => T,
  onError: (error: unknown) => ClassifiedError
): Result<T> => {
  try {
    const data = fn();
    return success(data);
  } catch (error) {
    return failure(onError(error));
  }
};
