/**
 * Returns true for plain objects (not arrays, dates, null, etc.)
 */
export const isObject = (val: any): boolean =>
  val !== null && typeof val === "object" && !Array.isArray(val);

/**
 * Validates an email address format.
 */
export const isEmail = (value: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

/**
 * Validates a UUID v1–v5 string.
 */
export const isUUID = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

/**
 * Returns true for finite numbers (excludes NaN and Infinity).
 */
export const isNumber = (value: any): boolean =>
  typeof value === "number" && isFinite(value);

/**
 * Returns true if the string is valid parseable JSON.
 */
export const isJSON = (value: string): boolean => {
  if (!value || typeof value !== "string") return false;
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
};

/**
 * Returns true for valid Date instances.
 */
export const isDate = (value: any): boolean =>
  value instanceof Date && !isNaN(value.getTime());

/**
 * Returns true for valid http/https URLs only.
 * Rejects data:, javascript:, and other URI schemes.
 */
export const isURL = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

/**
 * Returns true only for actual booleans (not truthy/falsy values).
 */
export const isBoolean = (value: any): boolean =>
  typeof value === "boolean";

/**
 * Returns true for strings.
 */
export const isString = (value: any): boolean =>
  typeof value === "string";

/**
 * Returns true for arrays.
 */
export const isArray = (value: any): boolean =>
  Array.isArray(value);

/**
 * Returns true for integers (excludes floats, NaN, Infinity).
 */
export const isInteger = (value: any): boolean =>
  typeof value === "number" && Number.isInteger(value);

/**
 * Returns true for positive numbers (excludes zero).
 */
export const isPositive = (value: any): boolean =>
  isNumber(value) && value > 0;

/**
 * Returns true for negative numbers (excludes zero).
 */
export const isNegative = (value: any): boolean =>
  isNumber(value) && value < 0;

/**
 * Returns true if value is null or undefined.
 */
export const isNil = (value: any): boolean =>
  value === null || value === undefined;

/**
 * Returns true if the value is "empty":
 * - null / undefined
 * - empty string or whitespace-only string
 * - empty array
 * - empty plain object
 */
export const isEmpty = (val: any): boolean => {
  if (isNil(val)) return true;
  if (typeof val === "string") return val.trim().length === 0;
  if (Array.isArray(val)) return val.length === 0;
  if (isObject(val)) return Object.keys(val).length === 0;
  return false;
};