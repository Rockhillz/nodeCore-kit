declare const paginate: (totalCount: number, currentPage: number, perPage: number) => {
    pageCount: number;
    offset: number;
};

declare const makeRequest: ({ url, method, headers, token, data, }: {
    url: string;
    method?: "GET" | "DELETE" | "POST" | "PATCH" | "PUT";
    headers?: Record<string, any>;
    token?: string;
    data?: Record<string, any>;
}) => Promise<Record<string, any>>;

export { makeRequest, paginate };
