import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { expressErrorMiddleware } from "../src/transport/express/errorMiddleware";
import { extractBearerToken } from "../src/transport/express/express-middleware";
import { NotFoundError, TooManyRequestsError } from "../src/core/error";

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
let base: string;
let close: () => void;

beforeAll(async () => {
  const app = express();
  app.get("/not-found", () => {
    throw new NotFoundError("User not found");
  });
  app.get("/crash", () => {
    throw new Error("SELECT * FROM secrets failed");
  });
  app.get("/limited", () => {
    throw new TooManyRequestsError("Slow down", { retryAfter: 30 });
  });
  app.get("/token", (req, res) => {
    res.json({ token: extractBearerToken(req) });
  });
  app.use(expressErrorMiddleware({ service: "test-svc", logger }));

  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});

afterAll(() => close());

describe("expressErrorMiddleware", () => {
  it("returns AppErrors with their status and echoes the request ID", async () => {
    const res = await fetch(`${base}/not-found`, { headers: { "x-request-id": "req-7" } });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({
      message: "User not found",
      error: "NOT_FOUND",
      service: "test-svc",
      requestId: "req-7",
    });
  });

  it("hides unknown error messages and logs them", async () => {
    logger.error.mockClear();
    const res = await fetch(`${base}/crash`);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toBe("Something went wrong");
    expect(JSON.stringify(body)).not.toContain("secrets");
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it("sets Retry-After for rate-limit errors", async () => {
    const res = await fetch(`${base}/limited`);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("30");
  });
});

describe("extractBearerToken", () => {
  it("accepts any casing of the scheme", async () => {
    const res = await fetch(`${base}/token`, { headers: { authorization: "bearer abc" } });
    expect(await res.json()).toEqual({ token: "abc" });
  });

  it("returns 401 when the header is missing or malformed", async () => {
    expect((await fetch(`${base}/token`)).status).toBe(401);
    expect((await fetch(`${base}/token`, { headers: { authorization: "Basic abc" } })).status).toBe(401);
  });
});
