import { afterEach, describe, expect, it, vi } from "vitest";
import { memoize, throttle } from "../src/core/async";

describe("memoize", () => {
  it("returns a promise on every call for async functions", async () => {
    const m = memoize(async (x: number) => x * 2);
    await expect(m(2)).resolves.toBe(4);

    const second = m(2);
    expect(second).toBeInstanceOf(Promise);
    await expect(second).resolves.toBe(4);
  });

  it("shares one in-flight call between concurrent callers", async () => {
    const fn = vi.fn(async (x: number) => x);
    const m = memoize(fn);
    await Promise.all([m(1), m(1), m(1)]);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not cache rejected promises", async () => {
    let calls = 0;
    const m = memoize(async () => {
      calls++;
      if (calls === 1) throw new Error("first fails");
      return "ok";
    });

    await expect(m()).rejects.toThrow("first fails");
    await expect(m()).resolves.toBe("ok");
    expect(calls).toBe(2);
  });

  it("caches sync results", () => {
    const fn = vi.fn((x: number) => x + 1);
    const m = memoize(fn);
    expect(m(1)).toBe(2);
    expect(m(1)).toBe(2);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("throttle", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls on the leading edge only once per window", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const t = throttle(fn, 100);
    t(1);
    t(2);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(100);
    t(3);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("fires a trailing call only if called during the window", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const t = throttle(fn, 100, { trailing: true });

    t(1);
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1); // no repeat of the leading call

    t(2);
    t(3);
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(3);
    expect(fn).toHaveBeenLastCalledWith(3);
  });

  it("cancel() prevents the pending trailing call", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const t = throttle(fn, 100, { trailing: true });
    t(1);
    t(2);
    t.cancel();
    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
