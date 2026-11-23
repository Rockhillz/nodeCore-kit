// Compile-time checks for defineConfig's inferred types (checked by `npm run typecheck`).
import { defineConfig, env } from "../../src/core/config";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const assert = <T extends true>() => {};

const config = defineConfig(
  {
    PORT: env.port({ default: 3000 }),
    TIMEOUT: env.num(),
    DEBUG: env.bool({ default: false }),
    NAME: env.str(),
    REDIS_URL: env.url({ optional: true }),
    WITH_DEFAULT: env.str({ optional: true, default: "x" }),
    NODE_ENV: env.oneOf(["development", "production"], { default: "development" }),
    ORIGINS: env.list({ default: [] }),
    FLAGS: env.json<{ beta: boolean }>()(),
  },
  { source: {} },
);

assert<Equal<typeof config.PORT, number>>();
assert<Equal<typeof config.TIMEOUT, number>>();
assert<Equal<typeof config.DEBUG, boolean>>();
assert<Equal<typeof config.NAME, string>>();
assert<Equal<typeof config.REDIS_URL, string | undefined>>();
assert<Equal<typeof config.WITH_DEFAULT, string>>();
assert<Equal<typeof config.NODE_ENV, "development" | "production">>();
assert<Equal<typeof config.ORIGINS, string[]>>();
assert<Equal<typeof config.FLAGS, { beta: boolean }>>();

// @ts-expect-error config is read-only
config.PORT = 1;

// @ts-expect-error default must match the field type
env.port({ default: "3000" });

// @ts-expect-error default must be one of the choices
env.oneOf(["a", "b"], { default: "c" });
