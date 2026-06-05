package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

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
		service := r.URL.Query().Get("service")

		rows, err := db.QueryLogs(r.Context(), conn, limit, offset, service)
		if err != nil {
			http.Error(w, "query failed: "+err.Error(), http.StatusInternalServerError)
			return
		}
		if rows == nil {
			rows = []db.LogRow{}
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(rows)
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

// helpers shared across handler files
func clampLimit(s string, defaultVal int) int {
	v := parseInt(s, defaultVal)
	if v <= 0 {
		return defaultVal
	}
	if v > 1000 {
		return 1000
	}
	return v
}

func parseInt(s string, defaultVal int) int {
	if s == "" {
		return defaultVal
	}
	v, err := strconv.Atoi(s)
	if err != nil {
		return defaultVal
	}
	return v
}
