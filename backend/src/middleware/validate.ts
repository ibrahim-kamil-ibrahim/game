import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

export interface ValidationSchemas {
  body?: z.ZodTypeAny;
  query?: z.ZodTypeAny;
  params?: z.ZodTypeAny;
}

/**
 * Validates and replaces request input with parsed values. Unknown keys are
 * stripped by Zod, so clients cannot inject extra fields into services.
 */
export function validate(schemas: ValidationSchemas) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.query) req.query = schemas.query.parse(req.query) as unknown as Request['query'];
      if (schemas.params) req.params = schemas.params.parse(req.params) as Request['params'];
      next();
    } catch (error) {
      next(error);
    }
  };
}

export const idParamSchema = z.object({
  id: z.string().uuid('A valid identifier is required'),
});
