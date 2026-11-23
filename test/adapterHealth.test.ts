import { GetQueueAttributesCommand, SQSClient } from "@aws-sdk/client-sqs";
import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { Redis } from "../src/adapters/redis";
import { SQS } from "../src/adapters/sqs";
import { S3 } from "../src/adapters/s3";
import { Cron } from "../src/adapters/cron";
import { Mailer, type MailProvider } from "../src/adapters/mailers";
import { createHealth } from "../src/core/health";
import { noopLogger } from "../src/core/logger";

/** Minimal stand-in for an ioredis client */
const fakeRedisClient = (ping: () => Promise<string>, status = "ready") =>
  Object.assign(new EventEmitter(), { ping, status }) as any;

describe("Redis.healthCheck", () => {
  it("is up when PING answers PONG", async () => {
    const redis = new Redis(fakeRedisClient(async () => "PONG"), {}, noopLogger);
    await expect(redis.healthCheck()).resolves.toEqual({ connection: "ready" });
  });

  it("throws when PING fails", async () => {
    const redis = new Redis(fakeRedisClient(() => Promise.reject(new Error("ECONNREFUSED"))), {}, noopLogger);
    await expect(redis.healthCheck()).rejects.toThrow("ECONNREFUSED");
  });

  it("throws when the connection was closed", async () => {
    const redis = new Redis(fakeRedisClient(async () => "PONG", "end"), {}, noopLogger);
    await expect(redis.healthCheck()).rejects.toThrow("closed");
  });

  it("works directly as a createHealth check", async () => {
    const redis = new Redis(fakeRedisClient(async () => "PONG"), {}, noopLogger);
    const report = await createHealth({ checks: { redis } }).readiness();
    expect(report.checks.redis).toMatchObject({ status: "up", details: { connection: "ready" } });
  });
});

describe("SQS.healthCheck", () => {
  it("returns the queue backlog", async () => {
    const send = vi.fn(async (cmd: any) => {
      expect(cmd).toBeInstanceOf(GetQueueAttributesCommand);
      return { Attributes: { ApproximateNumberOfMessages: "12", ApproximateNumberOfMessagesNotVisible: "3" } };
    });
    const sqs = new SQS({ region: "us-east-1", client: { send } as unknown as SQSClient }, noopLogger);
    await expect(sqs.healthCheck("q")).resolves.toEqual({
      approximateMessages: 12,
      approximateInFlight: 3,
      polling: false,
    });
  });

  it("throws when SQS is unreachable", async () => {
    const send = vi.fn(async () => {
      throw new Error("AccessDenied");
    });
    const sqs = new SQS({ region: "us-east-1", client: { send } as unknown as SQSClient }, noopLogger);
    await expect(sqs.healthCheck("q")).rejects.toThrow("AccessDenied");
  });
});

describe("S3.healthCheck", () => {
  it("sends HeadBucket for the default bucket", async () => {
    const send = vi.fn(async (cmd: any) => {
      expect(cmd).toBeInstanceOf(HeadBucketCommand);
      expect(cmd.input.Bucket).toBe("uploads");
      return {};
    });
    const s3 = new S3(
      { region: "us-east-1", defaultBucket: "uploads", client: { send } as unknown as S3Client },
      noopLogger,
    );
    await expect(s3.healthCheck()).resolves.toEqual({ bucket: "uploads" });
  });
});

describe("Cron", () => {
  it("stopAll() waits for runs in progress", async () => {
    const cron = new Cron(noopLogger);
    let finished = false;
    cron.register({
      name: "slow",
      schedule: "every hour",
      handler: () => new Promise<void>((r) => setTimeout(() => ((finished = true), r()), 100)),
    });

    void cron.run("slow");
    await cron.stopAll();
    expect(finished).toBe(true);
  });

  it("healthCheck lists jobs whose last run failed", async () => {
    const cron = new Cron(noopLogger);
    cron.register({ name: "ok", schedule: "every hour", handler: async () => {} });
    cron.register({
      name: "broken",
      schedule: "every hour",
      handler: async () => {
        throw new Error("x");
      },
    });
    await cron.run("ok");
    await cron.run("broken");

    await expect(cron.healthCheck()).resolves.toEqual({ jobs: 2, executing: 0, failing: ["broken"] });
    await cron.stopAll();
  });
});

describe("Mailer", () => {
  const provider = (extra: Partial<MailProvider> = {}): MailProvider => ({
    name: "test",
    send: async () => ({ success: true, provider: "test" }),
    ...extra,
  });

  it("verifies providers that support it", async () => {
    const verify = vi.fn(async () => {});
    const mailer = new Mailer(provider({ verify }), { previewMode: false }, noopLogger);
    await expect(mailer.healthCheck()).resolves.toEqual({ provider: "test", verified: true });
    expect(verify).toHaveBeenCalled();
  });

  it("reports unverified providers as up", async () => {
    const mailer = new Mailer(provider(), { previewMode: false }, noopLogger);
    await expect(mailer.healthCheck()).resolves.toEqual({ provider: "test", verified: false });
  });

  it("close() closes the provider", async () => {
    const close = vi.fn();
    const mailer = new Mailer(provider({ close }), { previewMode: false }, noopLogger);
    await mailer.close();
    expect(close).toHaveBeenCalled();
  });
});
