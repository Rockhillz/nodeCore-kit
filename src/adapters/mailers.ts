import nodemailer, { Transporter, TransportOptions } from "nodemailer";
import { Logger } from "./types.js";
import { ValidationError, ServerError } from "../core/index.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

export interface SendMailOptions {
  to: string | string[];
  subject: string;
  /** Plain text fallback — always recommended alongside html */
  text?: string;
  html?: string;
  from?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  attachments?: MailAttachment[];
}

export interface MailResult {
  success: boolean;
  messageId?: string;
  provider: string;
}

export interface MailProvider {
  send(mail: SendMailOptions): Promise<MailResult>;
  readonly name: string;
}

// ─── Nodemailer (SMTP) ────────────────────────────────────────────────────────

export interface SmtpConfig {
  host: string;
  port?: number;
  secure?: boolean;
  auth: {
    user: string;
    pass: string;
  };
  /** Default from address used when `from` is not specified in send() */
  defaultFrom?: string;
}

export class SmtpProvider implements MailProvider {
  readonly name = "smtp";
  private transporter: Transporter;
  private defaultFrom?: string;

  constructor(config: SmtpConfig) {
    if (!config.host) throw new ValidationError("SMTP host is required");
    if (!config.auth?.user || !config.auth?.pass) {
      throw new ValidationError("SMTP auth credentials are required");
    }

    this.defaultFrom = config.defaultFrom;
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port ?? 587,
      secure: config.secure ?? false,
      auth: config.auth,
    } as TransportOptions);
  }

  async send(mail: SendMailOptions): Promise<MailResult> {
    const result = await this.transporter.sendMail({
      from: mail.from ?? this.defaultFrom,
      to: mail.to,
      cc: mail.cc,
      bcc: mail.bcc,
      replyTo: mail.replyTo,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      attachments: mail.attachments,
    });

    return { success: true, messageId: result.messageId, provider: this.name };
  }
}

// ─── Resend ───────────────────────────────────────────────────────────────────

export interface ResendConfig {
  apiKey: string;
  defaultFrom?: string;
}

export class ResendProvider implements MailProvider {
  readonly name = "resend";
  private apiKey: string;
  private defaultFrom?: string;

  constructor(config: ResendConfig) {
    if (!config.apiKey) throw new ValidationError("Resend API key is required");
    this.apiKey = config.apiKey;
    this.defaultFrom = config.defaultFrom;
  }

  async send(mail: SendMailOptions): Promise<MailResult> {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: mail.from ?? this.defaultFrom,
        to: Array.isArray(mail.to) ? mail.to : [mail.to],
        cc: mail.cc,
        bcc: mail.bcc,
        reply_to: mail.replyTo,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        attachments: mail.attachments?.map((a) => ({
          filename: a.filename,
          content: Buffer.isBuffer(a.content)
            ? a.content.toString("base64")
            : a.content,
        })),
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new ServerError(`Resend error: ${error.message}`, { cause: error });
    }

    const data = await response.json();
    return { success: true, messageId: data.id, provider: this.name };
  }
}

// ─── SendGrid ─────────────────────────────────────────────────────────────────

export interface SendGridConfig {
  apiKey: string;
  defaultFrom?: string;
}

export class SendGridProvider implements MailProvider {
  readonly name = "sendgrid";
  private apiKey: string;
  private defaultFrom?: string;

  constructor(config: SendGridConfig) {
    if (!config.apiKey) throw new ValidationError("SendGrid API key is required");
    this.apiKey = config.apiKey;
    this.defaultFrom = config.defaultFrom;
  }

