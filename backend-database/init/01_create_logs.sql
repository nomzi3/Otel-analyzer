CREATE TABLE IF NOT EXISTS otel_logs (
    timestamp            DateTime64(9, 'UTC'),
    observed_timestamp   DateTime64(9, 'UTC'),
    trace_id             String,
    span_id              String,
    severity_number      UInt8,
    severity_text        String,
    body                 String,
    log_pattern          String,
    resource_attributes  Map(String, String),
    scope_attributes     Map(String, String),
    log_attributes       Map(String, String),
    service_name         String MATERIALIZED resource_attributes['service.name']
) ENGINE = MergeTree()
PARTITION BY toDate(timestamp)
ORDER BY (service_name, timestamp)
SETTINGS index_granularity = 8192;
