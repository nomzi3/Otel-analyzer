package db

import (
	"context"
	"fmt"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
)

// MetricRow maps to the otel_metrics ClickHouse table.
type MetricRow struct {
	Timestamp          time.Time         `json:"timestamp"`
	MetricName         string            `json:"metric_name"`
	MetricType         string            `json:"metric_type"`
	Value              float64           `json:"value"`
	ServiceName        string            `json:"service_name"`
	ResourceAttributes map[string]string `json:"resource_attributes"`
	MetricAttributes   map[string]string `json:"metric_attributes"`
}

// InsertMetrics batch-inserts metric rows into otel_metrics.
func InsertMetrics(ctx context.Context, conn driver.Conn, rows []MetricRow) error {
	batch, err := conn.PrepareBatch(ctx,
		`INSERT INTO otel_metrics (
			timestamp, metric_name, metric_type, value, service_name,
			resource_attributes, metric_attributes
		) VALUES`)
	if err != nil {
		return fmt.Errorf("prepare batch: %w", err)
	}
	for _, r := range rows {
		if err := batch.Append(
			r.Timestamp, r.MetricName, r.MetricType, r.Value, r.ServiceName,
			r.ResourceAttributes, r.MetricAttributes,
		); err != nil {
			return fmt.Errorf("append row: %w", err)
		}
	}
	return batch.Send()
}

// QueryMetrics returns metric rows ordered by timestamp DESC with optional filters.
func QueryMetrics(ctx context.Context, conn driver.Conn, limit, offset int, metricName string, services []string) ([]MetricRow, error) {
	query := `SELECT
		timestamp, metric_name, metric_type, value, service_name,
		resource_attributes, metric_attributes
	FROM otel_metrics`

	args := []interface{}{}
	clauses := []string{}
	if metricName != "" {
		clauses = append(clauses, `metric_name = ?`)
		args = append(args, metricName)
	}
	if len(services) > 0 {
		clauses = append(clauses, `service_name IN (?)`)
		args = append(args, services)
	}
	if len(clauses) > 0 {
		query += ` WHERE ` + joinClauses(clauses)
	}
	query += ` ORDER BY timestamp DESC LIMIT ? OFFSET ?`
	args = append(args, limit, offset)

	rows, err := conn.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("query metrics: %w", err)
	}
	defer rows.Close()

	var result []MetricRow
	for rows.Next() {
		var r MetricRow
		if err := rows.Scan(
			&r.Timestamp, &r.MetricName, &r.MetricType, &r.Value, &r.ServiceName,
			&r.ResourceAttributes, &r.MetricAttributes,
		); err != nil {
			return nil, fmt.Errorf("scan row: %w", err)
		}
		result = append(result, r)
	}
	return result, rows.Err()
}


// TruncateMetrics removes all rows from otel_metrics.
func TruncateMetrics(ctx context.Context, conn driver.Conn) error {
	return conn.Exec(ctx, `TRUNCATE TABLE otel_metrics`)
}

// QueryMetricNames returns distinct metric names sorted alphabetically.
func QueryMetricNames(ctx context.Context, conn driver.Conn) ([]string, error) {
	rows, err := conn.Query(ctx, `SELECT DISTINCT metric_name FROM otel_metrics ORDER BY metric_name ASC`)
	if err != nil {
		return nil, fmt.Errorf("query metric names: %w", err)
	}
	defer rows.Close()

	var result []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, fmt.Errorf("scan row: %w", err)
		}
		result = append(result, name)
	}
	return result, rows.Err()
}
