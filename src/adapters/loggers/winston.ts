import winston from "winston"
import { Logger } from "../types.js"

export class WinstonLogger implements Logger {
  private logger = winston.createLogger({
    transports: [new winston.transports.Console()]
  })

  info(message: string, meta?: unknown) {
    this.logger.info(message, meta)
  }

  error(message: string, meta?: unknown) {
    this.logger.error(message, meta)
  }

  warn(message: string, meta?: unknown) {
    this.logger.warn(message, meta)
  }

  debug(message: string, meta?: unknown) {
    this.logger.debug(message, meta)
  }
}