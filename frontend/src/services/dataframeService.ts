import { fetchApi } from './api';
import { DataFrameAnalyticsResponse, DataFrameStatsResponse } from '../types/dataframe.types';

export const dataframeService = {
  getDataFrame: (search?: string) => {
    const query = search ? `?search=${encodeURIComponent(search)}` : '';
    return fetchApi<DataFrameAnalyticsResponse>(`/analytics/dataframe${query}`);
  },

  getStats: () => fetchApi<DataFrameStatsResponse>('/analytics/stats'),
};
