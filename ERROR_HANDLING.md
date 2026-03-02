# Error Handling Guide

This project uses structured error handling with a Result pattern inspired by Zod's SafeParseResult.

## Overview

The error handling system provides:

1. **Result Type**: A discriminated union type that explicitly represents success or failure
2. **Custom Error Classes**: Specific error types for different failure scenarios
3. **Error Classification**: Automatic classification of unknown errors
4. **Type Safety**: Full TypeScript support with proper type inference

## Core Concepts

### Result Type

```typescript
type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };
```

This pattern makes error handling explicit and forces consumers to handle both success and failure cases.

### Helper Functions

#### `ok<T>(data: T)`

Create a successful result.

```typescript
return ok({ message: 'Success!' });
```

#### `err<E>(error: E)`

Create a failed result.

```typescript
return err(new ValidationError('Invalid input'));
```

#### `tryCatch<T, E>(fn, errorHandler?)`

Wrap an async function to return a Result.

```typescript
const result = await tryCatch(
  async () => {
    return await someAsyncOperation();
  },
  (error) => new CustomError('Operation failed', error)
);

if (!result.success) {
  console.error(result.error.code, result.error.message);
  return;
}

const data = result.data; // Type-safe access
```

## Error Classes

### Base Error: `AppError`

All custom errors extend `AppError`, which provides:

- `code: string` - Machine-readable error code
- `statusCode: number` - HTTP status code (default: 500)
- `message: string` - Human-readable error message

### Stripe Errors

- **`StripeError`** - Generic Stripe operation failure
- **`StripeWebhookError`** - Webhook signature verification or processing failure
- **`StripeCustomerCreationError`** - Customer creation failure

```typescript
throw new StripeWebhookError('Invalid signature', originalError);
```

### Database Errors

- **`DatabaseError`** - Generic database operation failure
- **`UserNotFoundError`** - User lookup failure
- **`UserUpdateError`** - User update failure

```typescript
throw new UserUpdateError('Failed to update subscription', originalError);
```

### Validation Errors

- **`ValidationError`** - Input validation failure

```typescript
throw new ValidationError('Name is required', { name: 'required' });
```

### HTTP Errors

- **`MethodNotAllowedError`** - HTTP method not allowed

```typescript
throw new MethodNotAllowedError(['POST', 'GET']);
```

### Action Errors

- **`ActionError`** - Server action failure

```typescript
throw new ActionError('Failed to process request');
```

## Usage Examples

### API Routes

```typescript
import { tryCatch, StripeWebhookError } from '@/lib/result';

export async function POST(req: NextRequest) {
  const result = await tryCatch(
    async () => {
      const event = await constructWebhookEvent(req);
      return event;
    },
    (error) =>
      new StripeWebhookError(
        error instanceof Error ? error.message : String(error),
        error
      )
  );

  if (!result.success) {
    return NextResponse.json(
      {
        error: {
          code: result.error.code,
          message: result.error.message,
        },
      },
      { status: result.error.statusCode }
    );
  }

  // Process event
  const event = result.data;
  // ...
}
```

### Server Actions

```typescript
'use server';

import { ok, err, ValidationError, ActionError } from '@/lib/result';

export async function createUser(
  name: string
): Promise<Result<User, ValidationError | ActionError>> {
  if (!name) {
    return err(new ValidationError('Name is required'));
  }

  try {
    const user = await db.user.create({ data: { name } });
    return ok(user);
  } catch (error) {
    return err(new ActionError('Failed to create user'));
  }
}
```

### Client Components

```typescript
'use client';

import { someAction } from '@/actions/some-action';

async function handleSubmit(data: FormData) {
  const result = await someAction(data);

  if (!result.success) {
    toast({
      variant: 'destructive',
      title: 'Error',
      description: result.error.message,
    });
    return;
  }

  toast({
    description: 'Success!',
  });
}
```

### Error Classification

The `classifyError` helper automatically identifies and wraps common error types:

```typescript
import { classifyError } from '@/lib/errors';

try {
  await prisma.user.findUnique({ where: { id: 'invalid' } });
} catch (error) {
  const classified = classifyError(error);
  // classified will be a DatabaseError with appropriate code
  console.log(classified.code); // 'DATABASE_ERROR'
  console.log(classified.statusCode); // 500
}
```

## Best Practices

### 1. Always Handle Both Cases

```typescript
const result = await someOperation();

if (!result.success) {
  // Handle error
  return;
}

// Use data
const data = result.data;
```

### 2. Use Specific Error Types

```typescript
// Good
return err(new ValidationError('Email is required'));

// Avoid
return err(new Error('Email is required'));
```

### 3. Log Errors with Context

```typescript
if (!result.success) {
  console.error('Operation failed:', {
    code: result.error.code,
    message: result.error.message,
    userId: user.id,
    timestamp: new Date().toISOString(),
  });
}
```

### 4. Preserve Original Errors

```typescript
catch (error) {
  return new CustomError('Operation failed', error); // Pass original error
}
```

### 5. Return Appropriate HTTP Status Codes

```typescript
if (!result.success) {
  return NextResponse.json(
    { error: { code: result.error.code, message: result.error.message } },
    { status: result.error.statusCode } // Use error's status code
  );
}
```

## Migration from Catch-All Blocks

### Before (Anti-pattern)

```typescript
try {
  await doSomething();
} catch {
  // Silent failure - no logging, no context
  return { error: 'Something went wrong' };
}
```

### After

```typescript
const result = await tryCatch(
  async () => await doSomething(),
  (error) => {
    const classified = classifyError(error);
    return new ActionError(classified.message, error);
  }
);

if (!result.success) {
  console.error('Operation failed:', {
    code: result.error.code,
    message: result.error.message,
  });
  return { error: result.error.message };
}
```

## Testing

```typescript
import { ok, err, ValidationError } from '@/lib/result';

describe('someAction', () => {
  it('returns error for invalid input', async () => {
    const result = await someAction('');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(ValidationError);
      expect(result.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('returns success for valid input', async () => {
    const result = await someAction('valid');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.message).toBe('Hello valid, from server!');
    }
  });
});
```

## Summary

This error handling system provides:

- Type-safe error handling with Result types
- Explicit error handling (no silent failures)
- Structured error classification
- Consistent error codes and HTTP status codes
- Better debugging through error context preservation
- Improved code maintainability and reliability
