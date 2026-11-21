import {
  SQSClient,
  SendMessageCommand,
  SendMessageCommandInput,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  GetQueueAttributesCommand,
  MessageAttributeValue,
  Message,
} from "@aws-sdk/client-sqs";

import { ServerError, ValidationError, parseJSON, defaultLogger, type Logger } from "../core/index.js";
import { awsClientConfig, type AwsConnectionConfig } from "./aws.js";

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface SqsConfig extends AwsConnectionConfig {
  /** Use an existing SQSClient instead of creating one */
  client?: SQSClient;
}

export interface SQSEnqueueOptions {
  queueUrl: string;
  message: string | object;
  /** Required for FIFO queues */
  messageGroupId?: string;
  /** Required for FIFO queues without content-based deduplication */
  messageDeduplicationId?: string;
  /** Delay before the message becomes visible (0–900 seconds) */
  delaySeconds?: number;
  /** Custom message attributes */
  attributes?: Record<string, MessageAttributeValue>;
}

/**
 * What happens to a message when `consumerFunction` throws:
 * - `"retry"` (default): leave it in the queue. It reappears after the
 *   visibility timeout; configure a redrive policy on the queue to move it
 *   to a DLQ after N attempts.
 * - `"dlq"`: send it to `dlqUrl`, then delete it. If sending fails, the
 *   message is kept (as with "retry").
 * - `"drop"`: delete it. The message is lost.
 */
export type SQSFailureMode = "retry" | "dlq" | "drop";

export interface SQSDequeueOptions {
  queueUrl: string;
  consumerFunction: (message: any, raw: Message) => Promise<void>;
  /** Failure handling (default: "dlq" when `dlqUrl` is set, otherwise "retry") */
  onFailure?: SQSFailureMode;
  /** Queue URL for `onFailure: "dlq"` */
  dlqUrl?: string;
  /** Messages per receive call, 1–10 (default: 10) */
  maxNumberOfMessages?: number;
  /** Long-poll wait, 0–20 seconds (default: 20) */
  waitTimeSeconds?: number;
  /**
   * How long received messages stay hidden from other consumers (seconds).
   * Should be longer than your consumer takes. Uses the queue's setting if unset.
   */
  visibilityTimeout?: number;
  /** @deprecated Failed messages are now kept by default. Same as `onFailure: "retry"`. */
  useRedrivePolicy?: boolean;
}

interface Poller {
  controller: AbortController;
  done: Promise<void>;
}

// ─── Class ────────────────────────────────────────────────────────────────────

export class SQS {
  private client: SQSClient;
  private logger: Logger;
  private pollers = new Map<string, Poller>();

  constructor(config: SqsConfig, logger?: Logger) {
    this.logger = logger ?? defaultLogger;
    this.client = config.client ?? new SQSClient(awsClientConfig(config, "SQS"));
    this.logger.debug?.("SQS client initialized", { region: config.region });
  }

  /** The underlying AWS SDK client, for operations this adapter doesn't wrap */
  get raw(): SQSClient {
    return this.client;
  }

  /** Whether `dequeue` is currently polling the given queue (or any queue) */
  isPolling(queueUrl?: string): boolean {
    return queueUrl ? this.pollers.has(queueUrl) : this.pollers.size > 0;
  }

  // ─── Health ────────────────────────────────────────────────────────────────

  /**
   * Reads the queue's attributes to confirm SQS is reachable and the
   * credentials can access the queue. Resolves with the approximate backlog.
   *
   * @example
   * createHealth({ checks: { orders: () => sqs.healthCheck(ORDERS_QUEUE_URL) } });
   */
  async healthCheck(queueUrl: string): Promise<{
    approximateMessages: number;
    approximateInFlight: number;
    polling: boolean;
  }> {
    if (!queueUrl) throw new ValidationError("SQS healthCheck requires a queueUrl");
    const { Attributes = {} } = await this.client.send(
      new GetQueueAttributesCommand({
        QueueUrl: queueUrl,
        AttributeNames: ["ApproximateNumberOfMessages", "ApproximateNumberOfMessagesNotVisible"],
      }),
    );
    return {
      approximateMessages: Number(Attributes.ApproximateNumberOfMessages ?? 0),
      approximateInFlight: Number(Attributes.ApproximateNumberOfMessagesNotVisible ?? 0),
      polling: this.pollers.has(queueUrl),
    };
  }

  // ─── Enqueue ───────────────────────────────────────────────────────────────

