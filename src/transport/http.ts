import Axios from "axios";
import { HttpError } from "../core/index.js";

export interface MakeRequestOptions {
  url: string;
  method?: "GET" | "DELETE" | "POST" | "PATCH" | "PUT";
  headers?: Record<string, any>;
  /** Sent as-is in the `Authorization` header */
  token?: string;
  data?: Record<string, any>;
  /** Request timeout in ms (default: 30000). Use 0 to disable. */
  timeout?: number;
}

const DEFAULT_TIMEOUT = 30_000;

/** Drops the query string, which can carry API keys, before a URL goes into errors or logs */
const safeUrl = (url: string): string => url.split("?")[0];

const messageFromBody = (body: unknown): string | undefined => {
  if (typeof body === "string" && body.trim()) return body.slice(0, 500);
  if (body && typeof body === "object" && typeof (body as any).message === "string") {
    return (body as any).message;
  }
  return undefined;
};

/**
 * Makes an HTTP request via Axios with consistent error handling and optional auth.
 * Defaults to GET if no method is provided.
 *
 * Failures always throw an `HttpError`:
 * - upstream responded with an error → its status code and parsed body
 * - request timed out → 504
 * - network failure (DNS, connection refused, …) → 502
 *
 * @example
 * // GET
 * const user = await makeRequest<User>({ url: "/api/user/1", token: "Bearer abc123" });
 *
 * // POST
 * const newUser = await makeRequest({ method: "POST", url: "/api/users", data: { name: "John" } });
 *
 * // Error handling
 * try { await makeRequest({ url }); }
 * catch (err) { if (err instanceof HttpError) console.log(err.statusCode, err.body); }
 */
export const makeRequest = async <T = Record<string, any>>({
  url,
  method = "GET",
  headers = {},
  token,
  data,
  timeout = DEFAULT_TIMEOUT,
}: MakeRequestOptions): Promise<T> => {
  // Copy so the caller's object is never mutated
  const requestHeaders: Record<string, any> = {
    "X-Requested-With": "XMLHttpRequest",
    ...headers,
  };
  if (token) requestHeaders["Authorization"] = token;

  try {
    const result = await Axios({
      method,
      url,
      headers: requestHeaders,
      timeout,
      ...(data !== undefined && { data }),
    });
    return result.data as T;
  } catch (err: any) {
    const reportedUrl = safeUrl(url);

    if (err?.response) {
      const body = err.response.data;
      throw new HttpError({
        statusCode: err.response.status,
        statusText: err.response.statusText,
        message: messageFromBody(body),
        errorCode: typeof body?.error === "string" ? body.error : undefined,
        body,
        url: reportedUrl,
        method,
      });
    }

    // No response: timeout or network failure.
    // Only safe fields are kept: the raw axios error holds the request
    // headers, including the Authorization token.
    const isTimeout = err?.code === "ECONNABORTED" || err?.code === "ETIMEDOUT";
    throw new HttpError({
      statusCode: isTimeout ? 504 : 502,
      statusText: isTimeout ? "Gateway Timeout" : "Bad Gateway",
      message: isTimeout
        ? `Request to ${reportedUrl} timed out after ${timeout}ms`
        : `Request to ${reportedUrl} failed: ${err?.message ?? "network error"}`,
      errorCode: isTimeout ? "UPSTREAM_TIMEOUT" : "UPSTREAM_UNREACHABLE",
      url: reportedUrl,
      method,
      meta: { code: err?.code },
    });
  }
};
