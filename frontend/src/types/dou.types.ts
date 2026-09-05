export interface DouCorrelationRecord {
  id: string;
  event_id: number;
  visit_date: string;
  dou_publication_date: string;
  days_elapsed_lag: number;
  visitor_name: string;
  authority_name: string;
  public_body: string;
  declared_topic: string;
  dou_document_type: string;
  dou_title_act: string;
  dou_monetary_value: number;
  correlation_confidence_score: number;
  causality_assessment: string;
}

export interface DouLagStats {
  total_correlations_found: number;
  avg_days_lag: number;
  total_monetary_value_correlated: number;
  lag_distribution: Record<string, number>;
  causality_insight: string;
}

export interface DouCorrelationResponse {
  totalElements: number;
  totalPages: number;
  page: number;
  records: DouCorrelationRecord[];
}
