CREATE TABLE IF NOT EXISTS otel_metrics (
    timestamp           DateTime64(9, 'UTC'),
    metric_name         String,
    metric_type         String,
    value               Float64,
    service_name        String,
    resource_attributes Map(String, String),
    metric_attributes   Map(String, String)
) ENGINE = MergeTree()
PARTITION BY toDate(timestamp)
ORDER BY (metric_name, service_name, timestamp)
SETTINGS index_granularity = 8192;
