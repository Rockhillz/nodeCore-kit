import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeRequest } from "../src/transport/http";
import { HttpError, errorHandler } from "../src/core/error";

let server: http.Server;
let base: string;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === "/text-404") {
      res.writeHead(404, { "content-type": "text/plain" });
      return res.end("Not here");
    }
    if (req.url === "/json-409") {
      res.writeHead(409, { "content-type": "application/json" });
      return res.end(JSON.stringify({ message: "Email taken", error: "ENTRY_EXISTS" }));
    }
    if (req.url === "/slow") {
      setTimeout(() => res.end("{}"), 500);
      return;
    }
    if (req.url === "/echo-headers") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify(req.headers));
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
});

const catchError = async (p: Promise<unknown>): Promise<any> => {
  try {
    await p;
  } catch (err) {
    return err;
  }
  throw new Error("expected promise to reject");
};

describe("makeRequest", () => {
  it("returns the parsed body on success", async () => {
    await expect(makeRequest({ url: `${base}/ok` })).resolves.toEqual({ ok: true });
  });

  it("throws an HttpError that keeps the status for a plain-text error body", async () => {
    const err = await catchError(makeRequest({ url: `${base}/text-404` }));

    expect(err).toBeInstanceOf(HttpError);
    expect(err).toBeInstanceOf(Error);
    expect(err.statusCode).toBe(404);
    expect(err.httpStatusCode).toBe(404); // backwards-compatible alias
    expect(err.body).toBe("Not here");
    expect(err.message).toBe("Not here");
  });

  it("uses message and error code from a JSON error body", async () => {
    const err = await catchError(makeRequest({ url: `${base}/json-409` }));

    expect(err.statusCode).toBe(409);
    expect(err.message).toBe("Email taken");
    expect(err.errorCode).toBe("ENTRY_EXISTS");
    expect(err.body).toEqual({ message: "Email taken", error: "ENTRY_EXISTS" });
  });

  it("errorHandler keeps the upstream status code", async () => {
    const err = await catchError(makeRequest({ url: `${base}/text-404` }));
    const response = errorHandler(err);

    expect(response.httpStatusCode).toBe(404);
    expect(response.message).toBe("Not here");
  });

  it("does not mutate the caller's headers object", async () => {
    const headers = { "x-custom": "1" };
    await makeRequest({ url: `${base}/ok`, headers, token: "Bearer t" });
    expect(headers).toEqual({ "x-custom": "1" });
  });

  it("sends custom headers and the token", async () => {
    const echoed = await makeRequest({
      url: `${base}/echo-headers`,
      headers: { "x-custom": "1" },
      token: "Bearer t",
    });
    expect(echoed["x-custom"]).toBe("1");
    expect(echoed.authorization).toBe("Bearer t");
  });

  it("throws a 504 HttpError on timeout", async () => {
    const err = await catchError(makeRequest({ url: `${base}/slow`, timeout: 50 }));

    expect(err).toBeInstanceOf(HttpError);
    expect(err.statusCode).toBe(504);
    expect(err.errorCode).toBe("UPSTREAM_TIMEOUT");
  });

  it("throws a 502 HttpError on network failure without leaking the token", async () => {
    const err = await catchError(
      // Port 1 is reserved; nothing listens there
      makeRequest({ url: "http://127.0.0.1:1/x?api_key=SECRET_QS", token: "Bearer SECRET_TOKEN" }),
    );

    expect(err).toBeInstanceOf(HttpError);
    expect(err.statusCode).toBe(502);
    expect(err.url).toBe("http://127.0.0.1:1/x");

    const serialized = JSON.stringify({ ...err, message: err.message, stack: err.stack });
    expect(serialized).not.toContain("SECRET_TOKEN");
    expect(serialized).not.toContain("SECRET_QS");
  });
});
