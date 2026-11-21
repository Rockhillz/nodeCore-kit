import { HttpError, ValidationError, noopLogger, type Logger } from "../core/index.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type HttpMethod = "GET" | "HEAD" | "OPTIONS" | "POST" | "PUT" | "PATCH" | "DELETE";

type QueryPrimitive = string | number | boolean;
export type QueryParams = Record<string, QueryPrimitive | QueryPrimitive[] | null | undefined>;

/** A fixed `Authorization` header value, or a function that returns one (e.g. to refresh tokens) */
export type TokenSource = string | (() => string | undefined | Promise<string | undefined>);

export type ResponseType = "auto" | "json" | "text" | "buffer" | "stream";

export interface RetryPolicy {
  /** Retry attempts after the first try (default: 0, no retries) */
  retries?: number;
  /** Base delay in ms for exponential backoff with jitter (default: 300) */
  delay?: number;
  /** Maximum delay between attempts in ms, also caps `Retry-After` (default: 10000) */
  maxDelay?: number;
  /**
   * Methods that may be retried (default: GET, HEAD, OPTIONS, PUT, DELETE).
   * POST and PATCH are excluded because repeating them can duplicate work.
   */
  methods?: HttpMethod[];
  /** Response statuses that trigger a retry (default: 408, 429, 502, 503, 504) */
  statusCodes?: number[];
  /** Retry timeouts and network failures (default: true) */
  retryNetworkErrors?: boolean;
}

export interface HttpClientOptions {
  /** Prepended to every relative path */
  baseURL?: string;
  /** Sent with every request; per-request headers override them */
  headers?: Record<string, string>;
  /** Sent as the `Authorization` header, as-is (include the "Bearer " prefix) */
  token?: TokenSource;
  /** Per-attempt timeout in ms (default: 30000). 0 disables it. */
  timeout?: number;
  /** Retry policy, or a number of retries using the default policy */
  retry?: RetryPolicy | number;
  /** Logs retries (default: silent) */
  logger?: Logger;
  /** Custom fetch implementation, e.g. for tests (default: global fetch) */
  fetch?: typeof fetch;
}

export interface RequestOptions {
  method?: HttpMethod;
  headers?: Record<string, string>;
  /** Appended to the URL. Arrays repeat the key; null/undefined are skipped. */
  query?: QueryParams;
  /**
   * Request body. Plain objects and arrays are sent as JSON. Strings, Buffers,
   * FormData, URLSearchParams, Blobs and streams are sent as they are.
   */
  body?: unknown;
  /** Overrides the client token for this request */
  token?: TokenSource;
  timeout?: number;
  /** Abort the request (and any pending retries) */
  signal?: AbortSignal;
  retry?: RetryPolicy | number;
  /**
   * How to read the response (default: "auto"): JSON when the content type is
   * JSON, text otherwise, `undefined` for empty responses.
   */
  responseType?: ResponseType;
}

export interface HttpResponse<T> {
  data: T;
  status: number;
  headers: Headers;
}

type NoBodyOptions = Omit<RequestOptions, "method" | "body">;

