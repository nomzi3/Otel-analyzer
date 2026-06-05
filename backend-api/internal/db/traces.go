package db

import (
	"context"
	"fmt"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
)

// TraceRootRow maps to the otel_trace_roots ClickHouse table.
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

// SpanRow maps to the otel_spans ClickHouse table.
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

// InsertTraceRoots batch-inserts trace root rows into otel_trace_roots.
func InsertTraceRoots(ctx context.Context, conn driver.Conn, rows []TraceRootRow) error {
	batch, err := conn.PrepareBatch(ctx,
		`INSERT INTO otel_trace_roots (
			trace_id, root_span_id, service_name, root_name,
			start_time, end_time, duration_ms, status_code,
			resource_attributes, span_attributes
		) VALUES`)
	if err != nil {
		return fmt.Errorf("prepare batch: %w", err)
	}
	for _, r := range rows {
		if err := batch.Append(
			r.TraceID, r.RootSpanID, r.ServiceName, r.RootName,
			r.StartTime, r.EndTime, r.DurationMs, r.StatusCode,
			r.ResourceAttributes, r.SpanAttributes,
		); err != nil {
			return fmt.Errorf("append row: %w", err)
		}
	}
	return batch.Send()
}

// InsertSpans batch-inserts span rows into otel_spans.
func InsertSpans(ctx context.Context, conn driver.Conn, rows []SpanRow) error {
	batch, err := conn.PrepareBatch(ctx,
		`INSERT INTO otel_spans (
			trace_id, span_id, parent_span_id, service_name, name,
			start_time, end_time, duration_ms, status_code,
			resource_attributes, span_attributes
		) VALUES`)
	if err != nil {
		return fmt.Errorf("prepare batch: %w", err)
	}
	for _, r := range rows {
		if err := batch.Append(
			r.TraceID, r.SpanID, r.ParentSpanID, r.ServiceName, r.Name,
			r.StartTime, r.EndTime, r.DurationMs, r.StatusCode,
			r.ResourceAttributes, r.SpanAttributes,
		); err != nil {
			return fmt.Errorf("append row: %w", err)
		}
	}
	return batch.Send()
}

// QueryTraces returns trace root rows ordered by start_time DESC with optional service filter.
func QueryTraces(ctx context.Context, conn driver.Conn, limit, offset int, serviceFilter string) ([]TraceRootRow, error) {
	query := `SELECT
		trace_id, root_span_id, service_name, root_name,
		start_time, end_time, duration_ms, status_code,
		resource_attributes, span_attributes
	FROM otel_trace_roots`

	args := []interface{}{}
	if serviceFilter != "" {
		query += ` WHERE service_name = ?`
		args = append(args, serviceFilter)
	}
	query += ` ORDER BY start_time DESC LIMIT ? OFFSET ?`
	args = append(args, limit, offset)

	rows, err := conn.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("query traces: %w", err)
	}
	defer rows.Close()

	var result []TraceRootRow
	for rows.Next() {
		var r TraceRootRow
		if err := rows.Scan(
			&r.TraceID, &r.RootSpanID, &r.ServiceName, &r.RootName,
			&r.StartTime, &r.EndTime, &r.DurationMs, &r.StatusCode,
			&r.ResourceAttributes, &r.SpanAttributes,
		); err != nil {
			return nil, fmt.Errorf("scan row: %w", err)
		}
		result = append(result, r)
	}
	return result, rows.Err()
}

// QuerySpans returns all spans for a given traceID.
func QuerySpans(ctx context.Context, conn driver.Conn, traceID string) ([]SpanRow, error) {
	query := `SELECT
		trace_id, span_id, parent_span_id, service_name, name,
		start_time, end_time, duration_ms, status_code,
		resource_attributes, span_attributes
	FROM otel_spans
	WHERE trace_id = ?
	ORDER BY start_time ASC`

	rows, err := conn.Query(ctx, query, traceID)
	if err != nil {
		return nil, fmt.Errorf("query spans: %w", err)
	}
	defer rows.Close()

	var result []SpanRow
	for rows.Next() {
		var r SpanRow
		if err := rows.Scan(
			&r.TraceID, &r.SpanID, &r.ParentSpanID, &r.ServiceName, &r.Name,
			&r.StartTime, &r.EndTime, &r.DurationMs, &r.StatusCode,
			&r.ResourceAttributes, &r.SpanAttributes,
		); err != nil {
			return nil, fmt.Errorf("scan row: %w", err)
		}
		result = append(result, r)
	}
	return result, rows.Err()
}

// TruncateTraces removes all rows from both otel_trace_roots and otel_spans.
func TruncateTraces(ctx context.Context, conn driver.Conn) error {
	if err := conn.Exec(ctx, `TRUNCATE TABLE otel_trace_roots`); err != nil {
		return err
	}
	return conn.Exec(ctx, `TRUNCATE TABLE otel_spans`)
}
