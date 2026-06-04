import Axios from "axios";

/**
 * Makes an HTTP request via Axios with consistent error handling and optional auth.
 * Defaults to GET if no method is provided.
 *
 * @example
 * // GET
 * const user = await makeRequest({ url: "/api/user/1", token: "abc123" });
 *
 * // POST
 * const newUser = await makeRequest({ method: "POST", url: "/api/users", data: { name: "John" } });
 *
 * // PATCH
 * const updated = await makeRequest({ method: "PATCH", url: "/api/user/1", data: { name: "Jane" } });
 *
 * // DELETE
 * const deleted = await makeRequest({ method: "DELETE", url: "/api/user/1" });
 */
export const makeRequest = async ({
  url,
  method = "GET",
  headers = {},
  token,
  data,
}: {
  url: string;
  method?: "GET" | "DELETE" | "POST" | "PATCH" | "PUT";
  headers?: Record<string, any>;
  token?: string;
  data?: Record<string, any>;
}): Promise<Record<string, any>> => {
  try {
    headers["X-Requested-With"] = "XMLHttpRequest";
    token && (headers["Authorization"] = token);
    const payload: any = { method, url, headers };
    if (data) payload.data = data;
    const result = await Axios(payload);
    return result.data;
  } catch (err: any) {
    if (err?.response) {
      throw { ...err.response.data, httpStatusCode: err.response.status };
    }
    throw err;
  }
};