export interface HttpClient {
  /** Sends a request and returns the data, status and headers */
  request<T = unknown>(path: string, options?: RequestOptions): Promise<HttpResponse<T>>;
  get<T = unknown>(path: string, options?: NoBodyOptions): Promise<T>;
  delete<T = unknown>(path: string, options?: Omit<RequestOptions, "method">): Promise<T>;
  head(path: string, options?: NoBodyOptions): Promise<HttpResponse<undefined>>;
  post<T = unknown>(path: string, body?: unknown, options?: NoBodyOptions): Promise<T>;
  put<T = unknown>(path: string, body?: unknown, options?: NoBodyOptions): Promise<T>;
  patch<T = unknown>(path: string, body?: unknown, options?: NoBodyOptions): Promise<T>;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT = 30_000;

const DEFAULT_RETRY: Required<RetryPolicy> = {
  retries: 0,
  delay: 300,
  maxDelay: 10_000,
  methods: ["GET", "HEAD", "OPTIONS", "PUT", "DELETE"],
  statusCodes: [408, 429, 502, 503, 504],
  retryNetworkErrors: true,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const resolveRetry = (
  ...policies: Array<RetryPolicy | number | undefined>
): Required<RetryPolicy> => {
  let result = { ...DEFAULT_RETRY };
  for (const policy of policies) {
    if (policy === undefined) continue;
    result = typeof policy === "number" ? { ...result, retries: policy } : { ...result, ...policy };
  }
  return result;
};

/** Drops the query string, which can carry API keys, before a URL goes into errors or logs */
const safeUrl = (url: string): string => url.split("?")[0];

const buildUrl = (baseURL: string | undefined, path: string, query?: QueryParams): string => {
  let url =
    !baseURL || /^https?:\/\//i.test(path)
      ? path
      : `${baseURL.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;

  if (query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value === null || value === undefined) continue;
      for (const v of Array.isArray(value) ? value : [value]) params.append(key, String(v));
    }
    const qs = params.toString();
    if (qs) url += (url.includes("?") ? "&" : "?") + qs;
  }

  return url;
};

const isPlainBody = (body: unknown): boolean =>
  Array.isArray(body) ||
  (typeof body === "object" &&
    body !== null &&
    (Object.getPrototypeOf(body) === Object.prototype || Object.getPrototypeOf(body) === null));

const isStreamBody = (body: unknown): boolean =>
  typeof body === "object" &&
  body !== null &&
  (typeof (body as any).getReader === "function" || typeof (body as any).pipe === "function");

const hasHeader = (headers: Record<string, string>, name: string): boolean =>
  Object.keys(headers).some((k) => k.toLowerCase() === name.toLowerCase());

const resolveToken = async (token?: TokenSource): Promise<string | undefined> =>
  typeof token === "function" ? token() : token;

const headersToObject = (headers: Headers): Record<string, string> => {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
};

const parseRetryAfter = (value: string | null): number | undefined => {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
};

const backoff = (attempt: number, policy: Required<RetryPolicy>): number =>
  // "Full jitter": a random delay up to the exponential cap spreads out retries
  Math.random() * Math.min(policy.maxDelay, policy.delay * 2 ** attempt);

const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal!.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });

const readBody = async (res: Response, method: HttpMethod, type: ResponseType): Promise<unknown> => {
  if (type === "stream") return res.body;
  if (type === "buffer") return Buffer.from(await res.arrayBuffer());
  if (method === "HEAD" || res.status === 204 || res.status === 205) return undefined;

  const text = await res.text();
  if (type === "text") return text;
  if (!text) return undefined;

  const isJson = /[/+]json\b/i.test(res.headers.get("content-type") ?? "");
  if (type === "json" || isJson) {
    try {
      return JSON.parse(text);
    } catch (err) {
      if (type === "json") throw err;
      return text;
    }
  }
  return text;
};

/** Error bodies are read leniently: a broken body must not hide the status */
const readErrorBody = async (res: Response): Promise<unknown> => {
  try {
    return await readBody(res, "GET", "auto");
  } catch {
    return undefined;
  }
};

const messageFromBody = (body: unknown): string | undefined => {
  if (typeof body === "string" && body.trim()) return body.slice(0, 500);
  if (body && typeof body === "object" && typeof (body as any).message === "string") {
    return (body as any).message;
  }
  return undefined;
};

// ─── Client ───────────────────────────────────────────────────────────────────

/**
 * Creates a reusable HTTP client on top of native `fetch`.
 * Configure it once per upstream service.
 *
 * Failures always throw an `HttpError`:
 * - upstream responded with an error → its status code and parsed body
 * - request timed out → 504 (`UPSTREAM_TIMEOUT`)
 * - network failure (DNS, connection refused, …) → 502 (`UPSTREAM_UNREACHABLE`)
 *
 * Aborting through `signal` rejects with the signal's reason instead.
 *
 * @example
 * const payments = createHttpClient({
 *   baseURL: "https://payments.internal",
 *   token: () => `Bearer ${tokenStore.current()}`,
 *   timeout: 5000,
 *   retry: 2,
 * });
 *
 * const invoice = await payments.get<Invoice>("/invoices/42", { query: { expand: "lines" } });
 * await payments.post("/charges", { amount: 500 });
 */
export const createHttpClient = (clientOptions: HttpClientOptions = {}): HttpClient => {
  const {
    baseURL,
    headers: clientHeaders = {},
    token: clientToken,
    timeout: clientTimeout = DEFAULT_TIMEOUT,
    retry: clientRetry,
    logger = noopLogger,
    fetch: fetchImpl,
  } = clientOptions;

  const request = async <T = unknown>(
    path: string,
    options: RequestOptions = {},
  ): Promise<HttpResponse<T>> => {
    const {
      method = "GET",
      headers = {},
      query,
      body,
      token = clientToken,
      timeout = clientTimeout,
      signal,
      retry,
      responseType = "auto",
    } = options;

    const doFetch = fetchImpl ?? globalThis.fetch;
    const url = buildUrl(baseURL, path, query);
    const reportedUrl = safeUrl(url);

    if (body !== undefined && (method === "GET" || method === "HEAD")) {
      throw new ValidationError(`${method} requests cannot have a body. Use \`query\` instead.`);
    }

