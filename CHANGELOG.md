# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [0.7.0](https://github.com/Rockhillz/nodeCore-kit/compare/v0.6.0...v0.7.0) (2026-11-23)


### ⚠ BREAKING CHANGES

* Node >=22.12.0 is required.
* token errors return 401 (was 498/499); SQS no longer
deletes failed messages without a DLQ; sqs.stop() returns a Promise;
errorHandler hides unknown error messages; axios removed and
X-Requested-With no longer sent; Node ^20.19.0 || >=22.12.0 required.

### Features

* add health checks and graceful shutdown ([f6c8309](https://github.com/Rockhillz/nodeCore-kit/commit/f6c83095320e105e841b425d12b97bcf12391254))
* add typed config loader ([58e893a](https://github.com/Rockhillz/nodeCore-kit/commit/58e893ab3ee4ce702229ac67f2f0670b78b05537))
* rework errors, HTTP client, logging and AWS adapters ([4dee8e0](https://github.com/Rockhillz/nodeCore-kit/commit/4dee8e08af25d9715387b6ad0e5429fa1507e2f2))


### Bug Fixes

* fix confirmed bugs found in review and add regression tests ([5a848b3](https://github.com/Rockhillz/nodeCore-kit/commit/5a848b3bb7b7488c5e0a5ae77a257bef11262a83))


* require Node >=22.12 and test on current LTS lines ([dde00d1](https://github.com/Rockhillz/nodeCore-kit/commit/dde00d11294b103415df894b93f7b12d891e4baa))
