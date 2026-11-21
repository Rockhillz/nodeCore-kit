import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { gracefulShutdown, type GracefulShutdown } from "../src/core/shutdown";
import { createHealth } from "../src/core/health";
import { closeHttpServer } from "../src/transport/httpServer";
import { noopLogger } from "../src/core/logger";

const created: GracefulShutdown[] = [];
const make = (opts: Parameters<typeof gracefulShutdown>[0]) => {
  const s = gracefulShutdown({ logger: noopLogger, ...opts });
  created.push(s);
  return s;
};

afterEach(() => {
  created.splice(0).forEach((s) => s.dispose());
});

describe("gracefulShutdown", () => {
  it("runs steps in order and exits with 0", async () => {
    const order: string[] = [];
    const exit = vi.fn();
    const s = make({
      signals: [],
      exit,
      steps: [
        { name: "http", stop: async () => void order.push("http") },
        { name: "sqs", stop: () => void order.push("sqs") },
        { name: "redis", stop: async () => void order.push("redis") },
      ],
    });

    await expect(s.shutdown()).resolves.toBe(true);
    expect(order).toEqual(["http", "sqs", "redis"]);
    expect(exit).toHaveBeenCalledWith(0);
    expect(s.isShuttingDown).toBe(true);
  });

  it("keeps going after a failing step and exits with 1", async () => {
    const exit = vi.fn();
    const last = vi.fn();
    const s = make({
      signals: [],
      exit,
      steps: [
        { name: "bad", stop: () => Promise.reject(new Error("boom")) },
        { name: "last", stop: last },
      ],
    });

    await expect(s.shutdown()).resolves.toBe(false);
    expect(last).toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("gives up on a step that exceeds its own timeout", async () => {
    const after = vi.fn();
    const s = make({
      signals: [],
      exit: false,
      steps: [
        { name: "stuck", stop: () => new Promise(() => {}), timeout: 30 },
        { name: "after", stop: after },
      ],
    });
    await expect(s.shutdown()).resolves.toBe(false);
    expect(after).toHaveBeenCalled();
  });

  it("forces exit 1 when the total timeout is hit", async () => {
    const exit = vi.fn();
    const s = make({
      signals: [],
      exit,
      timeout: 50,
      drainDelay: 10_000, // longer than the total timeout
      steps: [{ name: "never", stop: vi.fn() }],
    });
    await expect(s.shutdown()).resolves.toBe(false);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("marks health not-ready before running steps", async () => {
    const health = createHealth();
    let readyDuringStep: boolean | undefined;
    const s = make({
      signals: [],
      exit: false,
      health,
      steps: [{ name: "check", stop: () => void (readyDuringStep = health.isReady()) }],
    });
    await s.shutdown();
    expect(readyDuringStep).toBe(false);
  });

  it("only runs once when triggered twice", async () => {
    const step = vi.fn();
    const s = make({ signals: [], exit: false, steps: [{ name: "x", stop: step }] });
    await Promise.all([s.shutdown(), s.shutdown()]);
    expect(step).toHaveBeenCalledTimes(1);
  });

  it("starts on a signal; a second signal exits immediately with 1", async () => {
    const exit = vi.fn();
    let release!: () => void;
    const step = vi.fn(() => new Promise<void>((r) => (release = r)));
    const s = make({ signals: ["SIGUSR2"], exit, steps: [{ name: "slow", stop: step }] });

    process.emit("SIGUSR2", "SIGUSR2");
    await vi.waitFor(() => expect(step).toHaveBeenCalled());
    expect(s.isShuttingDown).toBe(true);

    process.emit("SIGUSR2", "SIGUSR2");
    expect(exit).toHaveBeenCalledWith(1);

    release();
  });

  it("dispose() removes signal listeners", () => {
    const before = process.listenerCount("SIGUSR2");
    const s = gracefulShutdown({ signals: ["SIGUSR2"], exit: false, steps: [], logger: noopLogger });
    expect(process.listenerCount("SIGUSR2")).toBe(before + 1);
    s.dispose();
    expect(process.listenerCount("SIGUSR2")).toBe(before);
  });
});

describe("closeHttpServer", () => {
  const listen = async (handler: http.RequestListener) => {
    const server = http.createServer(handler);
    await new Promise<void>((r) => server.listen(0, r));
    return { server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
  };

  it("closes a server with idle keep-alive connections promptly", async () => {
    const { server, url } = await listen((_req, res) => res.end("ok"));
    const agent = new http.Agent({ keepAlive: true });
    await new Promise<void>((resolve) => http.get(url, { agent }, (res) => res.resume().on("end", resolve)));

    const started = Date.now();
    await closeHttpServer(server, { timeout: 5000 });
    expect(Date.now() - started).toBeLessThan(1000);
    expect(server.listening).toBe(false);
    agent.destroy();
  });

  it("lets an in-flight request finish", async () => {
    const { server, url } = await listen((_req, res) => setTimeout(() => res.end("done"), 100));
    const response = fetch(url).then((r) => r.text());
    await new Promise((r) => setTimeout(r, 20)); // request is in progress

    await closeHttpServer(server, { timeout: 5000 });
    await expect(response).resolves.toBe("done");
  });

  it("closes connections that become idle after shutdown starts", async () => {
    const { server, url } = await listen((_req, res) => setTimeout(() => res.end("done"), 100));
    const agent = new http.Agent({ keepAlive: true });
    const response = new Promise<string>((resolve) =>
      http.get(url, { agent }, (res) => {
        let body = "";
        res.on("data", (c) => (body += c)).on("end", () => resolve(body));
      }),
    );
    await new Promise((r) => setTimeout(r, 20)); // request is in progress

    const started = Date.now();
    await closeHttpServer(server, { timeout: 5000 });
    expect(await response).toBe("done");
    // Without re-closing idle connections this waits for the keep-alive timeout (~5s)
    expect(Date.now() - started).toBeLessThan(1000);
    agent.destroy();
  });

  it("forces stuck connections closed after the timeout", async () => {
    const { server, url } = await listen(() => {
      /* never responds */
    });
    const response = fetch(url).catch((e) => e);
    await new Promise((r) => setTimeout(r, 20));

    const started = Date.now();
    await closeHttpServer(server, { timeout: 50 });
    expect(Date.now() - started).toBeLessThan(2000);
    expect(await response).toBeInstanceOf(Error);
  });

  it("resolves for a server that isn't listening", async () => {
    await expect(closeHttpServer(http.createServer())).resolves.toBeUndefined();
  });
});