    const requestHeaders: Record<string, string> = {
      Accept: "application/json, text/plain, */*",
      ...clientHeaders,
      ...headers,
    };

    let requestBody: any = body;
    if (isPlainBody(body)) {
      requestBody = JSON.stringify(body);
      if (!hasHeader(requestHeaders, "content-type")) {
        requestHeaders["Content-Type"] = "application/json";
      }
    }

    const streamed = isStreamBody(body);
    // A stream can only be read once, so it cannot be retried
    const policy = resolveRetry(clientRetry, retry, streamed ? 0 : undefined);
    const canRetry = policy.methods.includes(method);

    for (let attempt = 0; ; attempt++) {
      const authorization = await resolveToken(token);
      const attemptHeaders = authorization
        ? { ...requestHeaders, Authorization: authorization }
        : requestHeaders;

      // Checked after the await above: the caller may have aborted meanwhile,
      // and a listener added later would never fire
      if (signal?.aborted) throw signal.reason;

      const controller = new AbortController();
      const onAbort = () => controller.abort(signal!.reason);
      signal?.addEventListener("abort", onAbort, { once: true });

      let timedOut = false;
      const timer =
        timeout > 0
          ? setTimeout(() => {
              timedOut = true;
              controller.abort();
            }, timeout)
          : undefined;

      const isLastAttempt = !canRetry || attempt >= policy.retries;
      let failure: HttpError;
      let retryAfterMs: number | undefined;

      try {
        const res = await doFetch(url, {
          method,
          headers: attemptHeaders,
          body: requestBody,
          signal: controller.signal,
          ...(streamed && { duplex: "half" }),
        } as RequestInit);

        if (res.ok) {
          const data = (await readBody(res, method, responseType)) as T;
          return { data, status: res.status, headers: res.headers };
        }

        const errorBody = await readErrorBody(res);
        failure = new HttpError({
          statusCode: res.status,
          statusText: res.statusText,
          message: messageFromBody(errorBody),
          errorCode:
            typeof (errorBody as any)?.error === "string" ? (errorBody as any).error : undefined,
          body: errorBody,
          url: reportedUrl,
          method,
          headers: headersToObject(res.headers),
        });

        if (isLastAttempt || !policy.statusCodes.includes(res.status)) throw failure;
        retryAfterMs = parseRetryAfter(res.headers.get("retry-after"));
      } catch (err: any) {
        if (err instanceof HttpError) throw err;
        // Caller cancelled: pass their reason through untouched
        if (signal?.aborted) throw signal.reason;

        failure = new HttpError(
          timedOut
            ? {
                statusCode: 504,
                statusText: "Gateway Timeout",
                message: `Request to ${reportedUrl} timed out after ${timeout}ms`,
                errorCode: "UPSTREAM_TIMEOUT",
                url: reportedUrl,
                method,
              }
            : {
                statusCode: 502,
                statusText: "Bad Gateway",
                // fetch reports the real reason (ECONNREFUSED, ENOTFOUND…) in `cause`
                message: `Request to ${reportedUrl} failed: ${err?.cause?.code ?? err?.message ?? "network error"}`,
                errorCode: "UPSTREAM_UNREACHABLE",
                url: reportedUrl,
                method,
                meta: { code: err?.cause?.code ?? err?.code },
              },
        );

        if (isLastAttempt || !policy.retryNetworkErrors) throw failure;
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
      }

      const wait = Math.min(retryAfterMs ?? backoff(attempt, policy), policy.maxDelay);
      logger.warn("HTTP request failed, retrying", {
        method,
        url: reportedUrl,
        status: failure.statusCode,
        attempt: attempt + 1,
        retries: policy.retries,
        waitMs: Math.round(wait),
      });
      await sleep(wait, signal);
    }
  };

  const dataOf = async <T>(promise: Promise<HttpResponse<T>>): Promise<T> => (await promise).data;

  return {
    request,
    get: <T>(path: string, options?: NoBodyOptions) =>
      dataOf(request<T>(path, { ...options, method: "GET" })),
    delete: <T>(path: string, options?: Omit<RequestOptions, "method">) =>
      dataOf(request<T>(path, { ...options, method: "DELETE" })),
    head: (path: string, options?: NoBodyOptions) =>
      request<undefined>(path, { ...options, method: "HEAD" }),
    post: <T>(path: string, body?: unknown, options?: NoBodyOptions) =>
      dataOf(request<T>(path, { ...options, method: "POST", body })),
    put: <T>(path: string, body?: unknown, options?: NoBodyOptions) =>
      dataOf(request<T>(path, { ...options, method: "PUT", body })),
    patch: <T>(path: string, body?: unknown, options?: NoBodyOptions) =>
      dataOf(request<T>(path, { ...options, method: "PATCH", body })),
  };
};

