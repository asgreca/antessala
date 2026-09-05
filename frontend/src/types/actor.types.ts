export interface ActorRankingItem {
  id: string;
  name: string;
  maskedCpf: string;
  entropyScore: number;
  iaiScore: number;
  meetingsCount: number;
  distinctMinistriesCount?: number;
  distinctEntitiesCount?: number;
  distinctOrgansCount?: number;
  representedCompanies: string[];
  isExServant: boolean;
  isTseDonor: boolean;
}
