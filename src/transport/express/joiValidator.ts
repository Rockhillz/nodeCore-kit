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

// Headers carry many values a schema won't list (host, user-agent, …),
// so unknown keys are allowed and kept by default.
const HEADER_DEFAULT_OPTIONS: ValidationOptions = {
  allowUnknown: true,
  stripUnknown: false,
};

const REQUEST_FIELDS = ["body", "params", "query", "headers", "files"] as const;

/**
 * Writes the validated value back onto the request.
 * Express 5 makes `req.query` a getter-only property, so a plain assignment
 * throws. `defineProperty` sets an own property that works on Express 4 and 5.
 */
const setRequestField = (req: Request, field: string, value: unknown): void => {
  Object.defineProperty(req, field, {
    value,
    writable: true,
    configurable: true,
    enumerable: true,
  });
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
      for (const field of REQUEST_FIELDS) {
        const constraint = constraints[field];
        if (!constraint) continue;

        const options =
          field === "headers"
            ? { ...HEADER_DEFAULT_OPTIONS, ...constraint.options }
            : constraint.options;

        const value = validateField(constraint.schema, (req as any)[field], options);

        // Headers are only validated, never replaced: replacing them would
        // drop every header the schema doesn't list.
        if (field !== "headers") setRequestField(req, field, value);
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