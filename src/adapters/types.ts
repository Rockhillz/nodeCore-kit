export interface SQSDequeueInt {
  queueUrl: string;
  consumerFunction: (message: any) => Promise<any>;
  maxNumberOfMessages?: number;
  waitTimeSeconds?: number;
  dlqUrl?: string;
}

export interface SQSEqueueInt {
  queueUrl: string;
  message: any;
}

export type { Logger } from "../core/logger.js";
