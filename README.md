# nodeCore-kit

**A modular backend SDK for Node.js services.**

Provides infrastructure helpers, utilities, and microservice building blocks in a clean, scalable, and framework-agnostic way.

---

## 📦 Features

### Infrastructure Helpers
- Redis wrapper
- SQS wrapper
- *(Future: Kafka, etc.)*

### HTTP Utilities
- `getContent`, `postContent` — typed fetch wrappers
- Pagination helpers

### Core Utilities
- `uuid` — binary/string conversion, generation, and validation
- JSON parse/stringify helpers
- `joiValidator` for request validation
- `sleep`, `formatDate`, and more

### Security
- JWT encode/decode services

### Logging
- Optional logger injection
- Compatible with `console` or structured loggers like Winston

### Error Handling
- `ValidationError`
- `ServerError`
- `NotFoundError`

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
  joiValidator,
  paginate,
  SQS,
  SqsConfig,
  WinstonLogger,
  jwtService,
} from "nodecore-kit";
```

### UUID

```ts
const id = uuid.get("v4");
```

### Joi Validator

```ts
const schema = {
  schema: { name: Joi.string().required() },
  data: { name: "Alice" },
};

joiValidator(schema, false);
```

### Pagination

```ts
const { pageCount, offset } = paginate(100, 2, 10);
```

### SQS Adapter

```ts
const config: SqsConfig = {
  region: "us-east-1",
  accessKeyId: "your-key",
  secretAccessKey: "your-secret",
};

// Optional custom logger
const logger = new WinstonLogger();

// Initialize adapter
const sqs = new SQS(config, logger);

// Enqueue a message
await sqs.enqueue({
  queueUrl: "https://sqs.us-east-1.amazonaws.com/1234/my-queue",
  message: { hello: "world" },
});
```

### JWT Service

```ts
const token = await jwtService.encode({ data: { userId: 123 } }, "mySecret");
const decoded = await jwtService.decode(token, "mySecret");
```

---

## 🏗️ Architecture Principles

| Layer | Description |
|---|---|
| **Core** | Pure utilities, errors, and types. Independent from adapters or transports. |
| **Adapters** | External services (SQS, Redis, DB). Depend only on core. |
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
