export interface SpanResponse {
  id: number
  trace_id: string
  span_id: string
  parent_id: string | null
  service_name: string
  operation: string
  duration_ms: number | null
  started_at: string
  attributes: Record<string, unknown>
}

export interface MetricResponse {
  id: number
  service_name: string
  metric_name: string
  value: number
  unit: string | null
  recorded_at: string
}

export interface GraphEdge {
  caller: string
  callee: string
  call_count: number
}

export interface GraphResponse {
  nodes: string[]
  edges: GraphEdge[]
}

export interface HealthResponse {
  status: string
}
