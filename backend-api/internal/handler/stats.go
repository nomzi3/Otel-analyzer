package handler

import (
	"net/http"

	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
	"github.com/otel-analyzer/backend-api/internal/db"
)

type StatsResponse struct {
	Logs    LogsStats    `json:"logs"`
	Metrics MetricsStats `json:"metrics"`
	Traces  TracesStats  `json:"traces"`
}

type LogsStats struct {
	TotalCount       uint64            `json:"total_count"`
	DistinctServices uint64            `json:"distinct_services"`
	TopByRate        []ServiceRate     `json:"top_by_rate"`
	TopByDebugInfo   []db.ServiceCount `json:"top_by_debug_info"`
}

type MetricsStats struct {
	TotalCount       uint64              `json:"total_count"`
	DistinctServices uint64              `json:"distinct_services"`
	TopByRate        []ServiceRate       `json:"top_by_rate"`
	TopByAvgAttr     []db.ServiceAvgAttr `json:"top_by_avg_attr"`
}

type TracesStats struct {
	TotalCount       uint64            `json:"total_count"`
	DistinctServices uint64            `json:"distinct_services"`
	TopByRootSpans   []db.ServiceCount `json:"top_by_root_spans"`
	TopByRate        []ServiceRate     `json:"top_by_rate"`
}

func GetStats(conn driver.Conn, prometheusURL string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		var out StatsResponse

		out.Logs.TotalCount, _ = db.QueryLogsTotalCount(ctx, conn)
		out.Logs.DistinctServices, _ = db.QueryLogsDistinctServices(ctx, conn)
		out.Logs.TopByRate, _ = queryTopKRates(prometheusURL,
			`topk(3, sum(rate(gateway_logs_received_total[1m])) by (service_name))`)
		out.Logs.TopByDebugInfo, _ = db.QueryLogsTopByDebugInfo(ctx, conn)

		out.Metrics.TotalCount, _ = db.QueryMetricsTotalCount(ctx, conn)
		out.Metrics.DistinctServices, _ = db.QueryMetricsDistinctServices(ctx, conn)
		out.Metrics.TopByRate, _ = queryTopKRates(prometheusURL,
			`topk(3, sum(rate(gateway_datapoints_received_total[1m])) by (service_name))`)
		out.Metrics.TopByAvgAttr, _ = db.QueryMetricsTopByAvgAttr(ctx, conn)

		out.Traces.TotalCount, _ = db.QuerySpansTotalCount(ctx, conn)
		out.Traces.DistinctServices, _ = db.QuerySpansDistinctServices(ctx, conn)
		out.Traces.TopByRootSpans, _ = db.QueryTracesTopByRootSpans(ctx, conn)
		out.Traces.TopByRate, _ = queryTopKRates(prometheusURL,
			`topk(3, sum(rate(gateway_spans_received_total[1m])) by (service_name))`)

		writeJSON(w, out)
	}
}
