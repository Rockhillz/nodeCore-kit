// src/utils/index.ts
var paginate = (totalCount, currentPage, perPage) => {
  const previousPage = currentPage - 1;
  return {
    pageCount: Math.ceil(totalCount / perPage),
    offset: currentPage > 1 ? previousPage * perPage : 0
  };
};

// src/http/index.ts
import Axios from "axios";
var makeRequest = async ({
  url,
  method = "GET",
  headers = {},
  token = void 0,
  data = void 0
}) => {
  try {
    headers["X-Requested-With"] = "XMLHttpRequest";
    token && (headers["Authorization"] = token);
    const payload = {
      method,
      url,
      headers
    };
    if (data)
      payload.data = data;
    const result = await Axios(payload);
    return result.data;
  } catch (err) {
    throw err.response ? { ...err.response.data, httpStatusCode: err.response.status } : err;
  }
};
export {
  makeRequest,
  paginate
};
