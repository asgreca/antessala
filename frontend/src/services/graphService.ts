import { fetchApi } from './api';
import { GraphNetworkData } from '../types/graph.types';

export interface GraphFilterOptionsResponse {
  ministries: string[];
  actors: {
    id: string;
    name: string;
    meetingsCount?: number;
  }[];
  actorMinistries?: string[];
  actorName?: string | null;
  selectedMinistry?: string | null;
}

export const graphService = {
  getSubgraph: (personId: string, depth = 2, publicBody?: string) => {
    let url = `/graph/subgraph/${encodeURIComponent(personId)}?depth=${depth}`;
    if (publicBody && publicBody !== 'TODOS') {
      url += `&public_body=${encodeURIComponent(publicBody)}`;
    }
    return fetchApi<GraphNetworkData>(url);
  },

  getFilterOptions: (publicBody?: string, actorId?: string) => {
    const params = new URLSearchParams();
    if (publicBody && publicBody !== 'TODOS') {
      params.append('public_body', publicBody);
    }
    if (actorId) {
      params.append('actor_id', actorId);
    }
    const queryStr = params.toString();
    return fetchApi<GraphFilterOptionsResponse>(`/graph/filter-options${queryStr ? `?${queryStr}` : ''}`);
  },
};

