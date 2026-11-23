import { AppError } from "./error.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FieldOptions<T> {
  /** Used when the variable is unset or empty */
  default?: T;
  /** Allow the variable to be missing; its value is then `undefined` */
  optional?: boolean;
  /** Never show the value in errors or `maskSecrets()` output */
  secret?: boolean;
  /** Shown in error messages to help whoever sets up the environment */
  description?: string;
}

/** A parsed config field. Build one with `env.str()`, `env.num()`, `env.bool()`, … */
export interface Field<T, Optional extends boolean = boolean> {
  readonly kind: string;
  readonly options: FieldOptions<T>;
  /** Converts the raw string; throws an Error with a short reason on bad input */
  parse(raw: string): T;
  /** Type marker only */
  readonly _optional?: Optional;
}

/** Optional without a default → may be undefined */
type IsOptional<O> = O extends { optional: true } ? (O extends { default: any } ? false : true) : false;

type ValueOf<F> = F extends Field<infer T, infer O> ? (O extends true ? T | undefined : T) : never;

export type ConfigSpec = Record<string, Field<any, boolean>>;
export type Config<S extends ConfigSpec> = { readonly [K in keyof S]: ValueOf<S[K]> };

export interface DefineConfigOptions {
  /** Where to read variables from (default: `process.env`) */
  source?: Record<string, string | undefined>;
}

/** Thrown by `defineConfig` listing every invalid or missing variable */
export class ConfigError extends AppError {
  /** One entry per problem */
  public readonly problems: string[];

  constructor(problems: string[]) {
    super(
      { code: 500, message: "Invalid configuration" },
      `Invalid configuration (${problems.length} problem${problems.length === 1 ? "" : "s"}):\n` +
        problems.map((p) => `  - ${p}`).join("\n"),
      "CONFIG_ERROR",
      { problems },
    );
    this.problems = problems;
  }
}

// ─── Field Builders ───────────────────────────────────────────────────────────

const field = <T, O extends FieldOptions<T>>(
  kind: string,
  options: O | undefined,
  parse: (raw: string) => T,
): Field<T, IsOptional<O>> => ({ kind, options: options ?? {}, parse });

/**
 * Any string.
 * @example API_KEY: env.str({ secret: true, minLength: 20 })
 */
const str = <O extends FieldOptions<string> & { minLength?: number; pattern?: RegExp }>(
  options?: O,
) =>
  field("string", options, (raw) => {
    if (options?.minLength !== undefined && raw.length < options.minLength) {
      throw new Error(`must be at least ${options.minLength} characters`);
    }
    if (options?.pattern && !options.pattern.test(raw)) {
      throw new Error(`must match ${options.pattern}`);
    }
    return raw;
  });

/**
 * A number. Rejects text like "abc" or "12px".
 * @example TIMEOUT_MS: env.num({ default: 5000, min: 0 })
 */
const num = <O extends FieldOptions<number> & { min?: number; max?: number; integer?: boolean }>(
  options?: O,
) =>
  field("number", options, (raw) => {
    const value = Number(raw.trim());
    if (raw.trim() === "" || !Number.isFinite(value)) throw new Error("must be a number");
    if (options?.integer && !Number.isInteger(value)) throw new Error("must be a whole number");
    if (options?.min !== undefined && value < options.min) throw new Error(`must be ≥ ${options.min}`);
    if (options?.max !== undefined && value > options.max) throw new Error(`must be ≤ ${options.max}`);
    return value;
  });

/**
 * A TCP port, 1–65535.
 * @example PORT: env.port({ default: 3000 })
 */
const port = <O extends FieldOptions<number>>(options?: O) =>
  field("port", options, (raw) => {
    const value = Number(raw.trim());
    if (!Number.isInteger(value) || value < 1 || value > 65535) {
      throw new Error("must be a port number (1–65535)");
    }
    return value;
  });

const TRUE = new Set(["true", "1", "yes", "on"]);
const FALSE = new Set(["false", "0", "no", "off"]);

/**
 * A boolean: true/false, 1/0, yes/no, on/off (any case).
 * @example DEBUG: env.bool({ default: false })
 */
const bool = <O extends FieldOptions<boolean>>(options?: O) =>
  field("boolean", options, (raw) => {
    const v = raw.trim().toLowerCase();
    if (TRUE.has(v)) return true;
    if (FALSE.has(v)) return false;
    throw new Error("must be true/false, 1/0, yes/no or on/off");
  });

/**
 * A URL. Restrict schemes with `protocols`.
 * @example DATABASE_URL: env.url({ protocols: ["postgres", "postgresql"], secret: true })
 */
const url = <O extends FieldOptions<string> & { protocols?: string[] }>(options?: O) =>
  field("url", options, (raw) => {
    let parsed: URL;
    try {
      parsed = new URL(raw.trim());
    } catch {
      throw new Error("must be a valid URL");
    }
    const scheme = parsed.protocol.replace(/:$/, "");
    if (options?.protocols && !options.protocols.includes(scheme)) {
      throw new Error(`must use ${options.protocols.join(" or ")}, got ${scheme}`);
    }
    return raw.trim();
  });

