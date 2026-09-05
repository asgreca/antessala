import { fetchApi } from './api';
import { AlertListItem, AlertSeverity, AlertStatus, DashboardKpis } from '../types/alert.types';

export interface PageResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  size: number;
  number: number;
}

export const alertsService = {
  getKpis: () => fetchApi<DashboardKpis>('/dashboard/kpis'),
  
  getAlerts: (page = 0, size = 10, severity?: AlertSeverity) => {
    const params = new URLSearchParams({ page: String(page), size: String(size) });
    if (severity) params.append('severity', severity);
    return fetchApi<PageResponse<AlertListItem>>(`/alerts?${params.toString()}`);
  },

  updateStatus: (id: number, status: AlertStatus, justification?: string) => {
    return fetchApi<AlertListItem>(`/alerts/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, justification }),
    });
  },
};
