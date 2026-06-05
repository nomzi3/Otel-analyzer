CREATE TABLE IF NOT EXISTS otel_trace_roots (
    trace_id            String,
    root_span_id        String,
    service_name        String,
    root_name           String,
    start_time          DateTime64(9, 'UTC'),
    end_time            DateTime64(9, 'UTC'),
    duration_ms         Float64,
    status_code         UInt8,
    resource_attributes Map(String, String),
    span_attributes     Map(String, String)
) ENGINE = ReplacingMergeTree()
ORDER BY trace_id
SETTINGS index_granularity = 8192;

CREATE TABLE IF NOT EXISTS otel_spans (
    trace_id            String,
    span_id             String,
    parent_span_id      String,
    service_name        String,
    name                String,
    start_time          DateTime64(9, 'UTC'),
    end_time            DateTime64(9, 'UTC'),
    duration_ms         Float64,
    status_code         UInt8,
    resource_attributes Map(String, String),
    span_attributes     Map(String, String)
) ENGINE = MergeTree()
PARTITION BY toDate(start_time)
ORDER BY (trace_id, start_time)
SETTINGS index_granularity = 8192;
