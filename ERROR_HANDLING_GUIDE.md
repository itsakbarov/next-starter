# Structured Error Handling Guide

## Overview

This project now implements a comprehensive structured error handling system inspired by Rust's `Result<T, E>` and Zod's `SafeParseResult`. This system replaces bare catch-all blocks with typed, classified error handling.

## Core Components

### 1. Result Type System (`src/lib/result.ts`)

The Result type provides a type-safe way to handle success and error cases:

```typescript
type Result<T> =
  | { success: true; data: T }
  | { success: false; error: ErrorDetail };
```

### 2. Error Categories

Errors are systematically classified into categories:

- **validation**: Invalid input, validation failures
- **authentication**: Unauthorized, unauthenticated
- **authorization**: Forbidden, access denied
- **not_found**: Resource not found
- **database**: Prisma/database errors
- **external_api**: Stripe and other external API errors
- **network**: Network, timeout, connection errors
- **internal**: Internal server errors
- **unknown**: Unclassified errors

### 3. Helper Functions

#### `ok<T>(data: T): Result<T>`

Create a success result.

#### `err(category, message, options?): Result<never>`

Create an error result with classification.

#### `tryCatch<T>(fn, context?): Promise<Result<T>>`

Wrap async operations with automatic error classification.

#### `tryCatchSync<T>(fn, context?): Result<T>`

Wrap sync operations with automatic error classification.

#### `classifyError(error): ErrorCategory`

Automatically classify errors based on type and message.

#### `getStatusCode(category): number`

Get appropriate HTTP status code for error category.

#### `formatErrorResponse(error): object`

Format error for API JSON response.

## Usage Examples

### Server Actions

```typescript
import { ok, err, Result } from '@/lib/result';

export const myAction = async (input: string): Promise<Result<Data>> => {
  // Validation
  if (!input) {
    return err('validation', 'Input is required', {
      code: 'MISSING_INPUT',
    });
  }

  // Success
  return ok({ processed: input });
};
```

### API Routes

```typescript
import {
  tryCatch,
  formatErrorResponse,
  getStatusCode,
  logError,
} from '@/lib/...';

export const GET = async () => {
  const result = await tryCatch(() => someAsyncOperation(), {
    operation: 'fetch_data',
  });

  if (!result.success) {
    logError(result.error, { endpoint: '/api/data' });
    return NextResponse.json(formatErrorResponse(result.error), {
      status: getStatusCode(result.error.category),
    });
  }

  return NextResponse.json({ data: result.data });
};
```

### Client Components

```typescript
const result = await myAction(input);

if (result.success) {
  toast({ description: result.data.message });
} else {
  toast({
    variant: 'destructive',
    title: 'Error',
    description: result.error.message,
  });
}
```

## Structured Logging (`src/lib/logger.ts`)

All errors are logged with structured data for better monitoring:

```typescript
import { logError, logWarning, logInfo } from '@/lib/logger';

logError(errorDetail, {
  endpoint: '/api/webhook',
  userId: session.user.id,
  customField: 'value',
});
```

Log format:

```json
{
  "timestamp": "2026-03-02T22:48:00.000Z",
  "level": "error",
  "category": "database",
  "message": "Failed to update user",
  "code": "DB_UPDATE_FAILED",
  "context": {
    "userId": "123",
    "operation": "update_subscription"
  },
  "originalError": {
    "name": "PrismaClientKnownRequestError",
    "message": "Record not found",
    "stack": "..."
  }
}
```

## Migration Summary

### Before

```typescript
// Bare catch that swallows all errors
try {
  await operation();
} catch {
  return Response.json({ error: 'Failed' }, { status: 405 });
}
```

### After

```typescript
const result = await tryCatch(() => operation(), { context: 'for debugging' });

if (!result.success) {
  logError(result.error, { endpoint: '/api/route' });
  return NextResponse.json(formatErrorResponse(result.error), {
    status: getStatusCode(result.error.category),
  });
}
```

## Files Modified

1. **src/lib/result.ts** (NEW) - Core Result type system
2. **src/lib/logger.ts** (NEW) - Structured logging
3. **src/app/api/stripe/webhook/route.ts** - Fixed bare catch block
4. **src/app/api/auth/[...nextauth]/auth-options.ts** - Fixed silent failures
5. **src/actions/hello-action.ts** - Added validation with Result
6. **src/app/api/stripe/checkout-session/route.ts** - Added error handling
7. **src/components/form.tsx** - Updated to handle Result type
8. **src/**tests**/lib/result.test.ts** (NEW) - Comprehensive tests

## Testing

Run the test suite:

```bash
npm test
```

All 19 tests pass, covering:

- Success and error result creation
- Error classification logic
- Sync and async tryCatch utilities
- Status code mapping
- Response formatting

## Benefits

1. **Type Safety**: Compiler enforces error handling
2. **Consistent Classification**: All errors categorized systematically
3. **Better Debugging**: Structured logs with context
4. **No Silent Failures**: All errors logged and tracked
5. **Testability**: Easy to test success and error paths
6. **Maintainability**: Clear error handling patterns

## Next Steps

Consider integrating with:

- Sentry or DataDog for production error tracking
- OpenTelemetry for distributed tracing
- Custom error dashboards
