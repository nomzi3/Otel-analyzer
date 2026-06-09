-- Materialized views to pre-aggregate hot query paths.

-- Log pattern counts (replaces full-table-scan GROUP BY in QueryLogPatterns).
CREATE TABLE IF NOT EXISTS otel_logs_patterns_agg (
    log_pattern  String,
    service_name String,
    cnt          UInt64
) ENGINE = SummingMergeTree()
ORDER BY (service_name, log_pattern);

CREATE MATERIALIZED VIEW IF NOT EXISTS otel_logs_patterns_mv
TO otel_logs_patterns_agg AS
SELECT log_pattern, service_name, count() AS cnt
FROM otel_logs
GROUP BY log_pattern, service_name;

-- Distinct service names (replaces 3-table UNION ALL in QueryServices).
CREATE TABLE IF NOT EXISTS otel_services_agg (
    service_name String
) ENGINE = ReplacingMergeTree()
ORDER BY service_name;

CREATE MATERIALIZED VIEW IF NOT EXISTS otel_services_logs_mv
TO otel_services_agg AS
SELECT DISTINCT service_name FROM otel_logs WHERE service_name != '';

CREATE MATERIALIZED VIEW IF NOT EXISTS otel_services_metrics_mv
TO otel_services_agg AS
SELECT DISTINCT service_name FROM otel_metrics WHERE service_name != '';

CREATE MATERIALIZED VIEW IF NOT EXISTS otel_services_traces_mv
TO otel_services_agg AS
SELECT DISTINCT service_name FROM otel_trace_roots WHERE service_name != '';
