# Structured Error Handling Pattern

This document describes the structured error handling pattern implemented in this application using a Result type pattern inspired by Rust's `Result<T, E>` and Zod's `SafeParseResult`.

## Overview

All catch blocks now use specific error classification instead of bare catch blocks. Errors are categorized, logged with context, and return appropriate HTTP status codes.

## Core Components

### 1. Result Type Pattern (`src/lib/result.ts`)

The Result type provides type-safe error handling with two possible states:

```typescript
type Result<T> = Success<T> | Failure;

interface Success<T> {
  success: true;
  data: T;
}

interface Failure {
  success: false;
  error: ClassifiedError;
}
```

**Usage:**

```typescript
import { success, failure, wrapAsync } from '@/lib/result';

// Manual result creation
const result = success({ id: '123', name: 'John' });

// Wrapping async operations
const result = await wrapAsync(
  async () => await fetchData(),
  (error) => classifyUnknownError(error)
);

if (result.success) {
  console.log(result.data); // Type-safe access to data
} else {
  console.error(result.error); // Type-safe access to error
}
```

### 2. Error Categories (`src/lib/result.ts`)

All errors are classified into categories:

- `VALIDATION` - Invalid input, missing fields, schema validation failures
- `AUTHENTICATION` - User not authenticated, invalid credentials
- `AUTHORIZATION` - User lacks required permissions
- `NOT_FOUND` - Resource not found in database
- `EXTERNAL_SERVICE` - Third-party API failures (Stripe, GitHub, etc.)
- `DATABASE` - Database connection or query failures
- `INTERNAL` - Unexpected application errors
- `NETWORK` - Network connectivity issues

### 3. Error Classifiers (`src/lib/errors.ts`)

Specialized classifiers for different error types:

#### Stripe Errors

```typescript
import { classifyStripeError } from '@/lib/errors';

try {
  const customer = await stripeServer.customers.create({...});
} catch (err) {
  const error = classifyStripeError(err);
  // error.category - VALIDATION, AUTHENTICATION, or EXTERNAL_SERVICE
  // error.statusCode - Appropriate HTTP status code
  // error.code - Application error code
}
```

#### Prisma Errors

```typescript
import { classifyPrismaError } from '@/lib/errors';

try {
  const user = await prisma.user.update({...});
} catch (err) {
  const error = classifyPrismaError(err);
  // Handles P2025 (not found), P2002 (unique constraint), etc.
}
```

#### Unknown Errors

```typescript
import { classifyUnknownError } from '@/lib/errors';

try {
  // Any operation
} catch (err) {
  const error = classifyUnknownError(err);
  // Automatically detects error type and classifies it
}
```

### 4. Error Logging (`src/lib/error-logger.ts`)

Centralized error logging with automatic categorization:

```typescript
import { logAndReport } from '@/lib/error-logger';

const error = classifyStripeError(err);
logAndReport(error, {
  endpoint: '/api/stripe/webhook',
  userId: user.id,
  action: 'create_subscription',
});
```

**Features:**

- Automatic log level determination based on error category
- Structured JSON logging with timestamps
- Context enrichment for debugging
- Monitoring integration detection (errors that need external reporting)

## Implementation Examples

### API Route Error Handling

**Before:**

```typescript
// Bare catch block - swallows all errors
try {
  // logic
} catch {
  return NextResponse.json(
    { error: { message: 'Method Not Allowed' } },
    { status: 405 }
  );
}
```

**After:**

```typescript
try {
  const result = await stripeServer.checkout.sessions.create({...});
  return NextResponse.json({ session: result }, { status: 200 });
} catch (err) {
  const stripeError = classifyStripeError(err);
  logAndReport(stripeError, {
    endpoint: '/api/stripe/checkout-session',
    userId: session.user.id,
  });

  return NextResponse.json(
    {
      error: {
        code: stripeError.code,
        message: 'Failed to create checkout session. Please try again.',
      },
    },
    { status: stripeError.statusCode }
  );
}
```

