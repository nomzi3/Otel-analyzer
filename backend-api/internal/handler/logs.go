package handler

import (
	"encoding/json"
	"net/http"

	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
	"github.com/otel-analyzer/backend-api/internal/db"
)

// LogsHandler returns an http.Handler for /v1/logs routes.
// conn is closed over from main.
func PostLogs(conn driver.Conn) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var rows []db.LogRow
		if err := json.NewDecoder(r.Body).Decode(&rows); err != nil {
			http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
			return
		}
		if err := db.InsertLogs(r.Context(), conn, rows); err != nil {
			http.Error(w, "insert failed: "+err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

func GetLogs(conn driver.Conn) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		limit := clampLimit(r.URL.Query().Get("limit"), 100)
		offset := parseInt(r.URL.Query().Get("offset"), 0)
		services := parseServices(r.URL.Query().Get("services"))
		logPattern := r.URL.Query().Get("log_pattern")
		severity := r.URL.Query().Get("severity")

		resourceAttrKey := r.URL.Query().Get("resource_attr_key")
		rows, err := db.QueryLogs(r.Context(), conn, limit, offset, services, logPattern, severity, resourceAttrKey)
		if err != nil {
			http.Error(w, "query failed: "+err.Error(), http.StatusInternalServerError)
			return
		}
		if rows == nil {
			rows = []db.LogRow{}
		}
		writeJSON(w, rows)
	}
}

func GetLogPatterns(conn driver.Conn) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		services := parseServices(r.URL.Query().Get("services"))
		severity := r.URL.Query().Get("severity")
		resourceAttrKey := r.URL.Query().Get("resource_attr_key")
		rows, err := db.QueryLogPatterns(r.Context(), conn, services, severity, resourceAttrKey)
		if err != nil {
			http.Error(w, "query failed: "+err.Error(), http.StatusInternalServerError)
			return
		}
		if rows == nil {
			rows = []db.LogPatternRow{}
		}
		writeJSON(w, rows)
	}
}

func GetLogSeverities(conn driver.Conn) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		services := parseServices(r.URL.Query().Get("services"))
		resourceAttrKey := r.URL.Query().Get("resource_attr_key")
		severities, err := db.QueryLogSeverities(r.Context(), conn, services, resourceAttrKey)
		if err != nil {
			http.Error(w, "query failed: "+err.Error(), http.StatusInternalServerError)
			return
		}
		if severities == nil {
			severities = []string{}
		}
		writeJSON(w, severities)
	}
}

func GetLogServices(conn driver.Conn) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		severity := r.URL.Query().Get("severity")
		resourceAttrKey := r.URL.Query().Get("resource_attr_key")
		services, err := db.QueryLogServices(r.Context(), conn, severity, resourceAttrKey)
		if err != nil {
			http.Error(w, "query failed: "+err.Error(), http.StatusInternalServerError)
			return
		}
		if services == nil {
			services = []string{}
		}
		writeJSON(w, services)
	}
}

func DeleteLogs(conn driver.Conn) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := db.TruncateLogs(r.Context(), conn); err != nil {
			http.Error(w, "truncate failed: "+err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

