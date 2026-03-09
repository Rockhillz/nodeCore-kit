// ─── Sleep ────────────────────────────────────────────────────────────────────

/**
 * Pauses execution for the given number of milliseconds.
 *
 * @example
 * await sleep(1000); // waits 1 second
 */
export const sleep = (ms: number): Promise<void> =>
  new Promise((res) => setTimeout(res, ms));

// ─── Retry ────────────────────────────────────────────────────────────────────

export interface RetryOptions {
  /** Number of retry attempts (default: 3) */
  retries?: number;
  /** Base delay in ms (default: 500) */
  delay?: number;
  /** Use exponential backoff — doubles delay each attempt (default: true) */
  exponential?: boolean;
  /** Called on each failed attempt before retrying */
  onError?: (err: unknown, attempt: number) => void;
}

/**
 * Retries an async function on failure with optional exponential backoff.
 *
 * @example
 * const data = await retry(() => fetchUser(id), { retries: 3, exponential: true });
 */
export const retry = async <T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> => {
  const { retries = 3, delay = 500, exponential = true, onError } = options;

  const attempt = async (remaining: number, currentDelay: number): Promise<T> => {
    try {
      return await fn();
    } catch (err) {
      if (remaining <= 0) throw err;

      onError?.(err, retries - remaining + 1);

      await sleep(currentDelay);
      const nextDelay = exponential ? currentDelay * 2 : currentDelay;
      return attempt(remaining - 1, nextDelay);
    }
  };

  return attempt(retries, delay);
};

// ─── Timeout ──────────────────────────────────────────────────────────────────

/**
 * Rejects if the given promise doesn't resolve within `ms` milliseconds.
 * Cleans up the internal timer whether the promise resolves or rejects.
 *
 * @example
 * const data = await timeout(fetchUser(id), 5000);
 */
export const timeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
  let timer: NodeJS.Timeout;

  const race = Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Operation timed out after ${ms}ms`)),
        ms,
      );
    }),
  ]);

  // Clear the timer whether the promise wins or loses — no leak
  return race.finally(() => clearTimeout(timer));
};

// ─── Debounce ─────────────────────────────────────────────────────────────────

export interface DebouncedFn<T extends (...args: any[]) => any> {
  (...args: Parameters<T>): ReturnType<T> | undefined;
  /** Cancels any pending invocation */
  cancel: () => void;
  /** Immediately invokes the pending call if one exists */
  flush: (...args: Parameters<T>) => ReturnType<T> | undefined;
}

/**
 * Returns a debounced version of `fn` that delays invocation until
 * `delay`ms have passed since the last call.
 *
 * @example
 * const onSearch = debounce((query: string) => search(query), 300);
 * onSearch.cancel(); // cancel pending call
 * onSearch.flush();  // invoke immediately
 */
export const debounce = <T extends (...args: any[]) => any>(
  fn: T,
  delay: number,
): DebouncedFn<T> => {
  let timer: NodeJS.Timeout | undefined;
  let lastArgs: Parameters<T> | undefined;

  const debounced = (...args: Parameters<T>): ReturnType<T> | undefined => {
    lastArgs = args;
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      fn(...args);
    }, delay);
    return undefined;
  };

  debounced.cancel = () => {
    clearTimeout(timer);
    timer = undefined;
    lastArgs = undefined;
  };

  debounced.flush = (...args: Parameters<T>): ReturnType<T> | undefined => {
    clearTimeout(timer);
    timer = undefined;
    const callArgs = args.length ? args : lastArgs;
    if (callArgs) return fn(...callArgs);
    return undefined;
  };

  return debounced;
};

// ─── Throttle ─────────────────────────────────────────────────────────────────

export interface ThrottledFn<T extends (...args: any[]) => any> {
  (...args: Parameters<T>): ReturnType<T> | undefined;
  /** Cancels any pending trailing call */
  cancel: () => void;
}

/**
 * Returns a throttled version of `fn` that invokes at most once per `limit`ms.
 * Executes on the leading edge and optionally on the trailing edge.
 *
 * @example
 * const onScroll = throttle(() => updatePosition(), 100);
 */
export const throttle = <T extends (...args: any[]) => any>(
  fn: T,
  limit: number,
  { trailing = false }: { trailing?: boolean } = {},
): ThrottledFn<T> => {
  let inThrottle = false;
  let trailingTimer: NodeJS.Timeout | undefined;
  let lastArgs: Parameters<T> | undefined;

  const throttled = (...args: Parameters<T>): ReturnType<T> | undefined => {
    lastArgs = args;

    if (!inThrottle) {
      const result = fn(...args);
      inThrottle = true;

      setTimeout(() => {
        inThrottle = false;

        if (trailing && lastArgs) {
          fn(...lastArgs);
          lastArgs = undefined;
        }
      }, limit);

      return result;
    }

    return undefined;
  };

  throttled.cancel = () => {
    clearTimeout(trailingTimer);
    inThrottle = false;
    lastArgs = undefined;
  };

  return throttled;
};

// ─── Memoize ──────────────────────────────────────────────────────────────────

/**
 * Caches the result of `fn` based on its arguments.
 * The cache key is built by JSON-serializing the arguments.
 *
 * @example
 * const getUser = memoize((id: number) => fetchUser(id));
 * await getUser(1); // fetches
 * await getUser(1); // returns cached result
 */
export const memoize = <T extends (...args: any[]) => any>(
  fn: T,
  keyFn?: (...args: Parameters<T>) => string,
): T & { cache: Map<string, ReturnType<T>>; clear: () => void } => {
  const cache = new Map<string, ReturnType<T>>();

  const memoized = (...args: Parameters<T>): ReturnType<T> => {
    const key = keyFn ? keyFn(...args) : JSON.stringify(args);

    if (cache.has(key)) return cache.get(key)!;

    const result = fn(...args);

    // Handle promises — don't cache rejected promises
    if (result instanceof Promise) {
      return result
        .then((val: any) => {
          cache.set(key, val);
          return val;
        })
        .catch((err: any) => {
          cache.delete(key);
          throw err;
        }) as ReturnType<T>;
    }

    cache.set(key, result);
    return result;
  };

  memoized.cache = cache;
  memoized.clear = () => cache.clear();

  return memoized as T & { cache: Map<string, ReturnType<T>>; clear: () => void };
};

// ─── Once ─────────────────────────────────────────────────────────────────────

/**
 * Returns a version of `fn` that executes exactly once.
 * All subsequent calls return the result of the first call.
 *
 * @example
 * const init = once(() => setupDatabase());
 * await init(); // runs
 * await init(); // returns cached result, does not run again
 */
export const once = <T extends (...args: any[]) => any>(
  fn: T,
): ((...args: Parameters<T>) => ReturnType<T>) => {
  let called = false;
  let result: ReturnType<T>;

  return (...args: Parameters<T>): ReturnType<T> => {
    if (!called) {
      called = true;
      result = fn(...args);
    }
    return result;
  };
};