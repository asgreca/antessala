export type AlertSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type AlertStatus = 'ACTIVE' | 'IN_REVIEW' | 'DISMISSED' | 'ACTION_TAKEN';

export interface AlertListItem {
  id: number;
  title: string;
  description: string;
  severity: AlertSeverity;
  status: AlertStatus;
  iaiScore: number;
  visitorName: string;
  authorityName?: string;
  visitorId: string;
  organizationName: string;
  publicBodyAcronym: string;
  redFlags: string[];
  justification?: string;
  createdAt: string;
}

export interface DashboardKpis {
  criticalAlertsCount: number;
  highAlertsCount: number;
  mediumAlertsCount: number;
  lowAlertsCount: number;
  highEntropyLobbyistsCount: number;
  opaqueMeetingsCount: number;
  correlatedDouActsCount: number;
}
