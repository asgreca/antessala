export interface GraphNodeData {
  id: string;
  label: string;
  type: 'PERSON' | 'ORGANIZATION' | 'PUBLIC_BODY' | 'DOU_ACT' | 'AUTHORITY';
  /** Cargo da autoridade e sua faixa hierárquica. */
  role?: string;
  tier?: string;
  tierLabel?: string;
  tierRank?: number;
  /** Tema do órgão, mesma taxonomia dos gráficos. */
  sector?: string;
  sectorLabel?: string;
  sectors?: string[];
  organs?: string[];
  /** Resumo do que o ato do DOU concedeu. */
  granted?: string;
  beneficiary?: string;
  organRoot?: string;
  deltaDays?: number;
  severity?: string;
  url?: string;
  isLobbyist?: boolean;
  isMinister?: boolean;
  iaiScore?: number;
  cnpj?: string;
  cpf?: string;
  monetaryValue?: number;
}

export interface GraphNode {
  data: GraphNodeData;
}

export interface GraphEdgeData {
  id: string;
  source: string;
  target: string;
  label: string;
  count?: number;
  weight?: number;
}

export interface GraphEdge {
  data: GraphEdgeData;
}

export interface GraphNetworkData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
