import { logger } from '@services/logger';
import type { Context } from 'hono';
import { ZodError } from 'zod';

export const errorHandler = (err: Error, c: Context) => {
  logger.error({ err }, 'API Error');

  // Zod validation errors
  if (err instanceof ZodError) {
    return c.json(
      {
        error: 'Validation error',
        details: err.errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
        })),
      },
      400
    );
  }

  // Custom application errors
  if (err.name === 'ValidationError') {
    return c.json(
      {
        error: err.message,
      },
      400
    );
  }

  // Default error
  return c.json(
    {
      error: 'Internal server error',
      message: err.message,
    },
    500
  );
};
