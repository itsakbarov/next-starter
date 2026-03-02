'use server';

import { ActionError, ValidationError } from '@/lib/errors';
import { err, ok, type Result } from '@/lib/result';

type HelloActionResult = Result<
  { message: string },
  ValidationError | ActionError
>;

export const helloAction = async (name: string): Promise<HelloActionResult> => {
  // Validate input
  if (!name || typeof name !== 'string') {
    return err(new ValidationError('Name is required and must be a string'));
  }

  if (name.trim().length === 0) {
    return err(new ValidationError('Name cannot be empty'));
  }

  if (name.length > 100) {
    return err(new ValidationError('Name must be less than 100 characters'));
  }

  try {
    const message = `Hello ${name.trim()}, from server!`;
    return ok({ message });
  } catch (error) {
    // Handle unexpected errors
    const errorMessage =
      error instanceof Error ? error.message : 'An unexpected error occurred';
    return err(new ActionError(errorMessage));
  }
};
