import Axios, { AxiosProgressEvent } from "axios";
import { sleep } from "../core/async";

type HttpMethod = "GET" | "DELETE" | "POST" | "PATCH" | "PUT";

interface RequestOptions<TData = unknown> {
  url: string;
  method?: HttpMethod;
  headers?: Record<string, string>;
  /** Auth token — will be sent as `Bearer <token>` */
  token?: string;
  /** Request body — plain object, array, or FormData */
  data?: TData;
  /** Query string parameters */
  params?: Record<string, any>;
  /** Request timeout in milliseconds (default: 10_000) */
  timeout?: number;
  /** Number of retry attempts on network errors or 5xx responses (default: 0) */
  retries?: number;
  /** Upload/download progress callback */
  onProgress?: (event: AxiosProgressEvent) => void;
}

interface HttpError {
  message: string;
  httpStatusCode: number | null;
  data: Record<string, any> | null;
  isHttpError: boolean;
}

/**
 * Makes an HTTP request via Axios with consistent error handling,
 * optional auth, query params, timeout, and retry support.
 *
 * @example
 * const user = await makeRequest<User>({ url: "/api/user/1" });
 * const post = await makeRequest<Post>({ url: "/api/posts", method: "POST", data: { title: "Hello" } });
 */
export const makeRequest = async <TResponse = Record<string, any>, TData = unknown>(
  options: RequestOptions<TData>,
  _retryCount = 0,
): Promise<TResponse> => {
  const {
    url,
    method = "GET",
    headers = {},
    token,
    data,
    params,
    timeout = 10_000,
    retries = 0,
    onProgress,
  } = options;

  const resolvedHeaders: Record<string, string> = {
    "X-Requested-With": "XMLHttpRequest",
    ...headers,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  try {
    const result = await Axios<TResponse>({
      method,
      url,
      headers: resolvedHeaders,
      data,
      params,
      timeout,
      ...(onProgress && {
        onUploadProgress: onProgress,
        onDownloadProgress: onProgress,
      }),
    });

    return result.data;
  } catch (err: any) {
    const shouldRetry =
      _retryCount < retries &&
      (!err.response || err.response.status >= 500);

    if (shouldRetry) {
      await sleep(2 ** _retryCount * 300); // exponential backoff: 300ms, 600ms, 1200ms...
      return makeRequest(options, _retryCount + 1);
    }

    const error: HttpError = {
      isHttpError: true,
      message: err.response?.data?.message ?? err.message ?? "Request failed",
      httpStatusCode: err.response?.status ?? null,
      data: err.response?.data ?? null,
    };

    throw error;
  }
};