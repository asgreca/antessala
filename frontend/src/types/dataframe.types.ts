export interface DataFrameRecord {
  event_id: number;
  date_time: string;
  visitor_name: string;
  masked_cpf: string;
  role: string;
  company_name: string;
  cnpj: string;
  public_body: string;
  declared_topic: string;
  disambiguated_topic_llm: string;
  entropy_ett: number;
  iai_score: number;
  red_flags_count: number;
  dou_act_correlated: string;
  dou_monetary_value: number;
}

export interface DataFrameAnalyticsResponse {
  shape: {
    rows: number;
    columns: number;
  };
  columns: string[];
  dtypes: Record<string, string>;
  records: DataFrameRecord[];
}

export interface DataFrameStatsResponse {
  summary_numeric: Record<string, any>;
  body_counts: Record<string, number>;
  top_lobbyists: Array<{
    visitor_name: string;
    entropy_ett: number;
    company_name: string;
  }>;
  total_monetary_value_dou: number;
}
