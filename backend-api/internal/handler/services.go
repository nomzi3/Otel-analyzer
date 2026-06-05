package handler

import (
	"encoding/json"
	"net/http"

	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
	"github.com/otel-analyzer/backend-api/internal/db"
)

func GetServices(conn driver.Conn) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		names, err := db.QueryServices(r.Context(), conn)
		if err != nil {
			http.Error(w, "query failed: "+err.Error(), http.StatusInternalServerError)
			return
		}
		if names == nil {
			names = []string{}
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(names)
	}
}

func GetResourceAttributeKeys(conn driver.Conn) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		keys, err := db.QueryResourceAttributeKeys(r.Context(), conn)
		if err != nil {
			http.Error(w, "query failed: "+err.Error(), http.StatusInternalServerError)
			return
		}
		if keys == nil {
			keys = []string{}
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(keys)
	}
}
