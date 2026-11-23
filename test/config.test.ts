import { describe, expect, it } from "vitest";
import { ConfigError, defineConfig, env, maskSecrets } from "../src/core/config";
import { errorHandler, isAppError } from "../src/core/error";

const load = <S extends Parameters<typeof defineConfig>[0]>(spec: S, source: Record<string, string>) =>
  defineConfig(spec, { source });

const problemsOf = (fn: () => unknown): string[] => {
  try {
    fn();
  } catch (err) {
    if (err instanceof ConfigError) return err.problems;
    throw err;
  }
  throw new Error("expected ConfigError");
};

describe("defineConfig", () => {
  it("parses and converts every field type", () => {
    const config = load(
      {
        PORT: env.port(),
        RATIO: env.num(),
        DEBUG: env.bool(),
        NAME: env.str(),
        API: env.url(),
        SUPPORT: env.email(),
        MODE: env.oneOf(["a", "b"]),
        ORIGINS: env.list(),
        FLAGS: env.json<{ beta: boolean }>()(),
      },
      {
        PORT: "8080",
        RATIO: "0.5",
        DEBUG: "YES",
        NAME: "orders",
        API: "https://api.example.com",
        SUPPORT: "help@example.com",
        MODE: "b",
        ORIGINS: "https://a.com, https://b.com,,",
        FLAGS: '{"beta":true}',
      },
    );

    expect(config).toEqual({
      PORT: 8080,
      RATIO: 0.5,
      DEBUG: true,
      NAME: "orders",
      API: "https://api.example.com",
      SUPPORT: "help@example.com",
      MODE: "b",
      ORIGINS: ["https://a.com", "https://b.com"],
      FLAGS: { beta: true },
    });
  });

  it("uses defaults for unset and empty variables", () => {
    const config = load(
      { PORT: env.port({ default: 3000 }), DEBUG: env.bool({ default: false }) },
      { PORT: "" },
    );
    expect(config).toEqual({ PORT: 3000, DEBUG: false });
  });

  it("allows optional variables to be missing", () => {
    const config = load({ REDIS_URL: env.url({ optional: true }) }, {});
    expect(config.REDIS_URL).toBeUndefined();
  });

  it("reports every problem at once", () => {
    const problems = problemsOf(() =>
      load(
        {
          DATABASE_URL: env.url({ description: "Postgres connection string" }),
          PORT: env.port(),
          DEBUG: env.bool(),
          MODE: env.oneOf(["dev", "prod"]),
        },
        { PORT: "99999", DEBUG: "maybe", MODE: "staging" },
      ),
    );

    expect(problems).toEqual([
      "DATABASE_URL: required but not set (Postgres connection string)",
      'PORT: must be a port number (1–65535), got "99999"',
      'DEBUG: must be true/false, 1/0, yes/no or on/off, got "maybe"',
      'MODE: must be one of: dev, prod, got "staging"',
    ]);
  });

  it("puts all problems in the error message", () => {
    try {
      load({ A: env.str(), B: env.num() }, { B: "x" });
      expect.unreachable();
    } catch (err: any) {
      expect(err.message).toBe(
        'Invalid configuration (2 problems):\n  - A: required but not set\n  - B: must be a number, got "x"',
      );
      expect(isAppError(err)).toBe(true);
      expect(errorHandler(err).error).toBe("CONFIG_ERROR");
    }
  });

  it("never shows secret values in errors", () => {
    const problems = problemsOf(() =>
      load({ JWT_SECRET: env.str({ secret: true, minLength: 32 }) }, { JWT_SECRET: "short-but-secret" }),
    );
    expect(problems).toEqual(["JWT_SECRET: must be at least 32 characters, got [hidden]"]);
    expect(problems.join()).not.toContain("short-but-secret");
  });

  it("validates number ranges and whole numbers", () => {
    expect(problemsOf(() => load({ N: env.num({ min: 1 }) }, { N: "0" }))[0]).toContain("must be ≥ 1");
    expect(problemsOf(() => load({ N: env.num({ max: 5 }) }, { N: "6" }))[0]).toContain("must be ≤ 5");
    expect(problemsOf(() => load({ N: env.num({ integer: true }) }, { N: "1.5" }))[0]).toContain("whole");
    expect(problemsOf(() => load({ N: env.num() }, { N: "12px" }))[0]).toContain("must be a number");
  });

  it("validates URL protocols and string patterns", () => {
    expect(
      problemsOf(() => load({ DB: env.url({ protocols: ["postgres"] }) }, { DB: "mysql://x" }))[0],
    ).toContain("must use postgres, got mysql");
    expect(
      problemsOf(() => load({ ID: env.str({ pattern: /^[a-z]+$/ }) }, { ID: "ABC" }))[0],
    ).toContain("must match");
  });

  it("shortens long invalid values in errors", () => {
    const problems = problemsOf(() => load({ N: env.num() }, { N: "x".repeat(200) }));
    expect(problems[0].length).toBeLessThan(120);
  });

  it("returns a frozen object", () => {
    const config = load({ A: env.str() }, { A: "1" });
    expect(Object.isFrozen(config)).toBe(true);
  });

  it("reads process.env by default", () => {
    process.env.NCK_TEST_PORT = "4321";
    try {
      expect(defineConfig({ NCK_TEST_PORT: env.port() }).NCK_TEST_PORT).toBe(4321);
    } finally {
      delete process.env.NCK_TEST_PORT;
    }
  });
});

describe("maskSecrets", () => {
  it("hides secret values and keeps the rest", () => {
    const config = load(
      { PORT: env.port(), DB: env.url({ secret: true }), TOKEN: env.str({ secret: true, optional: true }) },
      { PORT: "80", DB: "postgres://user:pw@db/app" },
    );
    expect(maskSecrets(config)).toEqual({ PORT: 80, DB: "[hidden]", TOKEN: undefined });
    expect(JSON.stringify(config)).toContain("pw"); // the config itself is untouched
  });
});
