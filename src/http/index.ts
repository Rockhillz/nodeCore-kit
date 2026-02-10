import Axios  from "axios";

// Make a http request using axios
export const makeRequest = async ({
  url,
  method = "GET",
  headers = {},
  token = undefined,
  data = undefined,
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
    const payload: any = {
      method,
      url,
      headers,
    };

    if (data) payload.data = data;

    const result = await Axios(payload);

    return result.data;
  } catch (err: any) {
    throw err.response
  ? { ...(err.response.data as Record<string, any>), httpStatusCode: err.response.status }
  : err;

  }
};
