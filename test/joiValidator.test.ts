import type { AddressInfo } from "node:net";
import express from "express";
import Joi from "joi";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { joiMiddleware, joiValidate } from "../src/transport/express/joiValidator";
import { errorHandler, ValidationError } from "../src/core/error";

let base: string;
let close: () => void;

beforeAll(async () => {
  const app = express();
  app.use(express.json());

  app.get(
    "/query",
    joiMiddleware({ query: { schema: Joi.object({ n: Joi.number().required() }) } }),
    (req, res) => res.json({ query: req.query }),
  );

  app.post(
    "/body/:id",
    joiMiddleware({
      params: { schema: Joi.object({ id: Joi.number() }) },
      body: { schema: Joi.object({ name: Joi.string().required() }) },
    }),
    (req, res) => res.json({ params: req.params, body: req.body }),
  );

  app.get(
    "/headers",
    joiMiddleware({ headers: { schema: Joi.object({ "x-api-key": Joi.string().required() }) } }),
    (req, res) => res.json({ host: req.headers.host, key: req.headers["x-api-key"] }),
  );

  app.use((err: any, _req: any, res: any, _next: any) => {
    const e = errorHandler(err);
    res.status(e.httpStatusCode).json(e);
  });

  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});

afterAll(() => close());

describe("joiMiddleware (Express 5)", () => {
  it("validates and coerces req.query", async () => {
    const res = await fetch(`${base}/query?n=5&extra=1`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ query: { n: 5 } });
  });

  it("rejects an invalid query with 422", async () => {
    const res = await fetch(`${base}/query?n=abc`);
    expect(res.status).toBe(422);
  });

  it("validates params and body together", async () => {
    const res = await fetch(`${base}/body/7`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Ada", junk: true }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ params: { id: 7 }, body: { name: "Ada" } });
  });

  it("validates headers without dropping unlisted ones", async () => {
    const res = await fetch(`${base}/headers`, { headers: { "x-api-key": "k" } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.key).toBe("k");
    expect(json.host).toBeTruthy();
  });

  it("rejects missing required headers", async () => {
    const res = await fetch(`${base}/headers`);
    expect(res.status).toBe(422);
  });
});

describe("joiValidate", () => {
  it("returns the validated value", () => {
    const value = joiValidate<{ n: number }>({
      schema: Joi.object({ n: Joi.number() }),
      data: { n: "3" },
    });
    expect(value).toEqual({ n: 3 });
  });

  it("throws ValidationError with all messages", () => {
    expect(() =>
      joiValidate({
        schema: Joi.object({ a: Joi.string().required(), b: Joi.string().required() }),
        data: {},
      }),
    ).toThrow(ValidationError);
  });
});
