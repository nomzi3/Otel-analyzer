const BASE = '/api/v1'

async function get<T>(path: string, params?: Record<string, string | string[] | number | undefined>): Promise<T> {
  let qs = ''
  if (params) {
    const parts: string[] = []
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === '') continue
      if (Array.isArray(v)) {
        for (const item of v) parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(item)}`)
      } else {
        parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      }
    }
    if (parts.length) qs = '?' + parts.join('&')
  }
  const res = await fetch(BASE + path + qs)
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
  return res.json()
}

// ---- types ----

export interface LogRow {
  timestamp: string
  observed_timestamp?: string
  trace_id?: string
  span_id?: string
  severity_number?: number
  severity_text?: string
  body?: string
  log_body?: string
  log_pattern?: string
  pattern?: string
  service_name?: string
  service?: string
  resource_attributes?: Record<string, string>
  scope_attributes?: Record<string, string>
  log_attributes?: Record<string, string>
}

export interface LogPatternRow {
  pattern: string
  service_name: string
  count: number
}

export interface MetricRow {
  timestamp: string
  metric_name?: string
  name?: string
  metric_type?: string
  type?: string
  value?: number
  gauge?: number
  sum?: number
  as_double?: number
  as_int?: number
  service_name?: string
  service?: string
  resource_attributes?: Record<string, string>
  metric_attributes?: Record<string, string>
  attributes?: Record<string, string>
}

export interface TraceRootRow {
  trace_id?: string
  traceId?: string
  id?: string
  root_span_id?: string
  service_name?: string
  service?: string
  root_service?: string
  root_name?: string
  start_time?: string
  start_time_unix_nano?: string
  timestamp?: string
  end_time?: string
  duration_ms?: number
  duration?: number
  status_code?: number | string
  status?: string
  resource_attributes?: Record<string, string>
  span_attributes?: Record<string, string>
}

export interface SpanRow {
  trace_id?: string
  span_id?: string
  parent_span_id?: string
  name?: string
  span_name?: string
  service_name?: string
  service?: string
  start_time?: string
  start_time_unix_nano?: string
  end_time?: string
  end_time_unix_nano?: string
  duration_ms?: number
  duration?: number
  status_code?: number | string
  status?: string
  resource_attributes?: Record<string, string>
  span_attributes?: Record<string, string>
}

export interface ThroughputResponse {
  logs_per_sec: number
  spans_per_sec: number
  datapoints_per_sec: number
}

export interface ServiceRate {
  service_name: string
  rate_per_sec: number
}

export interface ServiceCount {
  service_name: string
  count: number
}

export interface ServiceAvgAttr {
  service_name: string
  avg_attr_count: number
}

export interface LogsStats {
  total_count: number
  distinct_services: number
  top_by_rate: ServiceRate[]
  top_by_debug_info: ServiceCount[]
}

export interface MetricsStats {
  total_count: number
  distinct_services: number
  top_by_rate: ServiceRate[]
  top_by_avg_attr: ServiceAvgAttr[]
}

export interface TracesStats {
  total_count: number
  distinct_services: number
  top_by_root_spans: ServiceCount[]
  top_by_rate: ServiceRate[]
}

export interface StatsResponse {
  logs: LogsStats
  metrics: MetricsStats
  traces: TracesStats
}

// ---- endpoints ----

export const api = {
  services: (p?: { resource_attr_key?: string }) =>
    get<string[]>('/services', { resource_attr_key: p?.resource_attr_key }),
  resourceAttributes: (p?: { services?: string[] }) =>
    get<string[]>('/resource-attributes', { services: p?.services }),
  throughput: () => get<ThroughputResponse>('/throughput'),

  logs: (p: { limit?: number; offset?: number; services?: string[]; log_pattern?: string; severity?: string; resource_attr_key?: string }) =>
    get<LogRow[]>('/logs', {
      limit: p.limit ?? 100,
      offset: p.offset,
      services: p.services,
      log_pattern: p.log_pattern,
      severity: p.severity,
      resource_attr_key: p.resource_attr_key,
    }),
  logPatterns: (p?: { services?: string[]; severity?: string; resource_attr_key?: string }) =>
    get<LogPatternRow[]>('/logs/patterns', {
      services: p?.services,
      severity: p?.severity,
      resource_attr_key: p?.resource_attr_key,
    }),
  logSeverities: (p?: { services?: string[]; resource_attr_key?: string }) =>
    get<string[]>('/logs/severities', { services: p?.services, resource_attr_key: p?.resource_attr_key }),

  metrics: (p: { limit?: number; offset?: number; metric_name?: string; services?: string[]; resource_attr_key?: string }) =>
    get<MetricRow[]>('/metrics', {
      limit: p.limit ?? 100,
      offset: p.offset,
      metric_name: p.metric_name,
      services: p.services,
      resource_attr_key: p.resource_attr_key,
    }),
  metricNames: (p?: { services?: string[]; resource_attr_key?: string }) =>
    get<string[]>('/metrics/names', { services: p?.services, resource_attr_key: p?.resource_attr_key }),

  traces: (p: { limit?: number; offset?: number; services?: string[]; method?: string; resource_attr_key?: string }) =>
    get<TraceRootRow[]>('/traces', {
      limit: p.limit ?? 50,
      offset: p.offset,
      services: p.services,
      method: p.method,
      resource_attr_key: p.resource_attr_key,
    }),
  traceMethods: (p?: { services?: string[]; resource_attr_key?: string }) =>
    get<string[]>('/traces/methods', { services: p?.services, resource_attr_key: p?.resource_attr_key }),
  traceSpans: (traceId: string) => get<SpanRow[]>(`/traces/${traceId}/spans`),
  stats: () => get<StatsResponse>('/stats'),
}
