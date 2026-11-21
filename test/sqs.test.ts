import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import { describe, expect, it, vi } from "vitest";
import { SQS } from "../src/adapters/sqs";
import { ValidationError } from "../src/core/error";
import { noopLogger } from "../src/core/logger";

/**
 * Fake SQSClient: hands out the given messages once, then long-polls
 * (waits until aborted), like a real empty queue.
 */
const fakeClient = (
  messages: Array<{ Body: string; ReceiptHandle: string; MessageId?: string }>,
  { failSend = false }: { failSend?: boolean } = {},
) => {
  let delivered = false;
  const sent: any[] = [];
  const deleted: string[] = [];

  const send = vi.fn(async (command: any, opts?: { abortSignal?: AbortSignal }) => {
    if (command instanceof ReceiveMessageCommand) {
      if (!delivered) {
        delivered = true;
        return { Messages: messages };
      }
      await new Promise((_, reject) => {
        opts?.abortSignal?.addEventListener("abort", () => reject(new Error("aborted")), {
          once: true,
        });
      });
    }
    if (command instanceof SendMessageCommand) {
      if (failSend) throw new Error("DLQ unavailable");
      sent.push(command.input);
      return {};
    }
    if (command instanceof DeleteMessageCommand) {
      deleted.push(command.input.ReceiptHandle!);
      return {};
    }
    return {};
  });

  return { client: { send } as unknown as SQSClient, sent, deleted, send };
};

const runUntilProcessed = async (sqs: SQS, options: Parameters<SQS["dequeue"]>[0]) => {
  const done = sqs.dequeue(options);
  await vi.waitFor(() => {
    // the second receive call means the first batch is fully processed
    const send = (sqs.raw as any).send;
    expect(send.mock.calls.filter(([c]: any) => c instanceof ReceiveMessageCommand).length).toBe(2);
  });
  await sqs.stop();
  await done;
};

const config = (client: SQSClient) => ({ region: "us-east-1", client });

describe("SQS", () => {
  it("deletes messages after the consumer succeeds", async () => {
    const fake = fakeClient([{ Body: '{"id":1}', ReceiptHandle: "r1" }]);
    const sqs = new SQS(config(fake.client), noopLogger);
    const consumer = vi.fn(async () => {});

    await runUntilProcessed(sqs, { queueUrl: "q", consumerFunction: consumer });

    expect(consumer).toHaveBeenCalledWith({ id: 1 }, expect.objectContaining({ ReceiptHandle: "r1" }));
    expect(fake.deleted).toEqual(["r1"]);
  });

  it("keeps failed messages by default (no data loss)", async () => {
    const fake = fakeClient([{ Body: "x", ReceiptHandle: "r1" }]);
    const sqs = new SQS(config(fake.client), noopLogger);

    await runUntilProcessed(sqs, {
      queueUrl: "q",
      consumerFunction: async () => {
        throw new Error("boom");
      },
    });

    expect(fake.deleted).toEqual([]);
  });

  it("moves failed messages to the DLQ, then deletes them", async () => {
    const fake = fakeClient([{ Body: "x", ReceiptHandle: "r1" }]);
    const sqs = new SQS(config(fake.client), noopLogger);

    await runUntilProcessed(sqs, {
      queueUrl: "q",
      dlqUrl: "dlq",
      consumerFunction: async () => {
        throw new Error("boom");
      },
    });

    expect(fake.sent).toEqual([expect.objectContaining({ QueueUrl: "dlq", MessageBody: "x" })]);
    expect(fake.deleted).toEqual(["r1"]);
  });

  it("keeps the message when sending to the DLQ fails", async () => {
    const fake = fakeClient([{ Body: "x", ReceiptHandle: "r1" }], { failSend: true });
    const sqs = new SQS(config(fake.client), noopLogger);

    await runUntilProcessed(sqs, {
      queueUrl: "q",
      dlqUrl: "dlq",
      consumerFunction: async () => {
        throw new Error("boom");
      },
    });

    expect(fake.deleted).toEqual([]);
  });

  it("drops failed messages only when asked", async () => {
    const fake = fakeClient([{ Body: "x", ReceiptHandle: "r1" }]);
    const sqs = new SQS(config(fake.client), noopLogger);

    await runUntilProcessed(sqs, {
      queueUrl: "q",
      onFailure: "drop",
      consumerFunction: async () => {
        throw new Error("boom");
      },
    });

    expect(fake.deleted).toEqual(["r1"]);
  });

  it("stop() interrupts the long poll and resolves dequeue()", async () => {
    const fake = fakeClient([]);
    const sqs = new SQS(config(fake.client), noopLogger);
    const done = sqs.dequeue({ queueUrl: "q", consumerFunction: async () => {} });

    await vi.waitFor(() => expect(fake.send).toHaveBeenCalled());
    expect(sqs.isPolling("q")).toBe(true);

    await sqs.stop();
    await expect(done).resolves.toBeUndefined();
    expect(sqs.isPolling()).toBe(false);
  });

  it("rejects polling the same queue twice and dlq mode without a URL", async () => {
    const fake = fakeClient([]);
    const sqs = new SQS(config(fake.client), noopLogger);
    const done = sqs.dequeue({ queueUrl: "q", consumerFunction: async () => {} });

    await expect(sqs.dequeue({ queueUrl: "q", consumerFunction: async () => {} })).rejects.toThrow(
      ValidationError,
    );
    await expect(
      sqs.dequeue({ queueUrl: "other", onFailure: "dlq", consumerFunction: async () => {} }),
    ).rejects.toThrow(ValidationError);

    await sqs.stop();
    await done;
  });

  it("works without static credentials", () => {
    expect(() => new SQS({ region: "us-east-1" }, noopLogger)).not.toThrow();
  });

  it("rejects half-configured credentials", () => {
    expect(() => new SQS({ region: "us-east-1", accessKeyId: "AKIA" }, noopLogger)).toThrow(
      ValidationError,
    );
  });
});
