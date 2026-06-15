package handler

import (
	"encoding/json"
	"net/http"

	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
	"github.com/otel-analyzer/backend-api/internal/db"
)

func PostMetrics(conn driver.Conn) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var rows []db.MetricRow
		if err := json.NewDecoder(r.Body).Decode(&rows); err != nil {
			http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
			return
		}
		if err := db.InsertMetrics(r.Context(), conn, rows); err != nil {
			http.Error(w, "insert failed: "+err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

func GetMetrics(conn driver.Conn) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		limit := clampLimit(r.URL.Query().Get("limit"), 100)
		offset := parseInt(r.URL.Query().Get("offset"), 0)
		metricName := r.URL.Query().Get("metric_name")
		services := parseServices(r.URL.Query().Get("services"))

		resourceAttrKey := r.URL.Query().Get("resource_attr_key")
		rows, err := db.QueryMetrics(r.Context(), conn, limit, offset, metricName, services, resourceAttrKey)
		if err != nil {
			http.Error(w, "query failed: "+err.Error(), http.StatusInternalServerError)
			return
		}
		if rows == nil {
			rows = []db.MetricRow{}
		}
		writeJSON(w, rows)
	}
}

func GetMetricNames(conn driver.Conn) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		services := parseServices(r.URL.Query().Get("services"))
		resourceAttrKey := r.URL.Query().Get("resource_attr_key")
		names, err := db.QueryMetricNames(r.Context(), conn, services, resourceAttrKey)
		if err != nil {
			http.Error(w, "query failed: "+err.Error(), http.StatusInternalServerError)
			return
		}
		if names == nil {
			names = []string{}
		}
		writeJSON(w, names)
	}
}

func DeleteMetrics(conn driver.Conn) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := db.TruncateMetrics(r.Context(), conn); err != nil {
			http.Error(w, "truncate failed: "+err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}
