import { Request, Response, NextFunction } from "express";
import { ValidationError } from "../../core";

const validate = (
  schema: any,
  object: any,
  option = { abortEarly: true, allowUnknown: false },
) => {
  const check = schema.validate(object, option);
  if (check.error) {
    throw new ValidationError(check.error.details[0].message);
  }
  return check.value;
};

export function joiValidator(constraint: any, isMiddleware = true): any {
  if (!constraint)
    throw new ValidationError(
      "Kindly supply validation schema to joiValidator",
    );

  if (!isMiddleware) {
    return validate(constraint.schema, constraint.data, constraint.option);
  }
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (constraint.body) {
        req.body = validate(
          constraint.body.schema,
          req.body,
          constraint.body.options,
        );
      }
      if (constraint.params)
        req.params = validate(
          constraint.params.schema,
          req.params,
          constraint.params.options,
        );
      if (constraint.query)
        req.query = validate(
          constraint.query.schema,
          req.query,
          constraint.query.options,
        );
      if (constraint.headers)
        req.headers = validate(
          constraint.headers.schema,
          req.headers,
          constraint.headers.options,
        );

      return next();
    } catch (err) {
      next(err);
    }
  };
}
