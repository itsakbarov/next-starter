/**
 * Result type for structured error handling
 * Similar to Zod's SafeParseResult pattern
 */

export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * Create a successful result
 */
export const ok = <T>(data: T): Result<T, never> => ({
  success: true,
  data,
});

/**
 * Create a failed result
 */
export const err = <E>(error: E): Result<never, E> => ({
  success: false,
  error,
});

/**
 * Wrap an async function to return a Result
 */
export const tryCatch = async <T, E = Error>(
  fn: () => Promise<T>,
  errorHandler?: (error: unknown) => E
): Promise<Result<T, E>> => {
  try {
    const data = await fn();
    return ok(data);
  } catch (error) {
    const mappedError = errorHandler
      ? errorHandler(error)
      : error instanceof Error
        ? (error as E)
        : (new Error(String(error)) as E);
    return err(mappedError);
  }
};

/**
 * Synchronous version of tryCatch
 */
export const tryCatchSync = <T, E = Error>(
  fn: () => T,
  errorHandler?: (error: unknown) => E
): Result<T, E> => {
  try {
    const data = fn();
    return ok(data);
  } catch (error) {
    const mappedError = errorHandler
      ? errorHandler(error)
      : error instanceof Error
        ? (error as E)
        : (new Error(String(error)) as E);
    return err(mappedError);
  }
};
