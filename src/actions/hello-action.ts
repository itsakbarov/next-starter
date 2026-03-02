'use server';

import { err, ok, Result } from '@/lib/result';

interface HelloResponse {
  message: string;
}

export const helloAction = async (
  name: string
): Promise<Result<HelloResponse>> => {
  // Validate input
  if (!name || typeof name !== 'string') {
    return err('validation', 'Name must be a non-empty string', {
      code: 'invalid_name',
      context: { providedName: name },
    });
  }

  if (name.trim().length === 0) {
    return err('validation', 'Name cannot be empty or whitespace', {
      code: 'empty_name',
    });
  }

  if (name.length > 100) {
    return err('validation', 'Name is too long (maximum 100 characters)', {
      code: 'name_too_long',
      context: { length: name.length },
    });
  }

  // Success case
  return ok({
    message: `Hello ${name.trim()}, from server!`,
  });
};