/**
 * An email address.
 * @example SUPPORT_EMAIL: env.email({ default: "support@example.com" })
 */
const email = <O extends FieldOptions<string>>(options?: O) =>
  field("email", options, (raw) => {
    const v = raw.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new Error("must be an email address");
    return v;
  });

/**
 * One of a fixed set of values. The type is the union of the choices.
 * @example NODE_ENV: env.oneOf(["development", "test", "production"], { default: "development" })
 */
const oneOf = <const C extends readonly string[], O extends FieldOptions<C[number]>>(
  choices: C,
  options?: O,
) =>
  field("oneOf", options, (raw): C[number] => {
    const v = raw.trim();
    if (!choices.includes(v)) throw new Error(`must be one of: ${choices.join(", ")}`);
    return v;
  });

/**
 * A comma-separated list (separator configurable). Empty items are dropped.
 * @example CORS_ORIGINS: env.list({ default: [] })
 */
const list = <O extends FieldOptions<string[]> & { separator?: string }>(options?: O) =>
  field("list", options, (raw) =>
    raw
      .split(options?.separator ?? ",")
      .map((s) => s.trim())
      .filter(Boolean),
  );

/**
 * JSON. Pass the expected type as a generic; the shape isn't checked.
 * @example FEATURE_FLAGS: env.json<Record<string, boolean>>()({ default: {} })
 */
const json =
  <T = unknown>() =>
  <O extends FieldOptions<T>>(options?: O) =>
    field("json", options, (raw): T => {
      try {
        return JSON.parse(raw) as T;
      } catch {
        throw new Error("must be valid JSON");
      }
    });

/**
 * Field builders for `defineConfig`.
 *
 * @example
 * defineConfig({ PORT: env.port({ default: 3000 }), DEBUG: env.bool({ default: false }) });
 */
export const env = { str, num, port, bool, url, email, oneOf, list, json } as const;

// ─── defineConfig ─────────────────────────────────────────────────────────────

const SECRETS = Symbol.for("nodecore-kit.config.secrets");

/**
 * Reads and validates environment variables once, at startup.
 *
 * - Every problem is reported in one `ConfigError`, not one at a time
 * - Values are converted to the right type (`PORT` is a number, `DEBUG` a boolean)
 * - Empty strings (`FOO=`) count as unset
 * - Secret values never appear in errors
 * - The result is frozen
 *
 * Load a .env file with Node's built-in `node --env-file=.env app.js`.
 *
 * @example
 * export const config = defineConfig({
 *   NODE_ENV:     env.oneOf(["development", "test", "production"], { default: "development" }),
 *   PORT:         env.port({ default: 3000 }),
 *   DATABASE_URL: env.url({ secret: true }),
 *   JWT_SECRET:   env.str({ secret: true, minLength: 32 }),
 *   REDIS_URL:    env.url({ optional: true }),
 *   DEBUG:        env.bool({ default: false }),
 * });
 *
 * config.PORT;      // number
 * config.REDIS_URL; // string | undefined
 */
export const defineConfig = <S extends ConfigSpec>(
  spec: S,
  { source: env = process.env }: DefineConfigOptions = {},
): Config<S> => {
  const result: Record<string, unknown> = {};
  const problems: string[] = [];
  const secrets: string[] = [];

  for (const [key, f] of Object.entries(spec)) {
    const { default: fallback, optional, secret, description } = f.options;
    if (secret) secrets.push(key);
    const hint = description ? ` (${description})` : "";
    const raw = env[key];

    if (raw === undefined || raw === "") {
      if (fallback !== undefined) result[key] = fallback;
      else if (optional) result[key] = undefined;
      else problems.push(`${key}: required but not set${hint}`);
      continue;
    }

    try {
      result[key] = f.parse(raw);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      const shown = secret ? "[hidden]" : JSON.stringify(raw.length > 60 ? `${raw.slice(0, 60)}…` : raw);
      problems.push(`${key}: ${reason}, got ${shown}${hint}`);
    }
  }

  if (problems.length) throw new ConfigError(problems);

  Object.defineProperty(result, SECRETS, { value: secrets });
  return Object.freeze(result) as Config<S>;
};

/**
 * Copy of a config with secret values replaced by "[hidden]", safe to log.
 *
 * @example
 * logger.info("Config loaded", maskSecrets(config));
 */
export const maskSecrets = <C extends object>(config: C): Record<string, unknown> => {
  const secrets: string[] = (config as any)[SECRETS] ?? [];
  return Object.fromEntries(
    Object.entries(config).map(([k, v]) => [k, secrets.includes(k) && v !== undefined ? "[hidden]" : v]),
  );
};
