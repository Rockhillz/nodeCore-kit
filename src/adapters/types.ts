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

export interface Logger {
  info(message: string, meta?: unknown): void
  error(message: string, meta?: unknown): void
  warn(message: string, meta?: unknown): void
  debug?(message: string, meta?: unknown): void
}