// ─── makeRequest ──────────────────────────────────────────────────────────────

export interface MakeRequestOptions {
  url: string;
  method?: HttpMethod;
  headers?: Record<string, string>;
  /** Sent as-is in the `Authorization` header */
  token?: string;
  /** Request body; objects are sent as JSON */
  data?: unknown;
  query?: QueryParams;
  /** Request timeout in ms (default: 30000). Use 0 to disable. */
  timeout?: number;
  retry?: RetryPolicy | number;
  signal?: AbortSignal;
}

const defaultClient = createHttpClient();

/**
 * One-off HTTP request. For repeated calls to the same service, prefer
 * `createHttpClient`, which keeps the base URL, headers and token in one place.
 *
 * Throws `HttpError` on failure (upstream status, 504 on timeout, 502 on
 * network error).
 *
 * @example
 * const user = await makeRequest<User>({ url: "https://api.example.com/users/1", token: "Bearer abc123" });
 *
 * const created = await makeRequest<User>({
 *   method: "POST",
 *   url: "https://api.example.com/users",
 *   data: { name: "John" },
 * });
 */
export const makeRequest = async <T = Record<string, any>>({
  url,
  method = "GET",
  headers,
  token,
  data,
  query,
  timeout,
  retry,
  signal,
}: MakeRequestOptions): Promise<T> => {
  const res = await defaultClient.request<T>(url, {
    method,
    headers,
    token,
    body: data,
    query,
    timeout,
    retry,
    signal,
  });
  return res.data;
};
