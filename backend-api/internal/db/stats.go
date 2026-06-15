package db

import (
	"context"
	"fmt"

	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
)

// ServiceCount is a (service_name, count) pair used across signal types.
type ServiceCount struct {
	ServiceName string `json:"service_name"`
	Count       uint64 `json:"count"`
}

// ServiceAvgAttr is a (service_name, avg_attr_count) pair for the metrics section.
type ServiceAvgAttr struct {
	ServiceName  string  `json:"service_name"`
	AvgAttrCount float64 `json:"avg_attr_count"`
}

func queryScalarUint64(ctx context.Context, conn driver.Conn, query string) (uint64, error) {
	rows, err := conn.Query(ctx, query)
	if err != nil {
		return 0, fmt.Errorf("%s: %w", query, err)
	}
	defer rows.Close()
	var n uint64
	if rows.Next() {
		if err := rows.Scan(&n); err != nil {
			return 0, fmt.Errorf("scan: %w", err)
		}
	}
	return n, rows.Err()
}

func QueryLogsTotalCount(ctx context.Context, conn driver.Conn) (uint64, error) {
	return queryScalarUint64(ctx, conn, `SELECT count() FROM otel_logs`)
}

func QueryLogsDistinctServices(ctx context.Context, conn driver.Conn) (uint64, error) {
	return queryScalarUint64(ctx, conn, `SELECT count(DISTINCT service_name) FROM otel_logs`)
}

func QueryLogsTopByDebugInfo(ctx context.Context, conn driver.Conn) ([]ServiceCount, error) {
	rows, err := conn.Query(ctx,
		`SELECT service_name, count() AS cnt FROM otel_logs
		WHERE severity_text IN ('DEBUG', 'INFO') AND service_name != ''
		GROUP BY service_name ORDER BY cnt DESC LIMIT 3`)
	if err != nil {
		return nil, fmt.Errorf("query logs top debug/info: %w", err)
	}
	defer rows.Close()
	var result []ServiceCount
	for rows.Next() {
		var r ServiceCount
		if err := rows.Scan(&r.ServiceName, &r.Count); err != nil {
			return nil, fmt.Errorf("scan: %w", err)
		}
		result = append(result, r)
	}
	return result, rows.Err()
}

func QueryMetricsTotalCount(ctx context.Context, conn driver.Conn) (uint64, error) {
	return queryScalarUint64(ctx, conn, `SELECT count() FROM otel_metrics`)
}

func QueryMetricsDistinctServices(ctx context.Context, conn driver.Conn) (uint64, error) {
	return queryScalarUint64(ctx, conn, `SELECT count(DISTINCT service_name) FROM otel_metrics`)
}

func QueryMetricsTopByAvgAttr(ctx context.Context, conn driver.Conn) ([]ServiceAvgAttr, error) {
	rows, err := conn.Query(ctx,
		`SELECT service_name,
			avg(length(mapKeys(resource_attributes)) + length(mapKeys(metric_attributes))) AS avg_attr_count
		FROM otel_metrics WHERE service_name != ''
		GROUP BY service_name ORDER BY avg_attr_count DESC LIMIT 3`)
	if err != nil {
		return nil, fmt.Errorf("query metrics top avg attr: %w", err)
	}
	defer rows.Close()
	var result []ServiceAvgAttr
	for rows.Next() {
		var r ServiceAvgAttr
		if err := rows.Scan(&r.ServiceName, &r.AvgAttrCount); err != nil {
			return nil, fmt.Errorf("scan: %w", err)
		}
		result = append(result, r)
	}
	return result, rows.Err()
}

func QuerySpansTotalCount(ctx context.Context, conn driver.Conn) (uint64, error) {
	return queryScalarUint64(ctx, conn, `SELECT count() FROM otel_spans`)
}

func QuerySpansDistinctServices(ctx context.Context, conn driver.Conn) (uint64, error) {
	return queryScalarUint64(ctx, conn, `SELECT count(DISTINCT service_name) FROM otel_spans`)
}

func QueryTracesTopByRootSpans(ctx context.Context, conn driver.Conn) ([]ServiceCount, error) {
	rows, err := conn.Query(ctx,
		`SELECT service_name, count() AS cnt FROM otel_trace_roots
		WHERE service_name != ''
		GROUP BY service_name ORDER BY cnt DESC LIMIT 3`)
	if err != nil {
		return nil, fmt.Errorf("query traces top root spans: %w", err)
	}
	defer rows.Close()
	var result []ServiceCount
	for rows.Next() {
		var r ServiceCount
		if err := rows.Scan(&r.ServiceName, &r.Count); err != nil {
			return nil, fmt.Errorf("scan: %w", err)
		}
		result = append(result, r)
	}
	return result, rows.Err()
}
