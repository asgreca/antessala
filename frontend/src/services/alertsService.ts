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
  
  getAlerts: (
    page = 0,
    size = 10,
    severity?: AlertSeverity,
    filters?: {
      startDate?: string;
      endDate?: string;
      publicBody?: string;
      entityName?: string;
      lobbyistName?: string;
      authorityName?: string;
    }
  ) => {
    const params = new URLSearchParams({ page: String(page), size: String(size) });
    if (severity) params.append('severity', severity);
    if (filters?.startDate) params.append('start_date', filters.startDate);
    if (filters?.endDate) params.append('end_date', filters.endDate);
    if (filters?.publicBody && filters.publicBody !== 'ALL') params.append('public_body', filters.publicBody);
    if (filters?.entityName) params.append('entity_name', filters.entityName);
    if (filters?.lobbyistName) params.append('lobbyist_name', filters.lobbyistName);
    if (filters?.authorityName) params.append('authority_name', filters.authorityName);
    return fetchApi<PageResponse<AlertListItem>>(`/alerts?${params.toString()}`);
  },

  updateStatus: (id: number, status: AlertStatus, justification?: string) => {
    return fetchApi<AlertListItem>(`/alerts/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, justification }),
    });
  },
};
