"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var src_exports = {};
__export(src_exports, {
  makeRequest: () => makeRequest,
  paginate: () => paginate
});
module.exports = __toCommonJS(src_exports);

// src/utils/index.ts
var paginate = (totalCount, currentPage, perPage) => {
  const previousPage = currentPage - 1;
  return {
    pageCount: Math.ceil(totalCount / perPage),
    offset: currentPage > 1 ? previousPage * perPage : 0
  };
};

// src/http/index.ts
var import_axios = __toESM(require("axios"), 1);
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
    const result = await (0, import_axios.default)(payload);
    return result.data;
  } catch (err) {
    throw err.response ? { ...err.response.data, httpStatusCode: err.response.status } : err;
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  makeRequest,
  paginate
});
