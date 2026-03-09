/**
 * String utility functions
 */

export const splitWords = (str: string): string[] =>
  str
    .replace(/\W+/g, " ")
    .split(/ |\B(?=[A-Z])/)
    .map((w) => w.toLowerCase())
    .filter(Boolean);

// ─── Case Transforms ─────────────────────────────────────────────────────────

export const capitalize = (str: string): string => {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
};

export const toUpperCase = (str: string): string => str.toUpperCase();

export const toLowerCase = (str: string): string => str.toLowerCase();

export const camelCase = (str: string): string => {
  if (!str) return "";
  return str
    .trim()
    .toLowerCase()
    .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ""));
};

export const pascalCase = (str: string): string => {
  if (!str) return "";
  return camelCase(str).replace(/^(.)/, (c) => c.toUpperCase());
};

export const snakeCase = (str: string): string => {
  if (!str) return "";
  return splitWords(str).join("_");
};

export const kebabCase = (str: string): string => {
  if (!str) return "";
  return splitWords(str).join("-");
};

// ─── Formatting ───────────────────────────────────────────────────────────────

/**
 * Truncates a string to `length` characters, appending `suffix` if trimmed.
 * The suffix length is included in the total, so the result never exceeds `length`.
 *
 * @example
 * truncate("Hello, world!", 8)         // "Hello..."
 * truncate("Hello, world!", 8, " →")   // "Hello →"
 */
export const truncate = (
  str: string,
  length = 50,
  suffix = "...",
): string => {
  if (!str) return "";
  if (str.length <= length) return str;
  return str.slice(0, length - suffix.length).trimEnd() + suffix;
};

/**
 * Masks all but the last `visible` characters of a string.
 * Useful for displaying sensitive values like credit cards or tokens.
 *
 * @example
 * maskString("4111111111111234")       // "************1234"
 * maskString("mysecrettoken", 6)       // "*******secret"  ← last 6 visible
 */
export const maskString = (str: string, visible = 4): string => {
  if (!str) return "";
  const visibleCount = Math.min(visible, str.length);
  const maskedLength = str.length - visibleCount;
  return "*".repeat(maskedLength) + str.slice(maskedLength);
};

// ─── Inspection / Misc ───────────────────────────────────────────────────────

/**
 * Returns true if the string contains only whitespace or is empty.
 */
export const isBlank = (str: string): boolean => !str || str.trim().length === 0;

/**
 * Reverses a string.
 */
export const reverse = (str: string): string => {
  if (!str) return "";
  return str.split("").reverse().join("");
};

/**
 * Counts occurrences of `substr` within `str`.
 */
export const countOccurrences = (str: string, substr: string): number => {
  if (!str || !substr) return 0;
  return str.split(substr).length - 1;
};

/**
 * Removes all extra whitespace — trims the string and collapses
 * internal sequences of whitespace down to a single space.
 *
 * @example
 * normalizeWhitespace("  hello   world  ")  // "hello world"
 */
export const normalizeWhitespace = (str: string): string => {
  if (!str) return "";
  return str.trim().replace(/\s+/g, " ");
};