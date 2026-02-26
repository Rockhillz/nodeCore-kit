import AWS from "aws-sdk";
import { Logger } from "./types.js";
import { ServerError, parseJSON } from "../core";
import { SQSDequeueInt, SQSEqueueInt } from "./types.js";

export interface SqsConfig {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export class SQS {
  private client: AWS.SQS;
  private logger: Logger;

  constructor(config: SqsConfig, logger?: Logger) {
    // Fallback to console if no logger is provided
    this.logger = logger || {
      info: (msg, meta?) => console.info(msg, meta),
      error: (msg, meta?) => console.error(msg, meta),
      warn: (msg, meta?) => console.warn(msg, meta),
      debug: (msg, meta?) => console.debug(msg, meta),
    };

    // Initialize AWS client
    this.client = new AWS.SQS({
      region: config.region,
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    });

    this.logger.info("SQS client initialized", { region: config.region });
  }

  async enqueue({ queueUrl, message }: SQSEqueueInt): Promise<boolean> {
    try {
      await this.client
        .sendMessage({
          QueueUrl: queueUrl,
          MessageBody: typeof message === "string" ? message : JSON.stringify(message),
        })
        .promise();

      this.logger.info("Message enqueued", { queueUrl });
      return true;
    } catch (err) {
      this.logger.error("SQSEnqueueError", { err, queueUrl });
      throw new ServerError("Failed to enqueue SQS message", { cause: err });
    }
  }

  async dequeue(fields: SQSDequeueInt): Promise<void> {
    const {
      queueUrl,
      consumerFunction,
      dlqUrl,
      maxNumberOfMessages = 10,
      waitTimeSeconds = 20,
    } = fields;

    while (true) {
      try {
        const { Messages } = await this.client
          .receiveMessage({
            QueueUrl: queueUrl,
            MaxNumberOfMessages: maxNumberOfMessages,
            WaitTimeSeconds: waitTimeSeconds,
          })
          .promise();

        if (Messages?.length) {
          for (const { Body, ReceiptHandle } of Messages) {
            if (!Body || !ReceiptHandle) continue;

            try {
              const message = parseJSON(Body);
              await consumerFunction(message);
            } catch (err) {
              this.logger.error("SQSConsumerError", { err, queueUrl });

              if (dlqUrl) {
                await this.enqueue({ queueUrl: dlqUrl, message: Body });
              }
            } finally {
              await this.client
                .deleteMessage({
                  QueueUrl: queueUrl,
                  ReceiptHandle,
                })
                .promise();
            }
          }
        }
      } catch (err) {
        this.logger.error("SQSPollingError", { err, queueUrl });
      }
    }
  }
}