  async send(mail: SendMailOptions): Promise<MailResult> {
    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{
          to: (Array.isArray(mail.to) ? mail.to : [mail.to]).map((email) => ({ email })),
          ...(mail.cc && { cc: (Array.isArray(mail.cc) ? mail.cc : [mail.cc]).map((email) => ({ email })) }),
          ...(mail.bcc && { bcc: (Array.isArray(mail.bcc) ? mail.bcc : [mail.bcc]).map((email) => ({ email })) }),
        }],
        from: { email: mail.from ?? this.defaultFrom },
        reply_to: mail.replyTo ? { email: mail.replyTo } : undefined,
        subject: mail.subject,
        content: [
          ...(mail.text ? [{ type: "text/plain", value: mail.text }] : []),
          ...(mail.html ? [{ type: "text/html",  value: mail.html }] : []),
        ],
        attachments: mail.attachments?.map((a) => ({
          filename: a.filename,
          content: Buffer.isBuffer(a.content)
            ? a.content.toString("base64")
            : Buffer.from(a.content).toString("base64"),
          type: a.contentType,
        })),
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new ServerError(`SendGrid error`, { cause: error });
    }

    const messageId = response.headers.get("x-message-id") ?? undefined;
    return { success: true, messageId, provider: this.name };
  }
}

// ─── Default Logger ───────────────────────────────────────────────────────────

const defaultLogger: Logger = {
  info:  (msg, meta?) => console.info(msg, meta),
  error: (msg, meta?) => console.error(msg, meta),
  warn:  (msg, meta?) => console.warn(msg, meta),
  debug: (msg, meta?) => console.debug(msg, meta),
};

// ─── Mailer ───────────────────────────────────────────────────────────────────

export interface MailerOptions {
  /** Default from address for all sends */
  defaultFrom?: string;
  /** If true, logs mail details instead of sending. Useful for development */
  previewMode?: boolean;
}

export class Mailer {
  private provider: MailProvider;
  private logger: Logger;
  private defaultFrom?: string;
  private previewMode: boolean;

  constructor(provider: MailProvider, options: MailerOptions = {}, logger?: Logger) {
    if (!provider) throw new ValidationError("A mail provider is required");

    this.provider   = provider;
    this.logger     = logger ?? defaultLogger;
    this.defaultFrom = options.defaultFrom;
    this.previewMode = options.previewMode ?? process.env.NODE_ENV === "development";

    this.logger.info("Mailer initialized", {
      provider: provider.name,
      previewMode: this.previewMode,
    });
  }

  /**
   * Sends an email via the configured provider.
   *
   * @example
   * await mailer.send({
   *   to: "user@example.com",
   *   subject: "Welcome!",
   *   html: "<h1>Hello</h1>",
   * });
   */
  async send(mail: SendMailOptions): Promise<MailResult> {
    const resolved: SendMailOptions = {
      ...mail,
      from: mail.from ?? this.defaultFrom,
    };

    if (!resolved.to) throw new ValidationError("Mail recipient (to) is required");
    if (!resolved.subject) throw new ValidationError("Mail subject is required");
    if (!resolved.html && !resolved.text) {
      throw new ValidationError("Mail must have either html or text content");
    }
    if (!resolved.from) {
      throw new ValidationError("Mail sender (from) is required — set it on send() or as defaultFrom on Mailer");
    }

    if (this.previewMode) {
      this.logger.info("Mailer [preview mode] — mail not sent", {
        to: resolved.to,
        subject: resolved.subject,
        from: resolved.from,
      });
      return { success: true, provider: "preview" };
    }

    try {
      const result = await this.provider.send(resolved);
      this.logger.info("Mail sent", {
        provider: result.provider,
        to: resolved.to,
        subject: resolved.subject,
        messageId: result.messageId,
      });
      return result;
    } catch (err) {
      this.logger.error("Mail send failed", { err, to: resolved.to, subject: resolved.subject });
      throw new ServerError("Failed to send mail", { cause: err });
    }
  }

  /**
   * Swaps the active provider at runtime.
   * Useful for fallback logic — switch to SendGrid if Resend fails.
   *
   * @example
   * mailer.setProvider(new SendGridProvider({ apiKey: "..." }));
   */
  setProvider(provider: MailProvider): void {
    this.provider = provider;
    this.logger.info("Mailer provider swapped", { provider: provider.name });
  }
}