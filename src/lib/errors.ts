/**
 * Application-specific error classes and helpers
 */

import { Prisma } from '@prisma/client';
import Stripe from 'stripe';

import { ClassifiedError, createError, ErrorCategory } from '@/lib/result';

/**
 * Error codes used throughout the application
 */
export const ErrorCode = {
  // Validation
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_FIELD: 'MISSING_FIELD',

  // Authentication & Authorization
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',

  // External Services
  STRIPE_ERROR: 'STRIPE_ERROR',
  STRIPE_WEBHOOK_VERIFICATION_FAILED: 'STRIPE_WEBHOOK_VERIFICATION_FAILED',
  GITHUB_AUTH_FAILED: 'GITHUB_AUTH_FAILED',

  // Database
  DATABASE_ERROR: 'DATABASE_ERROR',
  RECORD_NOT_FOUND: 'RECORD_NOT_FOUND',
  UNIQUE_CONSTRAINT_VIOLATION: 'UNIQUE_CONSTRAINT_VIOLATION',

  // Internal
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  UNEXPECTED_ERROR: 'UNEXPECTED_ERROR',
} as const;

/**
 * Classify Stripe errors
 */
export const classifyStripeError = (error: unknown): ClassifiedError => {
  if (error instanceof Stripe.errors.StripeError) {
    const statusCode = error.statusCode || 500;

    // Handle specific Stripe error types
    if (error.type === 'StripeAuthenticationError') {
      return createError(
        ErrorCategory.AUTHENTICATION,
        'Stripe authentication failed',
        ErrorCode.STRIPE_ERROR,
        statusCode,
        { type: error.type, code: error.code },
        error
      );
    }

    if (error.type === 'StripeInvalidRequestError') {
      return createError(
        ErrorCategory.VALIDATION,
        error.message || 'Invalid request to Stripe',
        ErrorCode.STRIPE_ERROR,
        statusCode,
        { type: error.type, code: error.code, param: error.param },
        error
      );
    }

    if (error.type === 'StripeSignatureVerificationError') {
      return createError(
        ErrorCategory.VALIDATION,
        'Stripe webhook signature verification failed',
        ErrorCode.STRIPE_WEBHOOK_VERIFICATION_FAILED,
        400,
        { type: error.type },
        error
      );
    }

    // Generic Stripe error
    return createError(
      ErrorCategory.EXTERNAL_SERVICE,
      error.message || 'Stripe service error',
      ErrorCode.STRIPE_ERROR,
      statusCode,
      { type: error.type, code: error.code },
      error
    );
  }

  // Unknown error
  return createError(
    ErrorCategory.EXTERNAL_SERVICE,
    'Unknown Stripe error occurred',
    ErrorCode.STRIPE_ERROR,
    500,
    undefined,
    error
  );
};

/**
 * Classify Prisma errors
 */
export const classifyPrismaError = (error: unknown): ClassifiedError => {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // P2025: Record not found
    if (error.code === 'P2025') {
      return createError(
        ErrorCategory.NOT_FOUND,
        'Record not found in database',
        ErrorCode.RECORD_NOT_FOUND,
        404,
        { prismaCode: error.code, meta: error.meta },
        error
      );
    }

    // P2002: Unique constraint violation
    if (error.code === 'P2002') {
      return createError(
        ErrorCategory.VALIDATION,
        'A record with this value already exists',
        ErrorCode.UNIQUE_CONSTRAINT_VIOLATION,
        409,
        { prismaCode: error.code, meta: error.meta },
        error
      );
    }

    // Other known Prisma errors
    return createError(
      ErrorCategory.DATABASE,
      error.message || 'Database operation failed',
      ErrorCode.DATABASE_ERROR,
      500,
      { prismaCode: error.code, meta: error.meta },
      error
    );
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return createError(
      ErrorCategory.VALIDATION,
      'Invalid data provided to database',
      ErrorCode.INVALID_INPUT,
      400,
      undefined,
      error
    );
  }

  if (
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof Prisma.PrismaClientRustPanicError
  ) {
    return createError(
      ErrorCategory.DATABASE,
      'Database connection error',
      ErrorCode.DATABASE_ERROR,
      503,
      undefined,
      error
    );
  }

  // Unknown Prisma error
  return createError(
    ErrorCategory.DATABASE,
    'Unknown database error occurred',
    ErrorCode.DATABASE_ERROR,
    500,
    undefined,
    error
  );
};

/**
 * Classify authentication/authorization errors
 */
export const createAuthError = (
  message: string,
  code: string = ErrorCode.UNAUTHENTICATED
): ClassifiedError => {
  return createError(ErrorCategory.AUTHENTICATION, message, code, 401);
};

/**
 * Classify validation errors
 */
export const createValidationError = (
  message: string,
  details?: unknown
): ClassifiedError => {
  return createError(
    ErrorCategory.VALIDATION,
    message,
    ErrorCode.INVALID_INPUT,
    400,
    details
  );
};

/**
 * Generic error classifier for unknown errors
 */
export const classifyUnknownError = (error: unknown): ClassifiedError => {
  // Check if it's a Prisma error
  if (
    error instanceof Prisma.PrismaClientKnownRequestError ||
    error instanceof Prisma.PrismaClientValidationError ||
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof Prisma.PrismaClientRustPanicError
  ) {
    return classifyPrismaError(error);
  }

  // Check if it's a Stripe error
  if (error instanceof Stripe.errors.StripeError) {
    return classifyStripeError(error);
  }

  // Check if it's a standard Error with message
  if (error instanceof Error) {
    return createError(
      ErrorCategory.INTERNAL,
      error.message || 'An unexpected error occurred',
      ErrorCode.UNEXPECTED_ERROR,
      500,
      { name: error.name, stack: error.stack },
      error
    );
  }

  // Completely unknown error type
  return createError(
    ErrorCategory.INTERNAL,
    'An unexpected error occurred',
    ErrorCode.UNEXPECTED_ERROR,
    500,
    undefined,
    error
  );
};
