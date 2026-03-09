/**
 * Flattens a nested object into a single-level object with dot-notation keys.
 *
 * @example
 * flattenObject({ a: { b: { c: 1 } } })         // { "a.b.c": 1 }
 * flattenObject({ a: { b: 1 } }, { separator: "_" }) // { "a_b": 1 }
 */
export const flattenObject = (
  obj: Record<string, any>,
  { separator = ".", prefix = "" }: { separator?: string; prefix?: string } = {},
): Record<string, any> => {
  if (!obj || typeof obj !== "object") return {};

  const res: Record<string, any> = {};

  const isPlainObject = (val: any): boolean =>
    val !== null &&
    typeof val === "object" &&
    !Array.isArray(val) &&
    !(val instanceof Date) &&
    !(val instanceof RegExp);

  for (const key in obj) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;

    const newKey = prefix ? `${prefix}${separator}${key}` : key;

    if (isPlainObject(obj[key])) {
      Object.assign(res, flattenObject(obj[key], { separator, prefix: newKey }));
    } else {
      res[newKey] = obj[key];
    }
  }

  return res;
};

/**
 * Restores a flattened dot-notation object back to its nested form.
 *
 * @example
 * unflattenObject({ "a.b.c": 1 })   // { a: { b: { c: 1 } } }
 */
export const unflattenObject = (
  obj: Record<string, any>,
  separator = ".",
): Record<string, any> => {
  if (!obj || typeof obj !== "object") return {};

  const result: Record<string, any> = {};

  for (const key in obj) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;

    const keys = key.split(separator);
    keys.reduce((acc, part, index) => {
      if (index === keys.length - 1) {
        acc[part] = obj[key];
        return acc;
      }
      acc[part] = acc[part] && typeof acc[part] === "object" ? acc[part] : {};
      return acc[part];
    }, result);
  }

  return result;
};