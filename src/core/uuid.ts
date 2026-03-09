import { v1 as uuidV1, v4 as uuidV4, validate as uuidValidate } from "uuid";

type UUIDVersion = "v1" | "v4";
type UUIDBinary = Buffer;
type UUIDBuffer = Buffer;

export const uuid = {
  /**
   * Converts a UUID string to its optimized binary representation (Buffer).
   * Reorders bytes for better index performance in databases like MySQL.
   * If no UUID is provided, generates a new v1 UUID.
   */
  toBinary: (value?: string | UUIDBuffer): UUIDBinary => {
    if (Buffer.isBuffer(value)) return value;
    const id: string = value ?? uuidV1();
    const buf = Buffer.from(id.replace(/-/g, ""), "hex");
    return Buffer.concat([
      buf.subarray(6, 8),
      buf.subarray(4, 6),
      buf.subarray(0, 4),
      buf.subarray(8, 16),
    ]);
  },

  /**
   * Converts a binary UUID Buffer back to its string representation.
   */
  toString: (binary: UUIDBinary | string): string => {
    if (!binary) throw new Error("A binary UUID value is required");
    if (typeof binary === "string") return binary;
    return [
      binary.toString("hex", 4, 8),
      binary.toString("hex", 2, 4),
      binary.toString("hex", 0, 2),
      binary.toString("hex", 8, 10),
      binary.toString("hex", 10, 16),
    ].join("-");
  },

  /**
   * Generates a new UUID string.
   * Defaults to v4 (random). Pass "v1" for time-based UUIDs.
   *
   * @example
   * uuid.get()      // v4 UUID
   * uuid.get("v1")  // v1 UUID
   */
  get: (version: UUIDVersion = "v4"): string => {
    return version === "v1" ? uuidV1() : uuidV4();
  },

  /**
   * Returns true if the given string is a valid UUID.
   */
  isValid: (value: string): boolean => uuidValidate(value),

  /** The nil UUID — all zeros. Useful as a default/placeholder. */
  nil: "00000000-0000-0000-0000-000000000000" as const,

  /**
   * Converts specified keys of an object from binary UUIDs to strings.
   * Returns a shallow copy — does NOT mutate the original.
   *
   * @example
   * uuid.manyToString({ id: <Buffer>, name: "foo" }, ["id"])
   * // { id: "xxxxxxxx-...", name: "foo" }
   */
  manyToString: <T extends Record<string, any>>(data: T, keys: string[] = []): T => {
    if (!data) return data;
    const result = { ...data } as Record<string, any>;
    keys.forEach((key) => {
      if (result[key] != null) result[key] = uuid.toString(result[key]);
    });
    return result as T;
  },

  /**
   * Converts specified keys of an object from UUID strings to binary Buffers.
   * Returns a shallow copy — does NOT mutate the original.
   *
   * @example
   * uuid.manyToBinary({ id: "xxxxxxxx-...", name: "foo" }, ["id"])
   * // { id: <Buffer>, name: "foo" }
   */
  manyToBinary: <T extends Record<string, any>>(data: T, keys: string[] = []): T => {
    if (!data) return data;
    const result = { ...data } as Record<string, any>;
    keys.forEach((key) => {
      if (result[key] != null) result[key] = uuid.toBinary(result[key]);
    });
    return result as T;
  },
};