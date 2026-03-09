import { Request, Response, NextFunction } from "express";
import type { Schema, ValidationOptions } from "joi";
import { ValidationError } from "../../core/index.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FieldConstraint {
  schema: Schema;
  options?: ValidationOptions;
}

export interface JoiConstraints {
  body?:    FieldConstraint;
  params?:  FieldConstraint;
  query?:   FieldConstraint;
  headers?: FieldConstraint;
  files?:   FieldConstraint;
}

export interface DirectConstraint {
  schema: Schema;
  data:   unknown;
  options?: ValidationOptions;
}

/**
 * Default validation options applied to every field unless overridden.
 * - abortEarly: false  → collect ALL errors, not just the first
 * - allowUnknown: false → reject unexpected fields
 * - stripUnknown: true  → remove unrecognised fields from the validated output
 */
const DEFAULT_OPTIONS: ValidationOptions = {
  abortEarly:   false,
  allowUnknown: false,
  stripUnknown: true,
};

// ─── Core Validator ───────────────────────────────────────────────────────────

const validateField = <T>(
  schema: Schema,
  data: unknown,
  options: ValidationOptions = DEFAULT_OPTIONS,
): T => {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
  const { error, value } = schema.validate(data, mergedOptions);

  if (error) {
    // Collect all error messages, not just the first
    const message = error.details.map((d) => d.message).join("; ");
    throw new ValidationError(message);
  }

  return value as T;
};

// ─── Middleware Validator ─────────────────────────────────────────────────────

/**
 * Express middleware that validates req.body, params, query, headers, and/or files.
 * Replaces each field with the sanitized, validated value from Joi.
 *
 * @example
 * router.post("/users", joiMiddleware({
 *   body:   { schema: createUserSchema },
 *   params: { schema: idParamSchema },
 * }), createUser);
 */
export const joiMiddleware = (constraints: JoiConstraints) => {
  if (!constraints || !Object.keys(constraints).length) {
    throw new ValidationError("joiMiddleware requires at least one constraint");
  }

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (constraints.body) {
        req.body = validateField(
          constraints.body.schema,
          req.body,
          constraints.body.options,
        );
      }

      if (constraints.params) {
        req.params = validateField(
          constraints.params.schema,
          req.params,
          constraints.params.options,
        );
      }

      if (constraints.query) {
        req.query = validateField(
          constraints.query.schema,
          req.query,
          constraints.query.options,
        );
      }

      if (constraints.headers) {
        req.headers = validateField(
          constraints.headers.schema,
          req.headers,
          constraints.headers.options,
        );
      }

      if (constraints.files) {
        req.files = validateField(
          constraints.files.schema,
          req.files,
          constraints.files.options,
        );
      }

      next();
    } catch (err) {
      next(err);
    }
  };
};

// ─── Direct / Inline Validator ────────────────────────────────────────────────

/**
 * Validates data directly outside of a middleware context.
 * Throws a ValidationError if invalid.
 *
 * @example
 * const value = joiValidate({ schema: createUserSchema, data: req.body });
 * const typed  = joiValidate<CreateUserDto>({ schema: createUserSchema, data: req.body });
 */
export const joiValidate = <T = unknown>({
  schema,
  data,
  options,
}: DirectConstraint): T => {
  if (!schema) throw new ValidationError("joiValidate requires a schema");
  return validateField<T>(schema, data, options);
};