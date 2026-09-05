export interface SearchResultItem {
  id: string;
  name: string;
  /** ENTIDADE_DECLARADA: texto do campo livre "representando" sem CNPJ
   *  nem volume que confirme tratar-se de uma organização. */
  entityType: 'PERSON' | 'ORGANIZATION' | 'PUBLIC_BODY' | 'ENTIDADE_DECLARADA' | 'AUTHORITY';
  document: string;
  iaiScore: number;
  details: string;
}

export interface ActorRankingItem {
  id: string;
  name: string;
  maskedCpf: string;
  entropyScore: number;
  iaiScore: number;
  meetingsCount: number;
  distinctOrgansCount: number;
  representedCompanies: string[];
  isExServant: boolean;
  isTseDonor: boolean;
}
