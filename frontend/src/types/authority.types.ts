import { DouCorrelationItem } from './dossier.types';

export interface AuthorityListItem {
  id: string;
  authorityName: string;
  authorityRole: string;
  publicBody: string;
  tier: string;
  tierLabel: string;
  meetingsCount: number;
  distinctLobbyists: number;
  distinctEntities: number;
  matchedEntities?: string[];
  opaqueMeetingsCount: number;
  opacityRate: number; // 0.0 to 1.0
  firstMeeting?: string;
  lastMeeting?: string;
}

export interface AuthoritiesListResponse {
  items: AuthorityListItem[];
  total: number;
  page: number;
  size: number;
  totalPages: number;
}

export interface AuthoritySummary {
  id: string;
  name: string;
  role: string;
  publicBody: string;
  tier: string;
  tierLabel: string;
  totalMeetings: number;
  distinctLobbyists: number;
  distinctEntities: number;
  opaqueMeetingsCount: number;
  clearMeetingsCount: number;
  opacityRatePct: number; // 0 to 100
}

export interface AuthorityTopEntity {
  name: string;
  count: number;
  pct: number;
}

export interface AuthorityTopLobbyist {
  name: string;
  id: string;
  count: number;
  maskedCpf: string;
  entity: string;
}

export interface AuthorityAudienceItem {
  id: string;
  dateTime: string;
  publicBodyName: string;
  authorityName: string;
  authorityRole: string;
  lobbyistName: string;
  lobbyistId: string;
  lobbyistMaskedCpf: string;
  representedEntity: string;
  declaredTopic: string;
  isOpaque: boolean;
}

export interface AuthoritySlice {
  name: string;
  value: number;
  isOthers?: boolean;
}

export interface AuthorityChartsData {
  meetingsByMonth: { month: string; total: number; opaque: number }[];
  byEntity: AuthoritySlice[];
  byLobbyist: AuthoritySlice[];
  bySector: AuthoritySlice[];
  byNature: AuthoritySlice[];
  objectivity: { clear: number; opaque: number; clearPct: number };
  douActsByMonth: { month: string; value: number }[];
  totals?: { entities: number; lobbyists: number; sectors: number; douActs: number };
}

export interface AuthorityDossierDetail {
  authority: AuthoritySummary;
  topEntities: AuthorityTopEntity[];
  topLobbyists: AuthorityTopLobbyist[];
  audienceTimeline: AuthorityAudienceItem[];
  douCorrelations: DouCorrelationItem[];
  charts?: AuthorityChartsData;
}

export interface AuthorityReportResponse {
  authorityName: string;
  report: string;
  generatedAt: string;
  provider: string;
  dataHash?: string;
  isCached?: boolean;
  evidenceCounts?: {
    meetings: number;
    correlations: number;
    entities: number;
  };
}
