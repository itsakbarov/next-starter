'use server';

import { classifyUnknownError, createValidationError } from '@/lib/errors';
import { failure, Result, success } from '@/lib/result';

/**
 * Example server action with structured error handling using Result pattern
 */
export const helloAction = async (
  name: string
): Promise<Result<{ message: string }>> => {
  // Validate input
  if (!name || name.trim().length === 0) {
    return failure(createValidationError('Name is required'));
  }

  if (name.length > 100) {
    return failure(
      createValidationError('Name must be 100 characters or less')
    );
  }

  try {
    // Simulate potential async operation that could fail
    const message = `Hello ${name}, from server!`;
    return success({ message });
  } catch (error) {
    // Handle any unexpected errors
    return failure(classifyUnknownError(error));
  }
};
