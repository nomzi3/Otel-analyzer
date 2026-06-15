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
	ServiceName        string            `json:"service_name"`
	ResourceAttributes map[string]string `json:"resource_attributes"`
	ScopeAttributes    map[string]string `json:"scope_attributes"`
	LogAttributes      map[string]string `json:"log_attributes"`
}

// LogPatternRow holds aggregated log pattern counts per service.
type LogPatternRow struct {
	Pattern     string `json:"pattern"`
	ServiceName string `json:"service_name"`
	Count       uint64 `json:"count"`
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

// QueryLogs returns log rows ordered by timestamp DESC with optional filters.
func QueryLogs(ctx context.Context, conn driver.Conn, limit, offset int, services []string, logPattern, severity, resourceAttrKey string) ([]LogRow, error) {
	query := `SELECT
		timestamp, observed_timestamp, trace_id, span_id,
		severity_number, severity_text, body, log_pattern, service_name,
		resource_attributes, scope_attributes, log_attributes
	FROM otel_logs`

	args := []interface{}{}
	clauses := []string{}
	if len(services) > 0 {
		clauses = append(clauses, `service_name IN (?)`)
		args = append(args, services)
	}
	if logPattern != "" {
		clauses = append(clauses, `log_pattern = ?`)
		args = append(args, logPattern)
	}
	if severity != "" {
		clauses = append(clauses, `severity_text = ?`)
		args = append(args, severity)
	}
	if resourceAttrKey != "" {
		clauses = append(clauses, `mapContains(resource_attributes, ?)`)
		args = append(args, resourceAttrKey)
	}
	if len(clauses) > 0 {
		query += ` WHERE ` + joinClauses(clauses)
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
			&r.SeverityNumber, &r.SeverityText, &r.Body, &r.LogPattern, &r.ServiceName,
			&r.ResourceAttributes, &r.ScopeAttributes, &r.LogAttributes,
		); err != nil {
			return nil, fmt.Errorf("scan row: %w", err)
		}
		result = append(result, r)
	}
	return result, rows.Err()
}

// QueryLogPatterns returns distinct (log_pattern, service_name) pairs with counts, optionally filtered by severity.
func QueryLogPatterns(ctx context.Context, conn driver.Conn, services []string, severity, resourceAttrKey string) ([]LogPatternRow, error) {
	query := `SELECT log_pattern, service_name, count() AS cnt FROM otel_logs`
	args := []interface{}{}
	clauses := []string{}
	if len(services) > 0 {
		clauses = append(clauses, `service_name IN (?)`)
		args = append(args, services)
	}
	if severity != "" {
		clauses = append(clauses, `severity_text = ?`)
		args = append(args, severity)
	}
	if resourceAttrKey != "" {
		clauses = append(clauses, `mapContains(resource_attributes, ?)`)
		args = append(args, resourceAttrKey)
	}
	if len(clauses) > 0 {
		query += ` WHERE ` + joinClauses(clauses)
	}
	query += ` GROUP BY log_pattern, service_name ORDER BY cnt DESC`

	rows, err := conn.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("query log patterns: %w", err)
	}
	defer rows.Close()

	var result []LogPatternRow
	for rows.Next() {
		var r LogPatternRow
		if err := rows.Scan(&r.Pattern, &r.ServiceName, &r.Count); err != nil {
			return nil, fmt.Errorf("scan row: %w", err)
		}
		result = append(result, r)
	}
	return result, rows.Err()
}

// QueryLogSeverities returns distinct severity_text values, optionally filtered by services or resource attribute key.
func QueryLogSeverities(ctx context.Context, conn driver.Conn, services []string, resourceAttrKey string) ([]string, error) {
	query := `SELECT DISTINCT severity_text FROM otel_logs WHERE severity_text != ''`
	args := []interface{}{}
	if len(services) > 0 {
		query += ` AND service_name IN (?)`
		args = append(args, services)
	}
	if resourceAttrKey != "" {
		query += ` AND mapContains(resource_attributes, ?)`
		args = append(args, resourceAttrKey)
	}
	query += ` ORDER BY severity_text ASC`

	rows, err := conn.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("query log severities: %w", err)
	}
	defer rows.Close()

	var result []string
	for rows.Next() {
		var s string
		if err := rows.Scan(&s); err != nil {
			return nil, fmt.Errorf("scan row: %w", err)
		}
		result = append(result, s)
	}
	return result, rows.Err()
}

// QueryLogServices returns distinct service_name values filtered by severity and/or resource attribute key.
func QueryLogServices(ctx context.Context, conn driver.Conn, severity, resourceAttrKey string) ([]string, error) {
	query := `SELECT DISTINCT service_name FROM otel_logs WHERE service_name != ''`
	args := []interface{}{}
	if severity != "" {
		query += ` AND severity_text = ?`
		args = append(args, severity)
	}
	if resourceAttrKey != "" {
		query += ` AND mapContains(resource_attributes, ?)`
		args = append(args, resourceAttrKey)
	}
	query += ` ORDER BY service_name ASC`

	rows, err := conn.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("query log services: %w", err)
	}
	defer rows.Close()

	var result []string
	for rows.Next() {
		var s string
		if err := rows.Scan(&s); err != nil {
			return nil, fmt.Errorf("scan row: %w", err)
		}
		result = append(result, s)
	}
	return result, rows.Err()
}


// TruncateLogs removes all rows from otel_logs.
func TruncateLogs(ctx context.Context, conn driver.Conn) error {
	return conn.Exec(ctx, `TRUNCATE TABLE otel_logs`)
}
