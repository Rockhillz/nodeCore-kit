import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createHttpClient } from "../src/transport/http";
import { HttpError, ValidationError } from "../src/core/error";

let server: http.Server;
let base: string;
const hits = new Map<string, number>();

const readBody = (req: http.IncomingMessage) =>
  new Promise<string>((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
  });

beforeAll(async () => {
  server = http.createServer(async (req, res) => {
    const url = new URL(req.url!, "http://x");
    hits.set(url.pathname, (hits.get(url.pathname) ?? 0) + 1);
    const count = hits.get(url.pathname)!;
    const json = (status: number, body: unknown, headers: Record<string, string> = {}) => {
      res.writeHead(status, { "content-type": "application/json", ...headers });
      res.end(JSON.stringify(body));
    };

    switch (url.pathname) {
      case "/api/echo":
        return json(200, {
          method: req.method,
          query: url.search,
          headers: req.headers,
          body: await readBody(req),
        });
      case "/api/flaky": // fails twice with 503, then succeeds
        return count <= 2 ? json(503, { message: "busy" }) : json(200, { ok: true, count });
      case "/api/rate-limited":
        return count === 1 ? json(429, { message: "slow" }, { "retry-after": "0" }) : json(200, { ok: true });
      case "/api/always-503":
        return json(503, { message: "down" });
      case "/api/post-503":
        return json(503, { message: "down" });
      case "/api/no-content":
        res.writeHead(204);
        return res.end();
      case "/api/text":
        res.writeHead(200, { "content-type": "text/plain" });
        return res.end("hello");
      case "/api/slow":
        setTimeout(() => json(200, {}), 300);
        return;
      default:
        return json(404, { message: "nope", error: "NOT_FOUND" });
    }
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
});

describe("createHttpClient", () => {
  it("joins baseURL and path, and serialises query params", async () => {
    const api = createHttpClient({ baseURL: `${base}/api/` });
    const res = await api.get<any>("/echo", {
      query: { tags: ["a", "b"], page: 2, skip: undefined, empty: null },
    });
    expect(res.query).toBe("?tags=a&tags=b&page=2");
  });

  it("sends JSON bodies with a content type", async () => {
    const api = createHttpClient({ baseURL: base });
    const res = await api.post<any>("/api/echo", { name: "Ada" });
    expect(res.method).toBe("POST");
    expect(res.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(res.body)).toEqual({ name: "Ada" });
  });

  it("merges client and request headers, and resolves token functions", async () => {
    const token = vi.fn(async () => "Bearer fresh");
    const api = createHttpClient({ baseURL: base, headers: { "x-service": "orders" }, token });
    const res = await api.get<any>("/api/echo", { headers: { "x-extra": "1" } });

    expect(res.headers["x-service"]).toBe("orders");
    expect(res.headers["x-extra"]).toBe("1");
    expect(res.headers.authorization).toBe("Bearer fresh");
    expect(token).toHaveBeenCalledTimes(1);
  });

  it("keeps an Authorization header passed in headers when there is no token", async () => {
    const api = createHttpClient({ baseURL: base });
    const res = await api.get<any>("/api/echo", { headers: { Authorization: "Basic abc" } });
    expect(res.headers.authorization).toBe("Basic abc");
  });

  it("returns status and headers from request()", async () => {
    const api = createHttpClient({ baseURL: base });
    const res = await api.request("/api/no-content", { method: "DELETE" });
    expect(res.status).toBe(204);
    expect(res.data).toBeUndefined();
  });

  it("returns text for non-JSON responses", async () => {
    const api = createHttpClient({ baseURL: base });
    await expect(api.get("/api/text")).resolves.toBe("hello");
  });

  it("throws HttpError with status, code and body", async () => {
    const api = createHttpClient({ baseURL: base });
    const err: any = await api.get("/api/missing").catch((e) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err).toMatchObject({ statusCode: 404, errorCode: "NOT_FOUND", message: "nope" });
    expect(err.headers["content-type"]).toBe("application/json");
  });

  it("retries idempotent requests on 503 and succeeds", async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const api = createHttpClient({ baseURL: base, retry: { retries: 3, delay: 1 }, logger });
    await expect(api.get("/api/flaky")).resolves.toEqual({ ok: true, count: 3 });
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });

  it("honours Retry-After on 429", async () => {
    const api = createHttpClient({ baseURL: base, retry: 1 });
    await expect(api.get("/api/rate-limited")).resolves.toEqual({ ok: true });
  });

  it("gives up after the configured retries", async () => {
    const api = createHttpClient({ baseURL: base, retry: { retries: 2, delay: 1 } });
    const err: any = await api.get("/api/always-503").catch((e) => e);
    expect(err.statusCode).toBe(503);
    expect(hits.get("/api/always-503")).toBe(3);
  });

  it("does not retry POST by default", async () => {
    const api = createHttpClient({ baseURL: base, retry: { retries: 3, delay: 1 } });
    await api.post("/api/post-503", { a: 1 }).catch(() => {});
    expect(hits.get("/api/post-503")).toBe(1);
  });

  it("times out with a 504 HttpError", async () => {
    const api = createHttpClient({ baseURL: base, timeout: 50 });
    const err: any = await api.get("/api/slow").catch((e) => e);
    expect(err).toMatchObject({ statusCode: 504, errorCode: "UPSTREAM_TIMEOUT" });
  });

  it("rejects with the caller's reason when aborted", async () => {
    const api = createHttpClient({ baseURL: base });
    const controller = new AbortController();
    const pending = api.get("/api/slow", { signal: controller.signal });
    controller.abort(new Error("user cancelled"));
    await expect(pending).rejects.toThrow("user cancelled");
  });

  it("rejects a body on GET", async () => {
    const api = createHttpClient({ baseURL: base });
    await expect(api.request("/api/echo", { method: "GET", body: { a: 1 } })).rejects.toThrow(
      ValidationError,
    );
  });

  it("uses an injected fetch", async () => {
    const fakeFetch = vi.fn(async () => new Response(JSON.stringify({ fake: true }), {
      headers: { "content-type": "application/json" },
    }));
    const api = createHttpClient({ baseURL: "https://example.test", fetch: fakeFetch as any });
    await expect(api.get("/x")).resolves.toEqual({ fake: true });
    expect(fakeFetch).toHaveBeenCalledWith("https://example.test/x", expect.any(Object));
  });
});
