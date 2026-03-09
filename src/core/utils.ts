import { createHmac } from "node:crypto";

export const paginate = (
  totalCount: number,
  currentPage: number,
  perPage: number,
): { pageCount: number; offset: number } => {
  const previousPage = currentPage - 1;
  return {
    pageCount: Math.ceil(totalCount / perPage),
    offset: currentPage > 1 ? previousPage * perPage : 0,
  };
};

export const formatDate = (date: Date): string => {
  const day = date.getDate().toString().padStart(2, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

export const parseJSON = (value: any) => {
  try {
    return JSON.parse(value);
  } catch (err) {
    return value;
  }
};

export const stringifyJSON = (value: any) => {
  try {
    return JSON.stringify(value);
  } catch (err) {
    return value;
  }
};


