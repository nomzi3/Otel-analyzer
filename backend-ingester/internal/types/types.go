package types

import "time"

type LogRow struct {
	Timestamp          time.Time         `json:"timestamp"`
	ObservedTimestamp  time.Time         `json:"observed_timestamp"`
	TraceID            string            `json:"trace_id"`
	SpanID             string            `json:"span_id"`
	SeverityNumber     uint8             `json:"severity_number"`
	SeverityText       string            `json:"severity_text"`
	Body               string            `json:"body"`
	LogPattern         string            `json:"log_pattern"`
	ResourceAttributes map[string]string `json:"resource_attributes"`
	ScopeAttributes    map[string]string `json:"scope_attributes"`
	LogAttributes      map[string]string `json:"log_attributes"`
}

type MetricRow struct {
	Timestamp          time.Time         `json:"timestamp"`
	MetricName         string            `json:"metric_name"`
	MetricType         string            `json:"metric_type"`
	Value              float64           `json:"value"`
	ServiceName        string            `json:"service_name"`
	ResourceAttributes map[string]string `json:"resource_attributes"`
	MetricAttributes   map[string]string `json:"metric_attributes"`
}

type TraceRootRow struct {
	TraceID            string            `json:"trace_id"`
	RootSpanID         string            `json:"root_span_id"`
	ServiceName        string            `json:"service_name"`
	RootName           string            `json:"root_name"`
	StartTime          time.Time         `json:"start_time"`
	EndTime            time.Time         `json:"end_time"`
	DurationMs         float64           `json:"duration_ms"`
	StatusCode         uint8             `json:"status_code"`
	ResourceAttributes map[string]string `json:"resource_attributes"`
	SpanAttributes     map[string]string `json:"span_attributes"`
}

type SpanRow struct {
	TraceID            string            `json:"trace_id"`
	SpanID             string            `json:"span_id"`
	ParentSpanID       string            `json:"parent_span_id"`
	ServiceName        string            `json:"service_name"`
	Name               string            `json:"name"`
	StartTime          time.Time         `json:"start_time"`
	EndTime            time.Time         `json:"end_time"`
	DurationMs         float64           `json:"duration_ms"`
	StatusCode         uint8             `json:"status_code"`
	ResourceAttributes map[string]string `json:"resource_attributes"`
	SpanAttributes     map[string]string `json:"span_attributes"`
}
