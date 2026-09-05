import { getApiUrl } from './api';
import {
  AuthoritiesListResponse,
  AuthorityDossierDetail,
  AuthorityReportResponse,
} from '../types/authority.types';

export const authorityService = {
  async getAuthorities(params: {
    q?: string;
    company?: string;
    organ?: string;
    tier?: string;
    sortBy?: string;
    page?: number;
    size?: number;
  }): Promise<AuthoritiesListResponse> {
    const url = new URL(getApiUrl('/api/v1/authorities'));
    if (params.q) url.searchParams.set('q', params.q);
    if (params.company) url.searchParams.set('company', params.company);
    if (params.organ && params.organ !== 'ALL') url.searchParams.set('organ', params.organ);
    if (params.tier && params.tier !== 'ALL') url.searchParams.set('tier', params.tier);
    if (params.sortBy) url.searchParams.set('sort_by', params.sortBy);
    if (params.page) url.searchParams.set('page', String(params.page));
    if (params.size) url.searchParams.set('size', String(params.size));

    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new Error(`Falha ao buscar autoridades: ${res.status}`);
    }
    return res.json();
  },

  async getAuthorityDossier(authorityKey: string): Promise<AuthorityDossierDetail> {
    const res = await fetch(getApiUrl(`/api/v1/dossier/authority/${encodeURIComponent(authorityKey)}`));
    if (!res.ok) {
      throw new Error(`Falha ao buscar dossiê da autoridade: ${res.status}`);
    }
    return res.json();
  },

  async generateAuthorityReport(authorityKey: string): Promise<AuthorityReportResponse> {
    const res = await fetch(
      getApiUrl(`/api/v1/dossier/generate-authority-report/${encodeURIComponent(authorityKey)}`),
      { method: 'POST' }
    );
    if (!res.ok) {
      throw new Error(`Falha ao gerar relatório da autoridade: ${res.status}`);
    }
    return res.json();
  },

  async getAuthorityGraph(authorityKey: string): Promise<any> {
    const res = await fetch(
      getApiUrl(`/api/v1/graph/subgraph/${encodeURIComponent(authorityKey)}`)
    );
    if (!res.ok) {
      throw new Error(`Falha ao carregar grafo da autoridade: ${res.status}`);
    }
    return res.json();
  },
};
