import {
  SQSClient,
  SendMessageCommand,
  SendMessageCommandInput,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  ChangeMessageVisibilityCommand,
  MessageAttributeValue,
} from "@aws-sdk/client-sqs";

import { Logger } from "./types.js";
import { ServerError, parseJSON } from "../core/index.js";

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface SqsConfig {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export interface SQSEnqueueOptions {
  queueUrl: string;
  message: string | object;
  /** Required for FIFO queues */
  messageGroupId?: string;
  /** Required for FIFO queues with content-based deduplication disabled */
  messageDeduplicationId?: string;
  /** Delay message delivery (0–900 seconds) */
  delaySeconds?: number;
  /** Arbitrary metadata attached to the message */
  attributes?: Record<string, MessageAttributeValue>;
}

export interface SQSDequeueOptions {
  queueUrl: string;
  consumerFunction: (message: any) => Promise<void>;
  dlqUrl?: string;
  maxNumberOfMessages?: number;
  waitTimeSeconds?: number;
  /**
   * Extend visibility timeout during processing (seconds).
   * Set this close to your expected max processing time.
   */
  visibilityTimeout?: number;
  /**
   * If true, failed messages are left in the queue for SQS to retry
   * via the queue's own redrive policy instead of immediately going to DLQ.
   */
  useRedrivePolicy?: boolean;
}

// ─── Default Logger ───────────────────────────────────────────────────────────

const defaultLogger: Logger = {
  info: (msg, meta?) => console.info(msg, meta),
  error: (msg, meta?) => console.error(msg, meta),
  warn: (msg, meta?) => console.warn(msg, meta),
  debug: (msg, meta?) => console.debug(msg, meta),
};

// ─── Class ────────────────────────────────────────────────────────────────────

export class SQS {
  private client: SQSClient;
  private logger: Logger;
  private polling = false;

  constructor(config: SqsConfig, logger?: Logger) {
    this.logger = logger ?? defaultLogger;
    this.client = new SQSClient({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });

    this.logger.info("SQS client initialized", { region: config.region });
  }

  // ─── Enqueue ───────────────────────────────────────────────────────────────

  /**
   * Sends a message to an SQS queue.
   * Automatically serializes objects to JSON.
   *
   * @example
   * await sqs.enqueue({ queueUrl, message: { event: "user.created", userId: 1 } });
   */
  async enqueue({
    queueUrl,
    message,
    messageGroupId,
    messageDeduplicationId,
    delaySeconds,
    attributes,
  }: SQSEnqueueOptions): Promise<boolean> {
    try {
      const input: SendMessageCommandInput = {
        QueueUrl: queueUrl,
        MessageBody: typeof message === "string" ? message : JSON.stringify(message),
        ...(messageGroupId && { MessageGroupId: messageGroupId }),
        ...(messageDeduplicationId && { MessageDeduplicationId: messageDeduplicationId }),
        ...(delaySeconds !== undefined && { DelaySeconds: delaySeconds }),
        ...(attributes && { MessageAttributes: attributes }),
      };

      await this.client.send(new SendMessageCommand(input));
      this.logger.info("Message enqueued", { queueUrl });
      return true;
    } catch (err) {
      this.logger.error("SQSEnqueueError", { err, queueUrl });
      throw new ServerError("Failed to enqueue SQS message", { cause: err });
    }
  }

  // ─── Dequeue ───────────────────────────────────────────────────────────────

  /**
   * Starts long-polling a queue and passes each message to `consumerFunction`.
   * Runs until `stop()` is called.
   *
   * Delete behaviour:
   * - On success → always deletes
   * - On failure + DLQ → moves to DLQ, then deletes
   * - On failure + useRedrivePolicy → does NOT delete (lets SQS retry)
   * - On failure + no DLQ + no redrive → logs and deletes to avoid poison pill loop
   */
  async dequeue({
    queueUrl,
    consumerFunction,
    dlqUrl,
    maxNumberOfMessages = 10,
    waitTimeSeconds = 20,
    visibilityTimeout,
    useRedrivePolicy = false,
  }: SQSDequeueOptions): Promise<void> {
    this.polling = true;
    let consecutiveErrors = 0;

    this.logger.info("SQS polling started", { queueUrl });

    while (this.polling) {
      try {
        const { Messages } = await this.client.send(
          new ReceiveMessageCommand({
            QueueUrl: queueUrl,
            MaxNumberOfMessages: maxNumberOfMessages,
            WaitTimeSeconds: waitTimeSeconds,
            ...(visibilityTimeout && { VisibilityTimeout: visibilityTimeout }),
          }),
        );

        consecutiveErrors = 0;

        if (!Messages?.length) continue;

        await Promise.allSettled(
          Messages.map(({ Body, ReceiptHandle }) =>
            this.processMessage({
              Body,
              ReceiptHandle,
              queueUrl,
              dlqUrl,
              useRedrivePolicy,
              consumerFunction,
            }),
          ),
        );
      } catch (err) {
        consecutiveErrors++;
        this.logger.error("SQSPollingError", { err, queueUrl, consecutiveErrors });

        // Exponential backoff on persistent polling errors (max 30s)
        const backoff = Math.min(1000 * 2 ** consecutiveErrors, 30_000);
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }
    }

    this.logger.info("SQS polling stopped", { queueUrl });
  }

  /**
   * Gracefully stops the polling loop after the current batch completes.
   */
  stop(): void {
    this.polling = false;
    this.logger.info("SQS stop signal received");
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private async processMessage({
    Body,
    ReceiptHandle,
    queueUrl,
    dlqUrl,
    useRedrivePolicy,
    consumerFunction,
  }: {
    Body?: string;
    ReceiptHandle?: string;
    queueUrl: string;
    dlqUrl?: string;
    useRedrivePolicy: boolean;
    consumerFunction: (msg: any) => Promise<void>;
  }): Promise<void> {
    if (!Body || !ReceiptHandle) return;

    let shouldDelete = true;

    try {
      const message = parseJSON(Body);
      await consumerFunction(message);
    } catch (err) {
      this.logger.error("SQSConsumerError", { err, queueUrl });

      if (dlqUrl) {
        await this.enqueue({ queueUrl: dlqUrl, message: Body });
      } else if (useRedrivePolicy) {
        // Leave in queue — SQS redrive policy will handle retries and DLQ routing
        shouldDelete = false;
      } else {
        this.logger.warn("SQSMessageDropped — no DLQ or redrive configured", { queueUrl });
      }
    } finally {
      if (shouldDelete) {
        await this.client.send(
          new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle }),
        );
      }
    }
  }
}