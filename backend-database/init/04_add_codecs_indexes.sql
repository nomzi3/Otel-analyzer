-- Compression codecs and skip indexes for production throughput.
-- These ALTER TABLE statements are idempotent — safe to re-run.

-- otel_metrics: Gorilla+ZSTD for float time-series, ZSTD on strings/maps,
--               halve index granularity, bloom filter on service_name.
ALTER TABLE otel_metrics MODIFY COLUMN value             Float64           CODEC(Gorilla, ZSTD(1));
ALTER TABLE otel_metrics MODIFY COLUMN metric_name       String            CODEC(ZSTD(3));
ALTER TABLE otel_metrics MODIFY COLUMN metric_type       String            CODEC(ZSTD(3));
ALTER TABLE otel_metrics MODIFY COLUMN service_name      String            CODEC(ZSTD(1));
ALTER TABLE otel_metrics MODIFY COLUMN resource_attributes Map(String,String) CODEC(ZSTD(1));
ALTER TABLE otel_metrics MODIFY COLUMN metric_attributes   Map(String,String) CODEC(ZSTD(1));
ALTER TABLE otel_metrics MODIFY SETTING index_granularity = 4096;
ALTER TABLE otel_metrics ADD INDEX IF NOT EXISTS idx_svc service_name TYPE bloom_filter(0.01) GRANULARITY 4;

-- otel_logs: ZSTD on body and pattern (high entropy strings),
--            skip indexes for severity and pattern filter pushdown.
ALTER TABLE otel_logs MODIFY COLUMN body        String CODEC(ZSTD(1));
ALTER TABLE otel_logs MODIFY COLUMN log_pattern String CODEC(ZSTD(3));
ALTER TABLE otel_logs MODIFY COLUMN severity_text String CODEC(ZSTD(3));
ALTER TABLE otel_logs MODIFY COLUMN trace_id    String CODEC(ZSTD(1));
ALTER TABLE otel_logs MODIFY COLUMN span_id     String CODEC(ZSTD(1));
ALTER TABLE otel_logs MODIFY COLUMN resource_attributes Map(String,String) CODEC(ZSTD(1));
ALTER TABLE otel_logs MODIFY COLUMN scope_attributes    Map(String,String) CODEC(ZSTD(1));
ALTER TABLE otel_logs MODIFY COLUMN log_attributes      Map(String,String) CODEC(ZSTD(1));
ALTER TABLE otel_logs MODIFY SETTING index_granularity = 4096;
ALTER TABLE otel_logs ADD INDEX IF NOT EXISTS idx_severity severity_text TYPE set(100)           GRANULARITY 4;
ALTER TABLE otel_logs ADD INDEX IF NOT EXISTS idx_pattern  log_pattern   TYPE bloom_filter(0.01) GRANULARITY 4;

-- otel_trace_roots: ZSTD on all string columns, bloom filter on service.
ALTER TABLE otel_trace_roots MODIFY COLUMN trace_id     String CODEC(ZSTD(1));
ALTER TABLE otel_trace_roots MODIFY COLUMN root_span_id String CODEC(ZSTD(1));
ALTER TABLE otel_trace_roots MODIFY COLUMN service_name String CODEC(ZSTD(1));
ALTER TABLE otel_trace_roots MODIFY COLUMN root_name    String CODEC(ZSTD(1));
ALTER TABLE otel_trace_roots MODIFY COLUMN resource_attributes Map(String,String) CODEC(ZSTD(1));
ALTER TABLE otel_trace_roots MODIFY COLUMN span_attributes     Map(String,String) CODEC(ZSTD(1));
ALTER TABLE otel_trace_roots MODIFY SETTING index_granularity = 4096;
ALTER TABLE otel_trace_roots ADD INDEX IF NOT EXISTS idx_svc service_name TYPE bloom_filter(0.01) GRANULARITY 4;

-- otel_spans: ZSTD on all string columns, bloom filter on service and trace_id.
ALTER TABLE otel_spans MODIFY COLUMN trace_id      String CODEC(ZSTD(1));
ALTER TABLE otel_spans MODIFY COLUMN span_id       String CODEC(ZSTD(1));
ALTER TABLE otel_spans MODIFY COLUMN parent_span_id String CODEC(ZSTD(1));
ALTER TABLE otel_spans MODIFY COLUMN service_name  String CODEC(ZSTD(1));
ALTER TABLE otel_spans MODIFY COLUMN name          String CODEC(ZSTD(1));
ALTER TABLE otel_spans MODIFY COLUMN resource_attributes Map(String,String) CODEC(ZSTD(1));
ALTER TABLE otel_spans MODIFY COLUMN span_attributes     Map(String,String) CODEC(ZSTD(1));
ALTER TABLE otel_spans MODIFY SETTING index_granularity = 4096;
ALTER TABLE otel_spans ADD INDEX IF NOT EXISTS idx_svc service_name TYPE bloom_filter(0.01) GRANULARITY 4;