  /**
   * Sends a message to a queue. Objects are JSON-serialised.
   *
   * @example
   * await sqs.enqueue({ queueUrl, message: { orderId: 42 } });
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
      this.logger.debug?.("Message enqueued", { queueUrl });
      return true;
    } catch (err) {
      this.logger.error("SQSEnqueueError", { err, queueUrl });
      throw new ServerError("Failed to enqueue SQS message", { cause: err, queueUrl });
    }
  }

  // ─── Dequeue ───────────────────────────────────────────────────────────────

  /**
   * Long-polls a queue and passes each message to `consumerFunction`.
   * Messages are deleted only after the consumer succeeds.
   * Resolves once `stop()` is called and in-flight messages have finished.
   *
   * @example
   * sqs.dequeue({ queueUrl, consumerFunction: async (msg) => handle(msg) });
   *
   * process.on("SIGTERM", async () => {
   *   await sqs.stop(); // waits for in-flight messages
   * });
   */
  async dequeue(options: SQSDequeueOptions): Promise<void> {
    const { queueUrl, dlqUrl } = options;

    if (!queueUrl) throw new ValidationError("SQS queueUrl is required");
    if (this.pollers.has(queueUrl)) {
      throw new ValidationError(`SQS queue is already being polled: ${queueUrl}`);
    }

    const onFailure: SQSFailureMode =
      options.onFailure ?? (dlqUrl ? "dlq" : "retry");

    if (onFailure === "dlq" && !dlqUrl) {
      throw new ValidationError('SQS onFailure "dlq" requires dlqUrl');
    }

    const controller = new AbortController();
    const done = this.poll({ ...options, onFailure }, controller.signal).finally(() => {
      this.pollers.delete(queueUrl);
    });

    this.pollers.set(queueUrl, { controller, done });
    return done;
  }

  /**
   * Stops polling one queue, or all queues when no URL is given.
   * Interrupts the current long poll and resolves when in-flight messages
   * have finished processing.
   */
  async stop(queueUrl?: string): Promise<void> {
    const targets = queueUrl
      ? [this.pollers.get(queueUrl)].filter((p): p is Poller => Boolean(p))
      : [...this.pollers.values()];

    this.logger.info("SQS stop requested", { queueUrl: queueUrl ?? "all" });
    for (const poller of targets) poller.controller.abort();
    await Promise.allSettled(targets.map((p) => p.done));
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private async poll(
    options: SQSDequeueOptions & { onFailure: SQSFailureMode },
    signal: AbortSignal,
  ): Promise<void> {
    const {
      queueUrl,
      maxNumberOfMessages = 10,
      waitTimeSeconds = 20,
      visibilityTimeout,
    } = options;

    let consecutiveErrors = 0;
    this.logger.info("SQS polling started", { queueUrl, onFailure: options.onFailure });

    while (!signal.aborted) {
      try {
        const { Messages } = await this.client.send(
          new ReceiveMessageCommand({
            QueueUrl: queueUrl,
            MaxNumberOfMessages: maxNumberOfMessages,
            WaitTimeSeconds: waitTimeSeconds,
            ...(visibilityTimeout !== undefined && { VisibilityTimeout: visibilityTimeout }),
          }),
          { abortSignal: signal },
        );

        consecutiveErrors = 0;
        if (!Messages?.length) continue;

        // Messages already received are processed even if stop() is called meanwhile
        await Promise.allSettled(Messages.map((m) => this.processMessage(m, options)));
      } catch (err) {
        if (signal.aborted) break;

        consecutiveErrors++;
        this.logger.error("SQSPollingError", { err, queueUrl, consecutiveErrors });

        // Exponential backoff on persistent polling errors (max 30s)
        const backoff = Math.min(1000 * 2 ** consecutiveErrors, 30_000);
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, backoff);
          signal.addEventListener("abort", () => {
            clearTimeout(timer);
            resolve();
          }, { once: true });
        });
      }
    }

    this.logger.info("SQS polling stopped", { queueUrl });
  }

  private async processMessage(
    raw: Message,
    options: SQSDequeueOptions & { onFailure: SQSFailureMode },
  ): Promise<void> {
    const { queueUrl, dlqUrl, onFailure, consumerFunction } = options;
    const { Body, ReceiptHandle, MessageId } = raw;
    if (Body === undefined || !ReceiptHandle) return;

    let shouldDelete = true;

    try {
      await consumerFunction(parseJSON(Body), raw);
    } catch (err) {
      this.logger.error("SQSConsumerError", { err, queueUrl, messageId: MessageId, onFailure });

      if (onFailure === "retry") {
        shouldDelete = false;
      } else if (onFailure === "dlq") {
        try {
          await this.enqueue({ queueUrl: dlqUrl!, message: Body });
        } catch (dlqErr) {
          // Keep the message rather than lose it
          shouldDelete = false;
          this.logger.error("SQSDeadLetterError — message kept in source queue", {
            err: dlqErr,
            queueUrl,
            dlqUrl,
            messageId: MessageId,
          });
        }
      } else {
        this.logger.warn("SQSMessageDropped", { queueUrl, messageId: MessageId });
      }
    }

    if (!shouldDelete) return;

    try {
      await this.client.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle }));
    } catch (err) {
      // The message will reappear after the visibility timeout and be processed again
      this.logger.error("SQSDeleteError", { err, queueUrl, messageId: MessageId });
    }
  }
}
