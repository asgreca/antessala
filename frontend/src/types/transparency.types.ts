export interface TransparencyItem {
  public_body: string;
  total_external_meetings: number;
  clear_meetings: number;
  opaque_meetings: number;
  transparency_index_pct: number;
  citizen_clarity_rating: string;
}

export interface TreemapNode {
  name: string;
  value?: number;
  transparency_index_pct?: number;
  total_meetings?: number;
  children?: TreemapNode[];
}
