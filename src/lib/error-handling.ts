/**
 * Centralized error handling utilities
 * Re-exports from errors and result modules for convenience
 */

export {
  AppError,
  StripeError,
  StripeWebhookError,
  StripeCustomerCreationError,
  DatabaseError,
  UserNotFoundError,
  UserUpdateError,
  ValidationError,
  MethodNotAllowedError,
  ActionError,
  classifyError,
  getErrorMessage,
} from './errors';

export { ok, err, tryCatch, tryCatchSync, type Result } from './result';
