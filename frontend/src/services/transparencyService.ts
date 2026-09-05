import { fetchApi } from './api';
import { TransparencyItem, TreemapNode } from '../types/transparency.types';

export const transparencyService = {
  getTransparencyIndex: (limit = 50) =>
    fetchApi<TransparencyItem[]>(`/analytics/transparency-index?limit=${limit}`),

  getTreemapTopics: () =>
    fetchApi<TreemapNode>('/analytics/treemap-topics'),
};
