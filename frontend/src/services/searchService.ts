import { fetchApi } from './api';
import { SearchResultItem } from '../types/search.types';

export const searchService = {
  searchGlobal: (query: string, limit = 10) => {
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    return fetchApi<SearchResultItem[]>(`/search?${params.toString()}`);
  },
};