### Server Action Error Handling

```typescript
'use server';

import { wrapAsync } from '@/lib/result';
import { classifyUnknownError } from '@/lib/errors';

export const createUserAction = async (data: UserData) => {
  return await wrapAsync(async () => {
    const user = await prisma.user.create({ data });
    return { user };
  }, classifyUnknownError);
};

// Usage in component
const result = await createUserAction(data);
if (result.success) {
  console.log('User created:', result.data.user);
} else {
  console.error('Error:', result.error.message);
  // Display user-friendly error based on result.error.category
}
```

### Event Handler Error Handling

```typescript
events: {
  createUser: async ({ user }) => {
    try {
      const customer = await stripeServer.customers.create({...});

      try {
        await prisma.user.update({...});
      } catch (err) {
        const dbError = classifyPrismaError(err);
        logAndReport(dbError, {
          context: 'auth_create_user',
          userId: user.id,
        });
        throw err; // Re-throw critical errors
      }
    } catch (err) {
      const error = classifyUnknownError(err);
      logAndReport(error, {
        context: 'auth_create_user',
        userId: user.id,
      });
      // Don't throw - event handlers don't support error responses
    }
  }
}
```

## Error Response Format

All API routes return errors in a consistent format:

```typescript
{
  "error": {
    "code": "STRIPE_ERROR",           // Application error code
    "message": "User-friendly message" // Safe to display to users
  }
}
```

Internal logs contain full error details:

```json
{
  "timestamp": "2026-03-02T22:30:00.000Z",
  "category": "EXTERNAL_SERVICE",
  "code": "STRIPE_ERROR",
  "message": "Stripe service error",
  "statusCode": 500,
  "details": {
    "type": "StripeAPIError",
    "code": "rate_limit"
  },
  "context": {
    "endpoint": "/api/stripe/webhook",
    "userId": "user_123"
  }
}
```

## Benefits

1. **Type Safety**: Result pattern provides compile-time type checking
2. **Consistent Handling**: All errors follow the same classification pattern
3. **Better Debugging**: Structured logs with context make debugging easier
4. **Monitoring Integration**: Critical errors are automatically flagged for external monitoring
5. **User-Friendly**: Error messages are safe to display to end users
6. **No Silent Failures**: All errors are logged with appropriate context

## Migration Guide

To migrate existing catch blocks:

1. Import error classifiers:

   ```typescript
   import {
     classifyStripeError,
     classifyPrismaError,
     classifyUnknownError,
   } from '@/lib/errors';
   import { logAndReport } from '@/lib/error-logger';
   ```

2. Replace bare catch blocks:

   ```typescript
   // Before
   try {
     // code
   } catch {
     return error response
   }

   // After
   try {
     // code
   } catch (err) {
     const error = classifyUnknownError(err); // or specific classifier
     logAndReport(error, { context: 'operation_name' });
     return NextResponse.json(
       { error: { code: error.code, message: error.message }},
       { status: error.statusCode }
     );
   }
   ```

3. For server actions, use the Result pattern:

   ```typescript
   import { wrapAsync } from '@/lib/result';

   export const myAction = async (data: Data) => {
     return await wrapAsync(async () => {
       // your logic
       return result;
     }, classifyUnknownError);
   };
   ```

## Error Codes Reference

See `src/lib/errors.ts` for the complete list of error codes:

- `INVALID_INPUT` - Validation failed
- `UNAUTHENTICATED` - User not logged in
- `UNAUTHORIZED` - Insufficient permissions
- `STRIPE_ERROR` - Stripe API error
- `STRIPE_WEBHOOK_VERIFICATION_FAILED` - Invalid webhook signature
- `DATABASE_ERROR` - Generic database error
- `RECORD_NOT_FOUND` - Database record not found
- `UNIQUE_CONSTRAINT_VIOLATION` - Duplicate key violation
- `INTERNAL_ERROR` - Generic internal error
- `UNEXPECTED_ERROR` - Unknown error occurred
