export interface PersonSummary {
  id: string;
  name: string;
  maskedCpf: string;
  isAuthority: boolean;
  isExServant: boolean;
  isTseDonor: boolean;
  iaiScore: number;
  entropyScore: number;
}

export interface SocietaryLink {
  cnpj: string;
  corporateName: string;
  fantasyName: string;
  linkType: string;
  qualification: string;
  capitalPercentage: number;
}

export interface PoliticalLink {
  candidateName: string;
  electionYear: number;
  amount: number;
  disputedRole: string;
}

export interface AudienceTimelineItem {
  id: number;
  dateTime: string;
  declaredTopic: string;
  disambiguatedTopic: string;
  isOpaque: boolean;
  publicBodyName: string;
  authorityName: string;
  authorityRole?: string;
  representedEntity?: string;
}

export interface DouCorrelationItem {
  id?: string;
  actId: string;
  publicationDate: string;
  issuingBody: string;
  actType: string;
  summary: string;
  monetaryValue: number;
  timeDeltaDays: number | null;
  semanticScore: number;
  douUrl?: string;
  /** CNPJ = prova documental; RAZAO_SOCIAL = indício por nome. */
  matchBasis?: 'CNPJ' | 'CNPJ_RAIZ' | 'RAZAO_SOCIAL';
  /** Nome da entidade representada à qual o ato se liga. */
  entityName?: string;
  /** Δt medido contra a reunião mais próxima DESTE ator; nulo se ele não teve nenhuma. */
  ownMeetingDate?: string;
  ownPublicBody?: string;
  ownAuthority?: string;
  attributedToPerson?: boolean;
  /** Δt da entidade (qualquer representante). É ele que define a severidade. */
  entityDeltaDays?: number;
  /** Gravidade da atuação DESTE ator; nula quando ele não teve reunião antes do ato. */
  entitySeverity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  riskScore?: number;
  ownPriorMeetings?: number;
  ownLift?: number;
  /** Representante da mesma empresa que esteve mais perto do ato. É na ficha
   *  dele que a proximidade constitui indício. */
  closestRepresentative?: {
    name: string; id: string; deltaDays: number; meetingDate: string;
  } | null;
  proximityLift?: number;
  priorMeetingsCount?: number;
  reading?: ActReading | null;
  contractedName?: string;
  /** Inexigibilidade, dispensa ou ratificação: contratação sem concorrência plena. */
  isNoBid?: boolean;
  severity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | null;
  lobbyistName?: string;
  lobbyistId?: string;
}

/** Leitura automatizada do ato do DOU. Resume e classifica; não julga legalidade. */
export interface ActReading {
  granted?: string;
  beneficiary?: string;
  object?: string;
  declaredValue?: string;
  legalBasis?: string;
  relation?: 'mesma_materia' | 'materia_conexa' | 'sem_relacao' | 'indeterminado';
  relationConfidence?: number;
  relationRationale?: string;
  relationExcerpt?: string;
  /** true quando a trava determinística sobrescreveu a resposta do modelo. */
  overridden?: boolean;
  modelSaid?: string;
  generatedBy?: string;
  promptVersion?: string;
  disclaimer?: string;
}

export interface ThematicCluster {
  category: string;
  count: number;
  description: string;
  samples?: string[];
}

export interface OpaqueAnalysis {
  total: number;
  opaque: number;
  pct: number;
  maskedByRoleCount?: number;
  maskedByRole?: Array<{
    date: string;
    authority: string;
    role: string;
    genericTopic: string;
    inferredTopic: string;
  }>;
}

export interface AiSummary {
  executiveSummary: string;
  identifiedRedFlags: string[];
  confidenceScore: number;
  references: string[];
  /** Como o sumário foi produzido. */
  generatedBy?: string;
  thematicClusters?: ThematicCluster[];
  betweenTheLines?: string[];
  citizenImpacts?: string[];
  opaqueAnalysis?: OpaqueAnalysis;
  highlightedAssets?: string[];
  highlightedPartners?: string[];
}

/** Fonte prevista pelo projeto que ainda não foi ingerida. */
export interface DataGap {
  source: string;
  reason: string;
}

/** Componente do índice IAI, com a origem dos pontos. */
export interface RiskComponent {
  key: string;
  label: string;
  observed: number;
  saturatesAt: number;
  maxPoints: number;
  points: number;
  explanation: string;
}

export interface RiskBreakdown {
  score: number;
  maxScore: number;
  components: RiskComponent[];
  method: string;
}

export interface ChartSlice {
  name: string;
  value: number;
  isOthers?: boolean;
}

export interface PersonCharts {
  meetingsByMonth: { month: string; total: number; opaque: number }[];
  byBody: ChartSlice[];
  byEntity: ChartSlice[];
  bySector: ChartSlice[];
  byNature: ChartSlice[];
  byAuthorityTier: { tier: string; label: string; value: number }[];
  objectivity: { clear: number; opaque: number; clearPct: number };
  douActsByMonth: { month: string; value: number }[];
  totals?: { bodies: number; entities: number; sectors: number };
}

export interface DossierDetail {
  person: PersonSummary;
  riskBreakdown?: RiskBreakdown;
  charts?: PersonCharts;
  representedEntities?: string[];
  dataGaps?: DataGap[];
  societaryLinks: SocietaryLink[];
  politicalLinks: PoliticalLink[];
  audienceTimeline: AudienceTimelineItem[];
  douCorrelations: DouCorrelationItem[];
  aiSummary: AiSummary;
}
