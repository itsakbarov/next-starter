/**
 * Error logging utility with classification
 */

import { ClassifiedError, ErrorCategory } from '@/lib/result';

/**
 * Log levels
 */
export enum LogLevel {
  ERROR = 'ERROR',
  WARN = 'WARN',
  INFO = 'INFO',
  DEBUG = 'DEBUG',
}

/**
 * Determine log level based on error category
 */
const getLogLevel = (category: ErrorCategory): LogLevel => {
  switch (category) {
    case ErrorCategory.VALIDATION:
    case ErrorCategory.AUTHENTICATION:
    case ErrorCategory.AUTHORIZATION:
    case ErrorCategory.NOT_FOUND:
      return LogLevel.WARN;

    case ErrorCategory.EXTERNAL_SERVICE:
    case ErrorCategory.NETWORK:
      return LogLevel.ERROR;

    case ErrorCategory.DATABASE:
    case ErrorCategory.INTERNAL:
    default:
      return LogLevel.ERROR;
  }
};

/**
 * Format error for logging
 */
const formatError = (
  error: ClassifiedError,
  context?: Record<string, unknown>
): string => {
  const logData: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    category: error.category,
    code: error.code,
    message: error.message,
    statusCode: error.statusCode,
  };

  if (error.details) {
    logData.details = error.details;
  }

  if (context) {
    logData.context = context;
  }

  return JSON.stringify(logData, null, 2);
};

/**
 * Log an error with classification
 */
export const logError = (
  error: ClassifiedError,
  context?: Record<string, unknown>
): void => {
  const level = getLogLevel(error.category);
  const formattedError = formatError(error, context);

  switch (level) {
    case LogLevel.ERROR:
      console.error(`[${level}]`, formattedError);
      if (error.originalError) {
        console.error('Original error:', error.originalError);
      }
      break;

    case LogLevel.WARN:
      console.warn(`[${level}]`, formattedError);
      break;

    case LogLevel.INFO:
      console.info(`[${level}]`, formattedError);
      break;

    case LogLevel.DEBUG:
      console.debug(`[${level}]`, formattedError);
      break;
  }
};

/**
 * Should an error be reported to external monitoring?
 * Returns true for errors that indicate system problems
 */
export const shouldReportToMonitoring = (error: ClassifiedError): boolean => {
  const reportableCategories = [
    ErrorCategory.INTERNAL,
    ErrorCategory.DATABASE,
    ErrorCategory.EXTERNAL_SERVICE,
  ];

  return reportableCategories.includes(error.category);
};

/**
 * Log and optionally report error to monitoring service
 */
export const logAndReport = (
  error: ClassifiedError,
  context?: Record<string, unknown>
): void => {
  logError(error, context);

  if (shouldReportToMonitoring(error)) {
    // In a production app, this would send to Sentry, DataDog, etc.
    // For now, we just log that it should be reported
    console.error(
      '[MONITORING]',
      'Error should be reported to monitoring service:',
      {
        category: error.category,
        code: error.code,
        message: error.message,
      }
    );
  }
};
