package consumer

import (
	"context"
	"fmt"

	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"

	"github.com/otel-analyzer/backend-ingester/internal/types"
)

func insertLogs(ctx context.Context, conn driver.Conn, rows []types.LogRow) error {
	batch, err := conn.PrepareBatch(ctx,
		`INSERT INTO otel_logs (
			timestamp, observed_timestamp, trace_id, span_id,
			severity_number, severity_text, body, log_pattern,
			resource_attributes, scope_attributes, log_attributes
		) VALUES`)
	if err != nil {
		return fmt.Errorf("prepare logs batch: %w", err)
	}
	for _, r := range rows {
		if err := batch.Append(
			r.Timestamp, r.ObservedTimestamp, r.TraceID, r.SpanID,
			r.SeverityNumber, r.SeverityText, r.Body, r.LogPattern,
			r.ResourceAttributes, r.ScopeAttributes, r.LogAttributes,
		); err != nil {
			return fmt.Errorf("append log row: %w", err)
		}
	}
	return batch.Send()
}

func insertMetrics(ctx context.Context, conn driver.Conn, rows []types.MetricRow) error {
	batch, err := conn.PrepareBatch(ctx,
		`INSERT INTO otel_metrics (
			timestamp, metric_name, metric_type, value,
			service_name, resource_attributes, metric_attributes
		) VALUES`)
	if err != nil {
		return fmt.Errorf("prepare metrics batch: %w", err)
	}
	for _, r := range rows {
		if err := batch.Append(
			r.Timestamp, r.MetricName, r.MetricType, r.Value,
			r.ServiceName, r.ResourceAttributes, r.MetricAttributes,
		); err != nil {
			return fmt.Errorf("append metric row: %w", err)
		}
	}
	return batch.Send()
}

func insertTraceRoots(ctx context.Context, conn driver.Conn, rows []types.TraceRootRow) error {
	batch, err := conn.PrepareBatch(ctx,
		`INSERT INTO otel_trace_roots (
			trace_id, root_span_id, service_name, root_name,
			start_time, end_time, duration_ms, status_code,
			resource_attributes, span_attributes
		) VALUES`)
	if err != nil {
		return fmt.Errorf("prepare trace roots batch: %w", err)
	}
	for _, r := range rows {
		if err := batch.Append(
			r.TraceID, r.RootSpanID, r.ServiceName, r.RootName,
			r.StartTime, r.EndTime, r.DurationMs, r.StatusCode,
			r.ResourceAttributes, r.SpanAttributes,
		); err != nil {
			return fmt.Errorf("append trace root row: %w", err)
		}
	}
	return batch.Send()
}

func insertSpans(ctx context.Context, conn driver.Conn, rows []types.SpanRow) error {
	batch, err := conn.PrepareBatch(ctx,
		`INSERT INTO otel_spans (
			trace_id, span_id, parent_span_id, service_name, name,
			start_time, end_time, duration_ms, status_code,
			resource_attributes, span_attributes
		) VALUES`)
	if err != nil {
		return fmt.Errorf("prepare spans batch: %w", err)
	}
	for _, r := range rows {
		if err := batch.Append(
			r.TraceID, r.SpanID, r.ParentSpanID, r.ServiceName, r.Name,
			r.StartTime, r.EndTime, r.DurationMs, r.StatusCode,
			r.ResourceAttributes, r.SpanAttributes,
		); err != nil {
			return fmt.Errorf("append span row: %w", err)
		}
	}
	return batch.Send()
}
