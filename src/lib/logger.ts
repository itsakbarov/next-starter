/**
 * Structured logging utility for error tracking
 */

import { ErrorDetail } from './result';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

/**
 * Log error with structured data
 */
export const logError = (error: ErrorDetail, context?: LogContext): void => {
  const logData: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level: 'error' as LogLevel,
    category: error.category,
    message: error.message,
    code: error.code,
    context: {
      ...(error.context || {}),
      ...(context || {}),
    },
  };

  if (error.originalError) {
    logData.originalError =
      error.originalError instanceof Error
        ? {
            name: error.originalError.name,
            message: error.originalError.message,
            stack: error.originalError.stack,
          }
        : error.originalError;
  }

  // In production, this would send to a logging service (e.g., Sentry, DataDog)
  // For now, we use console.error with structured data
  console.error('[ERROR]', JSON.stringify(logData, null, 2));
};

/**
 * Log warning with structured data
 */
export const logWarning = (message: string, context?: LogContext): void => {
  const logData = {
    timestamp: new Date().toISOString(),
    level: 'warn' as LogLevel,
    message,
    context,
  };

  console.warn('[WARN]', JSON.stringify(logData, null, 2));
};

/**
 * Log info with structured data
 */
export const logInfo = (message: string, context?: LogContext): void => {
  const logData = {
    timestamp: new Date().toISOString(),
    level: 'info' as LogLevel,
    message,
    context,
  };

  console.log('[INFO]', JSON.stringify(logData, null, 2));
};
