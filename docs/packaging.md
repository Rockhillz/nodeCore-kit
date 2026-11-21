# Packaging & installation: open discussion

**Status:** not decided · **Last updated:** 2026-11-21

Notes on how nodecore-kit could be installed and imported in future. Nothing
here is implemented. This records the options and the numbers so the
discussion can continue later.

---

## What we do today (unchanged)

One package, one install, everything included:

```bash
npm i nodecore-kit      # installs every dependency: AWS SDK, ioredis, bcrypt, …
```

```ts
import { uuid, SQS, jwtService } from "nodecore-kit";
```

This stays as-is for now: `npm i` installs everything, and nobody has
complained about install size.

---

## What an install costs today

Measured on 2026-11-21 by installing the packed build into an empty project
(Node 24.22, npm 11):

| | Size | Packages |
|---|---|---|
| **Whole install** | **~35 MB** on disk (~19 MB of actual file content) | 156 |

How that splits (file content; dependency trees overlap a little):

| Group | Size | Packages | Notes |
|---|---|---|---|
| AWS SDK: S3 + presigner + SQS | 9.0 MB | 29 | Almost half the install |
| express + joi | 4.3 MB | 73 | Never loaded at runtime (see below) |
| Everything else: winston, bcrypt, ioredis, nodemailer, node-cron, jsonwebtoken, uuid | 5.5 MB | 56 | |

Per library (each with its own dependency tree):

| Library | Size | Packages | Used by |
|---|---|---|---|
| @aws-sdk/client-s3 | 8.3 MB | 26 | adapters/s3 |
| @aws-sdk/client-sqs | 5.3 MB | 25 | adapters/sqs |
| @aws-sdk/s3-request-presigner | 3.4 MB | 11 | adapters/s3 (signed URLs) |
| express | 2.2 MB | 65 | transport/express (types only) |
| joi | 2.2 MB | 8 | transport/express (types only) |
| winston | 1.8 MB | 29 | adapters/loggers |
| bcrypt | 1.5 MB | 3 | security/hash (native addon) |
| ioredis | 1.0 MB | 9 | adapters/redis |
| nodemailer | 0.6 MB | 1 | adapters/mailers (SMTP only) |
| node-cron | 0.3 MB | 1 | adapters/cron |
| jsonwebtoken | 0.3 MB | 15 | security/jwt |
| uuid | 0.1 MB | 1 | core/uuid |

For scale: a typical Express API's `node_modules` is often 50–200 MB, so
35 MB is moderate. Size matters most for serverless (Lambda bundle size and
cold starts) and small Docker images.

### Finding: express and joi are installed but never loaded

The built package contains no `require("express")` or `import … from "joi"`.
The kit only uses their TypeScript types, and users pass in their own Express
app and Joi schemas. Making them optional `peerDependencies` would save
~4.3 MB and 73 packages without breaking anything, and would avoid a second
copy when the user's version differs. This works with any of the options
below, including keeping things as they are.

---

## Options discussed

### A. Keep one install, add folder imports

Everything is still installed, but code can also be imported by folder:

```ts
import { uuid } from "nodecore-kit";                  // root: everything, as today
import { retry } from "nodecore-kit/core";
import { jwtService } from "nodecore-kit/security";
import { createHttpClient } from "nodecore-kit/transport";
import { SQS, Redis } from "nodecore-kit/adapters";
```

- ✅ Nothing breaks; one install still gets everything
- ✅ Matches the folder layout, and each folder maps to a possible future package
- ❌ Install size stays the same; only load time improves

### B. Install only what you use (optional libraries), per-service imports

Heavy libraries become optional `peerDependencies`. The root exports only
dependency-free parts, and each service has its own import path:

```ts
import { uuid } from "nodecore-kit";            // no extra installs
import { SQS } from "nodecore-kit/sqs";         // + npm i @aws-sdk/client-sqs
import { Redis } from "nodecore-kit/redis";     // + npm i ioredis
```

- ✅ Smallest installs (core alone ≈ uuid, ~0.1 MB)
- ❌ Breaks `import { SQS } from "nodecore-kit"`
- ❌ Users must install the right library for each feature
- ❌ Needs **per-service** paths (`/sqs`, `/s3`, …). A combined `/adapters`
  can't work here, because it would load every adapter's library at once and
  crash if any one isn't installed.

### C. Root keeps everything, libraries optional

Same as B, but the root still exports everything, so it only works if every
optional library is installed.

- ❌ Existing code compiles but crashes at startup when a library is missing,
  the worst failure mode of all the options.

### D. Separate npm packages (the AWS SDK v3 way)

`@nodecore-kit/core`, `@nodecore-kit/sqs`, … in a monorepo (npm workspaces +
Changesets), plus a `nodecore-kit` meta-package that installs them all.

- ✅ Both goals at once: `npm i nodecore-kit` still installs everything, and
  lean users install single packages
- ❌ More release work: several packages to version and publish, more CI
- A is a stepping stone towards this.

### The core tension

- **"`npm i` installs everything"** (the original goal) means libraries stay
  as normal dependencies → A, or D's meta-package.
- **"Install only what you use"** (the AWS idea) means optional libraries
  and per-service imports → B, or D's individual packages.

D is the only option that serves both, at the cost of more maintenance.

---

## Ideas that fit any option

- **Enforce the folder rules with a test.** Core imports no other folder;
  `security`, `transport` and `adapters` import only `core`. This keeps any
  future split possible.
- **Package checks in CI.** `publint` and `@arethetypeswrong/cli` catch broken
  `exports` maps and type definitions before publishing.
- **Implementation note for subpaths (A/B):** the build must share code
  between entry points (tsup `splitting: true` for both ESM and CJS).
  Otherwise each import path gets its own copy of the error classes and
  `instanceof ServerError` fails across paths.

---

## When to revisit

- Someone reports install size, Lambda bundle size or cold starts as a
  problem → first make express + joi optional (free), then consider B or D.
- A new adapter would add a big dependency (e.g. Kafka, Postgres drivers).
- Before 1.0: the last good moment for breaking packaging changes.
