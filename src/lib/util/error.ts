/**
 * Turns a caught value into something worth showing a user.
 *
 * A `catch` binding is `unknown`: it is usually an `Error`, but a rejected
 * promise can carry anything at all. This narrows it in one place so callers do
 * not each have to guess.
 */
export const errorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  // Anything else - a rejected promise can carry any value at all.
  return JSON.stringify(error) ?? 'Unknown error';
};
