import { fetchApi } from './api';
import { DossierDetail } from '../types/dossier.types';

export const dossierService = {
  getDossier: (personId: string) => 
    fetchApi<DossierDetail>(`/dossier/person/${encodeURIComponent(personId)}`),
};
