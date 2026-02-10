
export const paginate = (
  totalCount: number,
  currentPage: number,
  perPage: number
): { pageCount: number; offset: number } => {
  const previousPage = currentPage - 1;
  return {
    pageCount: Math.ceil(totalCount / perPage),
    offset: currentPage > 1 ? previousPage * perPage : 0,
  };
};