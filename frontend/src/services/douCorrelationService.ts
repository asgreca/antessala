import { fetchApi } from './api';
import { DouCorrelationResponse, DouLagStats } from '../types/dou.types';

export const douCorrelationService = {
  getCorrelations: (page = 1, size = 20, minConfidence = 0.5) =>
    fetchApi<DouCorrelationResponse>(`/analytics/dou-temporal-correlation?page=${page}&size=${size}&min_confidence=${minConfidence}`),

  getLagStats: () =>
    fetchApi<DouLagStats>('/analytics/dou-lag-stats'),
};
