# nodecore-kit

**A modular backend SDK for Node.js services.**

Provides infrastructure helpers, utilities, and microservice building blocks in a clean, scalable, and framework-agnostic way.

[View on npm](https://www.npmjs.com/package/nodecore-kit)

---

## 📦 Features

### Infrastructure
- **Redis** — get/set/expire, scan, hash ops, auth cache helpers
- **SQS** — enqueue, long-poll dequeue, DLQ support, graceful stop
- **S3** — upload, download, stream, copy, signed URLs
- **Cron** — job scheduler with human-readable shorthands, overlap protection, per-job status tracking, and graceful shutdown
- **Mailer** — provider-agnostic email adapter with SMTP, Resend, and SendGrid support
- *(Future: Kafka, etc.)*

### HTTP Utilities
- `makeRequest` — typed, generic fetch wrapper with retry and timeout
- Pagination helpers

### Core Utilities
- `uuid` — binary/string conversion, generation, FIFO support, validation
- String utilities — `camelCase`, `snakeCase`, `kebabCase`, `pascalCase`, `truncate`, `maskString`, and more
- Validator utilities — `isEmail`, `isURL`, `isUUID`, `isEmpty`, `isNil`, and more
- Object utilities — `flattenObject`, `unflattenObject`
- Async utilities — `sleep`, `retry`, `timeout`, `debounce`, `throttle`, `memoize`, `once`

### Security
- **JWT** — encode, decode, inspect, expiry helpers via `jwtService`
- **Hashing** — bcrypt passwords, HMAC signing, SHA fingerprinting, secure token generation via `hashService`

### Validation
- `joiMiddleware` — Express middleware for body/params/query/headers/files
- `joiValidate` — inline validator with full type inference

### Logging
- `WinstonLogger` — structured logging, file transports, child loggers, pretty dev output
- Logger interface compatible with `console` or any custom logger

### Error Handling
- `ValidationError`
- `AuthenticationError`
- `NotFoundError`
- `ServerError`

---

## ⚡ Installation

```bash
npm install nodecore-kit
# or
yarn add nodecore-kit
```

---

## 🔌 Usage Examples

```ts
import {
  uuid,
  hashService,
  jwtService,
  joiMiddleware,
  joiValidate,
  makeRequest,
  retry,
  debounce,
  SQS,
  S3,
  Redis,
  Cron,
  Mailer,
  SmtpProvider,
  ResendProvider,
  SendGridProvider,
  WinstonLogger,
} from "nodecore-kit";
```

---

### UUID

```ts
// Generate
const id = uuid.get();        // v4 (default)
const id = uuid.get("v1");    // v1 time-based

// Binary conversion (optimised for MySQL storage)
const binary = uuid.toBinary("550e8400-e29b-41d4-a716-446655440000");
const str    = uuid.toString(binary);

// Bulk conversion on objects
const record = uuid.manyToString(dbRow, ["id", "userId"]);
const row    = uuid.manyToBinary(record, ["id", "userId"]);

// Validate
uuid.isValid("550e8400-e29b-41d4-a716-446655440000"); // true
```

---

### Hashing

```ts
// Passwords — bcrypt
const hashed = await hashService.hash("myPassword");
const match  = await hashService.compare("myPassword", hashed);

// Password reset / email verification tokens
const { token, hashed } = hashService.generateHashedToken();
await db.user.update({ resetToken: hashed });       // store hash
await email.send({ resetLink: `?token=${token}` }); // send raw token to user

// On reset — hash incoming token and compare
const incoming = hashService.sha256(req.body.token);
const isValid  = incoming === user.resetToken;

// Webhook signature verification
const sig   = hashService.hmac(payload, process.env.WEBHOOK_SECRET!);
const valid = hashService.verifyHmac(payload, secret, req.headers["x-signature"] as string);

// Content fingerprinting / cache keys (not for passwords)
const fingerprint = hashService.sha256("some content");
```

---

### JWT Service

```ts
// Encode
const token = await jwtService.encode({
  data: { userId: 123, role: "admin" },
  secretKey: process.env.JWT_SECRET!,
  expiresIn: "7d",
});

// Decode + verify
const payload = await jwtService.decode<{ userId: number }>({
  token,
  secretKey: process.env.JWT_SECRET!,
});

// Inspect without verifying (safe — never use for auth)
const claims = jwtService.inspect<{ userId: number }>(token);

// Expiry helpers
const expiry    = jwtService.getExpiry(token); // Date | null
const isExpired = jwtService.isExpired(token); // boolean

// Multi-service validation with issuer/audience
const token = await jwtService.encode({
  data: { userId: 1 },
  secretKey,
  issuer: "auth-service",
  audience: "api-service",
});
```

---

### Joi Validation

```ts
import Joi from "joi";

const createUserSchema = Joi.object({
  name:  Joi.string().required(),
  email: Joi.string().email().required(),
});

// As Express middleware
router.post(
  "/users",
  joiMiddleware({
    body:   { schema: createUserSchema },
    params: { schema: Joi.object({ id: Joi.string().uuid().required() }) },
    query:  { schema: paginationSchema, options: { allowUnknown: true } },
  }),
  createUser,
);

// Inline / direct validation
const dto = joiValidate<CreateUserDto>({
  schema: createUserSchema,
  data: req.body,
});
```

---

### HTTP Requests

```ts
// Simple GET
const user = await makeRequest<User>({ url: "/api/users/1" });

// POST with typed body
const post = await makeRequest<Post, CreatePostDto>({
  url: "/api/posts",
  method: "POST",
  data: { title: "Hello", body: "World" },
  token: "my-jwt-token",
});

// With retry + timeout
const data = await makeRequest<Data>({
  url: "/api/slow-endpoint",
  timeout: 5000,
  retries: 3,
});
```

---

### Async Utilities

```ts
// sleep
await sleep(1000);

// retry with exponential backoff
const data = await retry(
  () => fetchUser(id),
  { retries: 3, delay: 500, exponential: true, onError: (err, attempt) => logger.warn(`Attempt ${attempt} failed`, { err }) }
);

// timeout
const data = await timeout(fetchUser(id), 5000);

// debounce with cancel/flush
const search = debounce((query: string) => fetchResults(query), 300);
search("hello");
search.cancel();
search.flush("hello");

// throttle with trailing edge
const onScroll = throttle(() => updatePosition(), 100, { trailing: true });

// memoize (works with async functions too)
const getUser = memoize((id: number) => fetchUser(id));
await getUser(1); // fetches
await getUser(1); // returns cached — getUser.clear() to reset

// once — run exactly one time
const init = once(() => setupDatabase());
await init(); // runs
await init(); // returns cached result, does not run again
```

---

### String Utilities

```ts
capitalize("hello world")              // "Hello world"
camelCase("hello_world")               // "helloWorld"
pascalCase("hello_world")              // "HelloWorld"
snakeCase("helloWorld")                // "hello_world"
kebabCase("helloWorld")                // "hello-world"
splitWords("helloWorld")               // ["hello", "world"]
truncate("Hello, world!", 8)           // "Hello..."
truncate("Hello, world!", 8, " →")     // "Hello →"
maskString("4111111111111234")         // "************1234"
isBlank("   ")                         // true
reverse("hello")                       // "olleh"
countOccurrences("hello world", "l")   // 3
normalizeWhitespace("  hello   world") // "hello world"
```

---

### Validator Utilities

```ts
isEmail("user@example.com")   // true
isURL("https://example.com")  // true  (http/https only)
isUUID("550e8400-...")         // true
isObject({ a: 1 })            // true
isArray([1, 2, 3])            // true
isString("hello")             // true
isNumber(42)                  // true  (excludes NaN, Infinity)
isInteger(3)                  // true
isPositive(5)                 // true
isNegative(-1)                // true
isBoolean(false)              // true
isDate(new Date())            // true
isJSON('{"a":1}')             // true
isNil(null)                   // true
isEmpty([])                   // true
isEmpty({})                   // true
isEmpty("  ")                 // true
```

---

### Object Utilities

```ts
// Flatten
flattenObject({ a: { b: { c: 1 } } })
// → { "a.b.c": 1 }

flattenObject({ a: { b: 1 } }, { separator: "_" })
// → { "a_b": 1 }

// Unflatten
unflattenObject({ "a.b.c": 1 })
// → { a: { b: { c: 1 } } }
```

---

### Redis

```ts
const redis = new Redis("redis://localhost:6379");
await redis.start();

// Core ops
await redis.set("key", { foo: "bar" });
await redis.setEx("key", { foo: "bar" }, "1 hour");
const value = await redis.get<MyType>("key");
await redis.delete("key");
await redis.exists("key");
await redis.ttl("key");
await redis.expire("key", "30 minutes");

// Counters
await redis.increment("rate:user:123");           // 1, 2, 3...
await redis.increment("rate:user:123", "1 hour"); // sets TTL on first create
await redis.decrement("rate:user:123");

// Hash ops
await redis.hset("user:1", { name: "Alice", role: "admin" });
const name = await redis.hget("user:1", "name");
const all  = await redis.hgetAll<User>("user:1");
await redis.hdel("user:1", "role");

// Pattern ops (safe — uses SCAN not KEYS)
const keys    = await redis.scan("session:*");
const deleted = await redis.deleteByPattern("session:*");

// Auth cache helpers
await redis.cacheUser(user, "1 day");
const cached = await redis.getCachedUser(userId);
await redis.updateAuthData(userId, "permissions", "admin:write", "ADD");
await redis.updateAuthData(userId, "permissions", "admin:write", "REMOVE");

// Flush (throws in production unless forced)
await redis.flush();      // throws in production
await redis.flush(true);  // override
```

---

### SQS

```ts
const sqs = new SQS({
  region: "us-east-1",
  accessKeyId: process.env.AWS_KEY!,
  secretAccessKey: process.env.AWS_SECRET!,
});

// Enqueue
await sqs.enqueue({
  queueUrl: "https://sqs.us-east-1.amazonaws.com/1234/my-queue",
  message: { event: "user.created", userId: 1 },
});

// FIFO queue
await sqs.enqueue({
  queueUrl: "https://sqs.us-east-1.amazonaws.com/1234/my-queue.fifo",
  message: { event: "order.placed" },
  messageGroupId: "orders",
  messageDeduplicationId: uuid.get(),
});

// Dequeue (long-polls until stop() is called)
sqs.dequeue({
  queueUrl: "https://sqs.us-east-1.amazonaws.com/1234/my-queue",
  consumerFunction: async (message) => {
    await processMessage(message);
  },
  dlqUrl: "https://sqs.us-east-1.amazonaws.com/1234/my-dead-letter-queue",
  useRedrivePolicy: false,
});

// Graceful shutdown
process.on("SIGTERM", () => sqs.stop());
```

---

### S3

```ts
const s3 = new S3({
  region: "us-east-1",
  accessKeyId: process.env.AWS_KEY!,
  secretAccessKey: process.env.AWS_SECRET!,
  defaultBucket: "my-default-bucket",
});

// Upload — returns { bucket, key, url }
const result = await s3.upload({
  key: "avatars/user-1.png",
  body: buffer,
  contentType: "image/png",
  metadata: { uploadedBy: "user-1" },
});

// Download as Buffer
const buffer = await s3.download({ key: "avatars/user-1.png" });

// Stream (preferred for large files)
const stream = await s3.stream({ key: "videos/clip.mp4" });

// Copy within or across buckets
await s3.copy({
  sourceKey: "uploads/tmp.png",
  destinationKey: "avatars/user-1.png",
});

// Delete / exists
await s3.delete({ key: "avatars/user-1.png" });
const exists = await s3.exists({ key: "avatars/user-1.png" });

// Signed URLs
const downloadUrl = await s3.getSignedDownloadUrl({ key: "report.pdf", expiresIn: 3600 });
const uploadUrl   = await s3.getSignedUploadUrl({ key: "avatar.png", contentType: "image/png" });

// Bucket preset — great for scoping per feature
const avatars = s3.bucket("user-avatars");
await avatars.upload({ key: "user-1.png", body: buffer });
await avatars.getSignedDownloadUrl({ key: "user-1.png" });
```

---

### Cron

```ts
const cron = new Cron(logger); // logger is optional

// Register with human shorthand
cron.register({
  name: "send-digest",
  schedule: "every day at noon",
  timezone: "America/New_York",
  handler: async () => {
    await sendDigestEmails();
  },
});

// Register with raw cron expression
cron.register({
  name: "sync-inventory",
  schedule: "*/15 * * * *",
  handler: async () => { await syncInventory(); },
});

// Run immediately on registration
cron.register({
  name: "warm-cache",
  schedule: "every hour",
  runOnInit: true,
  handler: async () => { await warmCache(); },
});

// Manual trigger (e.g. from an admin endpoint)
await cron.run("send-digest");

// Stop / start individual jobs
cron.stop("sync-inventory");
cron.start("sync-inventory");

// Replace a job's schedule at runtime
cron.replace({ name: "send-digest", schedule: "every 30 minutes", handler });

// Introspect
cron.status("send-digest"); // { name, schedule, running, lastRun, executionCount, errorCount }
cron.statusAll();            // all jobs

// Graceful shutdown
process.on("SIGTERM", () => cron.stopAll());
```

Supported shorthands:

| Shorthand | Expression |
|---|---|
| `"every minute"` | `* * * * *` |
| `"every 5 minutes"` | `*/5 * * * *` |
| `"every 15 minutes"` | `*/15 * * * *` |
| `"every 30 minutes"` | `*/30 * * * *` |
| `"every hour"` | `0 * * * *` |
| `"every 6 hours"` | `0 */6 * * *` |
| `"every 12 hours"` | `0 */12 * * *` |
| `"every day"` | `0 0 * * *` |
| `"every day at noon"` | `0 12 * * *` |
| `"every week"` | `0 0 * * 0` |
| `"every month"` | `0 0 1 * *` |

---

### Mailer

```ts
// SMTP (Nodemailer)
const mailer = new Mailer(
  new SmtpProvider({
    host: "smtp.gmail.com",
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
    defaultFrom: "noreply@myapp.com",
  }),
  {},
  logger, // optional
);

// Resend
const mailer = new Mailer(
  new ResendProvider({
    apiKey: process.env.RESEND_KEY!,
    defaultFrom: "noreply@myapp.com",
  }),
);

// SendGrid
const mailer = new Mailer(
  new SendGridProvider({ apiKey: process.env.SENDGRID_KEY! }),
  { defaultFrom: "noreply@myapp.com" },
);

// Send
await mailer.send({
  to: "user@example.com",
  subject: "Welcome!",
  html: "<h1>Hello Alice</h1>",
  text: "Hello Alice", // plain text fallback
});

// Multiple recipients + attachments
await mailer.send({
  to: ["alice@example.com", "bob@example.com"],
  cc: "manager@example.com",
  subject: "Your invoice",
  html: "<p>Please find your invoice attached.</p>",
  attachments: [{ filename: "invoice.pdf", content: pdfBuffer, contentType: "application/pdf" }],
});

// Runtime provider swap (fallback)
try {
  await mailer.send(mail);
} catch {
  mailer.setProvider(new SendGridProvider({ apiKey: process.env.SENDGRID_KEY! }));
  await mailer.send(mail);
}

// Preview mode — logs instead of sending (auto-enabled in development)
const mailer = new Mailer(provider, { previewMode: true });
```

---

### Logger

```ts
const logger = new WinstonLogger({
  service: "auth-service",
  level: "debug",
  file: {
    path: "logs/combined.log",
    errorPath: "logs/error.log",
  },
});

logger.info("Server started", { port: 3000 });
logger.error("DB connection failed", err); // stack trace preserved

// Child logger — attach request context to all logs in scope
app.use((req, res, next) => {
  req.log = logger.child({ requestId: req.id, path: req.path });
  next();
});

req.log.info("Request received");
// → { requestId: "abc-123", path: "/users", message: "Request received" }

// Runtime level control
logger.setLevel("debug");
logger.isLevelEnabled("debug"); // true
```

---

## 🏗️ Architecture Principles

| Layer | Description |
|---|---|
| **Core** | Pure utilities, errors, and types. Independent from adapters or transports. |
| **Adapters** | External services (SQS, Redis, S3, Cron, Mailer). Depend only on core. |
| **Transport** | HTTP layers. May depend on core. |
| **Security** | JWT, hashing. Depends only on core. |
| **Logger** | Optional, adapter-friendly, injected as a dependency. |

> **No global environment reads inside adapters** — all configuration is passed via constructor.

---

## 🌱 Design Goals

- **Simplicity** — Easy to pick up and integrate into any project.
- **Modularity** — Pick and use only what you need.
- **Scalable** — Built for microservices and multi-service architectures.
- **Plug-n-Play** — Default logging works with `console`, but advanced logging can be injected.
- **Framework-Agnostic** — Works with Express, Fastify, NestJS, or bare Node.js.
- **Type-Safe** — Generics throughout so you get full TypeScript inference without casting.