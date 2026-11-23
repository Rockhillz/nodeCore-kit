import { afterEach, describe, expect, it, vi } from "vitest";
import { WinstonLogger } from "../src/adapters/loggers/winston";
import { ServerError } from "../src/core/error";

const captureOutput = () => {
  const lines: string[] = [];
  // Winston's Console transport writes to console._stdout when it exists
  // (vitest swaps that stream), otherwise it falls back to console.log
  const stream: NodeJS.WriteStream = (console as any)._stdout ?? process.stdout;
  const spy = vi.spyOn(stream, "write").mockImplementation((chunk: any) => {
    lines.push(String(chunk));
    return true;
  });
  return { lines, spy };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("WinstonLogger", () => {
  it("keeps message and stack of Errors nested in meta", () => {
    const { lines } = captureOutput();
    const log = new WinstonLogger({ pretty: false });

    log.error("Redis error", { err: new Error("boom") });

    const entry = JSON.parse(lines.join(""));
    expect(entry.meta.err.message).toBe("boom");
    expect(entry.meta.err.name).toBe("Error");
    expect(entry.meta.err.stack).toContain("boom");
  });

  it("keeps AppError fields and the cause chain", () => {
    const { lines } = captureOutput();
    const log = new WinstonLogger({ pretty: false });

    log.error("Upload failed", {
      err: new ServerError("Failed to upload", { cause: new Error("socket hang up") }),
    });

    const { err } = JSON.parse(lines.join("")).meta;
    expect(err.message).toBe("Failed to upload");
    expect(err.statusCode).toBe(500);
    expect(err.meta.cause.message).toBe("socket hang up");
  });

  it("handles circular meta without throwing", () => {
    const { lines } = captureOutput();
    const log = new WinstonLogger({ pretty: false });
    const meta: any = { a: 1 };
    meta.self = meta;

    expect(() => log.info("circular", meta)).not.toThrow();
    expect(JSON.parse(lines.join("")).meta.self).toBe("[Circular]");
  });
});
