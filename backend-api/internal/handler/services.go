package handler

import (
	"net/http"

	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
	"github.com/otel-analyzer/backend-api/internal/db"
)

func GetServices(conn driver.Conn) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		resourceAttrKey := r.URL.Query().Get("resource_attr_key")
		names, err := db.QueryServices(r.Context(), conn, resourceAttrKey)
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

func GetResourceAttributeKeys(conn driver.Conn) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		services := parseServices(r.URL.Query().Get("services"))
		keys, err := db.QueryResourceAttributeKeys(r.Context(), conn, services)
		if err != nil {
			http.Error(w, "query failed: "+err.Error(), http.StatusInternalServerError)
			return
		}
		if keys == nil {
			keys = []string{}
		}
		writeJSON(w, keys)
	}
}

func GetResourceAttributeValues(conn driver.Conn) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		key := r.URL.Query().Get("key")
		if key == "" {
			http.Error(w, "key parameter is required", http.StatusBadRequest)
			return
		}
		services := parseServices(r.URL.Query().Get("services"))
		values, err := db.QueryResourceAttributeValues(r.Context(), conn, key, services)
		if err != nil {
			http.Error(w, "query failed: "+err.Error(), http.StatusInternalServerError)
			return
		}
		if values == nil {
			values = []string{}
		}
		writeJSON(w, values)
	}
}
