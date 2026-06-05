package db

import (
	"context"
	"fmt"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
)

// LogRow maps to the otel_logs ClickHouse table.
// service_name is a MATERIALIZED column and must NOT be inserted.
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

// InsertLogs batch-inserts log rows into otel_logs.
func InsertLogs(ctx context.Context, conn driver.Conn, rows []LogRow) error {
	batch, err := conn.PrepareBatch(ctx,
		`INSERT INTO otel_logs (
			timestamp, observed_timestamp, trace_id, span_id,
			severity_number, severity_text, body, log_pattern,
			resource_attributes, scope_attributes, log_attributes
		) VALUES`)
	if err != nil {
		return fmt.Errorf("prepare batch: %w", err)
	}
	for _, r := range rows {
		if err := batch.Append(
			r.Timestamp, r.ObservedTimestamp, r.TraceID, r.SpanID,
			r.SeverityNumber, r.SeverityText, r.Body, r.LogPattern,
			r.ResourceAttributes, r.ScopeAttributes, r.LogAttributes,
		); err != nil {
			return fmt.Errorf("append row: %w", err)
		}
	}
	return batch.Send()
}

// QueryLogs returns log rows ordered by timestamp DESC with optional service filter.
func QueryLogs(ctx context.Context, conn driver.Conn, limit, offset int, serviceFilter string) ([]LogRow, error) {
	query := `SELECT
		timestamp, observed_timestamp, trace_id, span_id,
		severity_number, severity_text, body, log_pattern,
		resource_attributes, scope_attributes, log_attributes
	FROM otel_logs`

	args := []interface{}{}
	if serviceFilter != "" {
		query += ` WHERE service_name = ?`
		args = append(args, serviceFilter)
	}
	query += ` ORDER BY timestamp DESC LIMIT ? OFFSET ?`
	args = append(args, limit, offset)

	rows, err := conn.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("query logs: %w", err)
	}
	defer rows.Close()

	var result []LogRow
	for rows.Next() {
		var r LogRow
		if err := rows.Scan(
			&r.Timestamp, &r.ObservedTimestamp, &r.TraceID, &r.SpanID,
			&r.SeverityNumber, &r.SeverityText, &r.Body, &r.LogPattern,
			&r.ResourceAttributes, &r.ScopeAttributes, &r.LogAttributes,
		); err != nil {
			return nil, fmt.Errorf("scan row: %w", err)
		}
		result = append(result, r)
	}
	return result, rows.Err()
}

// TruncateLogs removes all rows from otel_logs.
func TruncateLogs(ctx context.Context, conn driver.Conn) error {
	return conn.Exec(ctx, `TRUNCATE TABLE otel_logs`)
}
